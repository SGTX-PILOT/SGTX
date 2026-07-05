// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { callAI } from "@/lib/sgtx/ai/orchestrator";

// SGTX Anomaly Detection (Blueprint Part 19)
// POST /api/sgtx/trade-memory/anomaly — detect + log an anomaly.
//
// Body: { entityType, entityRef, severity, anomalyType, description }
// severity:   LOW | MEDIUM | HIGH | CRITICAL
// entityType: trade | tenant | shipment | payment | ... (free-form)
// entityRef:  any identifier (USTN, GTID, shipment id, etc.)
//
// Flow:
//   1. Persist the AnomalyDetectionLog (aiSummary may be filled by AI).
//   2. Call AI (anomaly_summary agent) for a plain-language summary.
//   3. Update the log with the AI summary.
//   4. If severity ∈ {HIGH, CRITICAL}, drop a Smart Inbox item (priority 90)
//      for every ADM-type tenant.

const VALID_SEVERITIES = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

const SEVERITY_RANK: Record<string, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

function inboxTitle(severity: string, anomalyType: string): string {
  const tag = severity === "CRITICAL" ? "🚨 CRITICAL" : "⚠️ HIGH";
  return `${tag} anomaly — ${anomalyType}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { entityType, entityRef, severity, anomalyType, description } = body as {
      entityType?: string;
      entityRef?: string;
      severity?: string;
      anomalyType?: string;
      description?: string;
    };

    // ── Validate ─────────────────────────────────────────────────
    if (!entityType || typeof entityType !== "string") {
      return NextResponse.json({ error: "entityType is required (string)" }, { status: 400 });
    }
    if (!entityRef || typeof entityRef !== "string") {
      return NextResponse.json({ error: "entityRef is required (string)" }, { status: 400 });
    }
    if (!severity || !VALID_SEVERITIES.has(severity)) {
      return NextResponse.json(
        { error: `severity must be one of: ${[...VALID_SEVERITIES].join(", ")}` },
        { status: 400 },
      );
    }
    if (!anomalyType || typeof anomalyType !== "string") {
      return NextResponse.json({ error: "anomalyType is required (string)" }, { status: 400 });
    }
    if (!description || typeof description !== "string") {
      return NextResponse.json({ error: "description is required (string)" }, { status: 400 });
    }

    // ── Persist anomaly log first ────────────────────────────────
    // The AI summary is generated async, then back-filled — this guarantees
    // we never lose the anomaly record even if the AI call fails.
    const anomaly = await db.anomalyDetectionLog.create({
      data: {
        entityType,
        entityRef,
        severity,
        anomalyType,
        description: description.slice(0, 2000),
        aiSummary: null,
        resolvedAt: null,
      },
    });

    // ── AI plain-language summary ────────────────────────────────
    let aiSummary: string | null = null;
    try {
      const aiRes = await callAI({
        agent: "anomaly_summary",
        prompt: `Anomaly detected on SGTX.
Entity type: ${entityType}
Entity ref: ${entityRef}
Severity: ${severity}
Anomaly type: ${anomalyType}
Raw description: ${description.slice(0, 800)}

Produce a plain-language summary (max 2 sentences, ~40 words) including the most likely cause and the first remediation step. Do not expose internal IDs.`,
      });
      aiSummary = aiRes.content?.trim().slice(0, 600) || null;
    } catch (e) {
      logger.warn("[trade-memory/anomaly] AI summary failed:", e);
    }

    if (aiSummary) {
      await db.anomalyDetectionLog.update({
        where: { id: anomaly.id },
        data: { aiSummary },
      });
      anomaly.aiSummary = aiSummary;
    }

    // ── Smart Inbox for HIGH / CRITICAL ──────────────────────────
    if (SEVERITY_RANK[severity] >= SEVERITY_RANK.HIGH) {
      try {
        const admins = await db.tenant.findMany({
          where: { type: "ADM", lifecycleState: { not: "EXITED" } },
          select: { gtid: true },
        });

        if (admins.length > 0) {
          const summaryText = aiSummary || description.slice(0, 200);
          await Promise.all(
            admins.map((a) =>
              db.inboxItem.create({
                data: {
                  tenantGtid: a.gtid,
                  category: "GENERAL",
                  priority: 90,
                  title: inboxTitle(severity, anomalyType).slice(0, 200),
                  description: `${entityType} ${entityRef}: ${summaryText}`.slice(0, 500),
                  ctaLabel: "Investigate",
                },
              }),
            ),
          );
        } else {
          logger.warn(
            "[trade-memory/anomaly] no ADM tenants found — admin inbox notification skipped",
          );
        }
      } catch (inboxErr) {
        logger.warn("[trade-memory/anomaly] admin inbox write failed:", inboxErr);
      }
    }

    return NextResponse.json({ ok: true, anomalyId: anomaly.id });
  } catch (e: any) {
    logger.error("[trade-memory/anomaly] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to log anomaly" },
      { status: 500 },
    );
  }
}

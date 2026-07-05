import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { createHash } from "crypto";
import { auditFullLoomChain } from "@/lib/sgtx/governor";

// POST /api/sgtx/governor/audit-cron
// Blueprint Part 1.6 — hourly audit-chain-verifier job.
// Recomputes the full Loom hash chain from genesis and compares with stored
// hashes. Any mismatch raises a P0 Incident and a priority-100 Smart Inbox
// item to the Platform Governance Authority (SGTX-EG-GOV-000001-9A0B).
//
// Body (optional): { triggeredBy?: "cron" | "admin" }
// Returns: { chainVerified, decisionCount, genesisHash, latestHash, mismatches[] }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const triggeredBy = (body?.triggeredBy as string) || "cron";

    const audit = await auditFullLoomChain();

    // If the chain is intact, return immediately — no incident needed.
    if (audit.chainVerified) {
      return NextResponse.json({
        chainVerified: true,
        decisionCount: audit.decisionCount,
        genesisHash: audit.genesisHash,
        latestHash: audit.latestHash,
        mismatches: [],
        triggeredBy,
        auditedAt: new Date().toISOString(),
      });
    }

    // ── Chain integrity failure → P0 Incident + Smart Inbox (priority 100) ──
    const PLATFORM_GOVERNANCE_AUTHORITY = "SGTX-EG-GOV-000001-9A0B";
    const mismatchSummary = audit.mismatches
      .slice(0, 5)
      .map(
        (m) =>
          `decision ${m.decisionId} (${m.action}): stored=${m.storedHash}, recomputed=${m.recomputedHash}, reason=${m.reason}`,
      )
      .join("; ");

    const incident = await db.incident.create({
      data: {
        severity: "P0",
        status: "OPEN",
        title: "Loom hash chain integrity failure",
        description: `The audit-chain-verifier detected ${audit.mismatches.length} mismatch(es) in the Governor decision hash chain. First mismatches: ${mismatchSummary}`,
        affectedSystems: JSON.stringify(["governor", "loom", "constitutional-engine"]),
        rootCause: "Tamper detection — chain hash(es) do not match recomputed values or previous_hash linkage is broken.",
      },
    });

    // Smart Inbox to Platform Governance Authority (priority 100, COMPLIANCE category)
    await db.inboxItem.create({
      data: {
        tenantGtid: PLATFORM_GOVERNANCE_AUTHORITY,
        category: "COMPLIANCE",
        priority: 100,
        title: "P0 · Loom chain integrity failure detected",
        description:
          `Audit-cron detected ${audit.mismatches.length} mismatch(es) across ${audit.decisionCount} Governor decisions. ` +
          `Incident ${incident.id} opened. Genesis=${audit.genesisHash.slice(0, 24)}…, latest=${(audit.latestHash || "").slice(0, 24)}…. ` +
          `Immediate forensic review required. New trades are paused until chain integrity is restored.`,
        ctaLabel: "Open Incident",
        deadline: new Date(Date.now() + 60 * 60 * 1000), // 1h SLA
      },
    });

    // Loom-anchor the incident itself (Part 1.6 — every Governor decision is Loom-logged)
    const incidentLoomHash =
      "sha256:" +
      createHash("sha256")
        .update(`audit-cron-incident|${incident.id}|${audit.mismatches.length}|${Date.now()}`)
        .digest("hex");

    return NextResponse.json({
      chainVerified: false,
      decisionCount: audit.decisionCount,
      genesisHash: audit.genesisHash,
      latestHash: audit.latestHash,
      mismatches: audit.mismatches,
      incidentId: incident.id,
      incidentSeverity: "P0",
      inboxSentTo: PLATFORM_GOVERNANCE_AUTHORITY,
      inboxPriority: 100,
      incidentLoomHash,
      triggeredBy,
      auditedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    logger.error("[audit-cron] error:", e);
    return NextResponse.json(
      { error: e?.message || "Loom audit failed", chainVerified: false },
      { status: 500 },
    );
  }
}

// GET /api/sgtx/governor/audit-cron — preview audit (read-only, no incident creation)
export async function GET() {
  try {
    const audit = await auditFullLoomChain();
    return NextResponse.json({
      ...audit,
      auditedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Loom audit preview failed" },
      { status: 500 },
    );
  }
}

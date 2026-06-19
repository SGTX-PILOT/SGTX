import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { callAI } from "@/lib/sgtx/ai/orchestrator";

// SGTX Predictive Insights (Blueprint Part 19 — A2)
// POST /api/sgtx/trade-memory/insight — generate a predictive insight.
//
// Body: { tenantGtid?, ustn?, insightType }
// insightType: delay_forecast | default_probability | dispute_likelihood |
//              route_bottleneck | doc_rejection_risk
//
// Flow:
//   1. Pull historical TradeMemoryEvents for the relevant entity.
//   2. Call AI (A2 — predictive_insight agent) to produce a calibrated prediction.
//   3. Persist a PredictiveInsight record.
//   4. Drop a Smart Inbox item (priority 40) with the insight summary and a
//      one-click "View insight" CTA, when a tenantGtid is resolvable.

const VALID_INSIGHT_TYPES = new Set([
  "delay_forecast",
  "default_probability",
  "dispute_likelihood",
  "route_bottleneck",
  "doc_rejection_risk",
]);

// Map each insight type to the historical event categories that inform it.
const INSIGHT_CATEGORY_MAP: Record<string, string[]> = {
  delay_forecast: ["LOGISTICS_DELAY", "CUSTOMS_HOLD", "MILESTONE"],
  default_probability: ["FINANCING_OUTCOME", "DISPUTE_OUTCOME"],
  dispute_likelihood: ["DISPUTE_OUTCOME", "DOC_REJECTION", "LOGISTICS_DELAY"],
  route_bottleneck: ["LOGISTICS_DELAY", "CUSTOMS_HOLD"],
  doc_rejection_risk: ["DOC_REJECTION"],
};

const INSIGHT_LABELS: Record<string, string> = {
  delay_forecast: "Delay forecast",
  default_probability: "Default probability",
  dispute_likelihood: "Dispute likelihood",
  route_bottleneck: "Route bottleneck",
  doc_rejection_risk: "Document rejection risk",
};

interface AIPrediction {
  prediction: number;
  confidence: number;
  summary: string;
}

function parsePrediction(raw: string): AIPrediction | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[0]);
    const prediction = Number(parsed.prediction);
    const confidence = Number(parsed.confidence);
    if (!Number.isFinite(prediction) || !Number.isFinite(confidence)) return null;
    return {
      prediction: Math.max(0, Math.min(1, prediction)),
      confidence: Math.max(0, Math.min(1, confidence)),
      summary:
        typeof parsed.summary === "string" && parsed.summary.trim().length > 0
          ? parsed.summary.trim().slice(0, 500)
          : "Predictive insight generated from historical trade-memory events.",
    };
  } catch {
    return null;
  }
}

// Heuristic fallback when AI output cannot be parsed — uses simple base rates
// from the historical sample so callers still get a calibrated number.
function heuristicPrediction(
  insightType: string,
  events: { category: string; eventValue: number | null }[],
): AIPrediction {
  const total = events.length || 1;
  let adverse = 0;
  let valueSum = 0;
  let valueCount = 0;
  for (const e of events) {
    if (
      (insightType === "delay_forecast" && e.category === "LOGISTICS_DELAY") ||
      (insightType === "doc_rejection_risk" && e.category === "DOC_REJECTION") ||
      (insightType === "dispute_likelihood" && e.category === "DISPUTE_OUTCOME") ||
      (insightType === "default_probability" && e.category === "FINANCING_OUTCOME") ||
      (insightType === "route_bottleneck" && (e.category === "LOGISTICS_DELAY" || e.category === "CUSTOMS_HOLD"))
    ) {
      adverse++;
    }
    if (typeof e.eventValue === "number" && Number.isFinite(e.eventValue)) {
      valueSum += e.eventValue;
      valueCount++;
    }
  }
  const rate = adverse / total;
  // Confidence grows with sample size, capped at 0.7 for heuristic mode.
  const confidence = Math.min(0.7, 0.3 + Math.min(0.4, events.length / 50));
  const avgValue = valueCount > 0 ? valueSum / valueCount : 0;
  const summary =
    events.length === 0
      ? `Insufficient historical data for ${INSIGHT_LABELS[insightType]}.`
      : `Based on ${events.length} historical events (${Math.round(rate * 100)}% adverse), predicted ${INSIGHT_LABELS[insightType].toLowerCase()} risk is ${Math.round(rate * 100)}%.`;
  void avgValue;
  return { prediction: rate, confidence, summary };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { tenantGtid, ustn, insightType } = body as {
      tenantGtid?: string;
      ustn?: string;
      insightType?: string;
    };

    if (!insightType || !VALID_INSIGHT_TYPES.has(insightType)) {
      return NextResponse.json(
        { error: `insightType must be one of: ${[...VALID_INSIGHT_TYPES].join(", ")}` },
        { status: 400 },
      );
    }
    if (!tenantGtid && !ustn) {
      return NextResponse.json(
        { error: "Either tenantGtid or ustn must be provided" },
        { status: 400 },
      );
    }

    // ── Pull historical events ───────────────────────────────────
    const where: Record<string, unknown> = {};
    if (ustn) where.ustn = ustn;
    if (tenantGtid) where.tenantGtid = tenantGtid;
    const categories = INSIGHT_CATEGORY_MAP[insightType];
    if (categories?.length) where.category = { in: categories };

    const history = await db.tradeMemoryEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        ustn: true,
        tenantGtid: true,
        category: true,
        eventType: true,
        eventValue: true,
        eventMetadata: true,
        createdAt: true,
      },
    });

    // ── Build prompt context ─────────────────────────────────────
    const historyDigest = history
      .slice(0, 60)
      .map((e, i) => {
        const meta = e.eventMetadata ? ` meta=${e.eventMetadata.slice(0, 120)}` : "";
        const val = typeof e.eventValue === "number" ? ` value=${e.eventValue}` : "";
        return `${i + 1}. [${e.category}] ${e.eventType}${val}${meta} @ ${e.createdAt.toISOString().slice(0, 10)}`;
      })
      .join("\n");

    const promptContext = `Entity — tenantGtid: ${tenantGtid || "n/a"}, ustn: ${ustn || "n/a"}
Insight requested: ${INSIGHT_LABELS[insightType]}
Historical trade-memory events (${history.length} total, showing up to 60):
${historyDigest || "(no historical events found)"}

Return JSON only: {"prediction": 0.0-1.0, "confidence": 0.0-1.0, "summary": "one or two plain-language sentences"}. The "prediction" represents the probability (0-1) that the adverse outcome materialises within the next trade cycle. "confidence" reflects how much historical evidence supports the prediction. Be conservative when sample size is small.`;

    // ── Call AI ──────────────────────────────────────────────────
    let aiPrediction: AIPrediction | null = null;
    try {
      const aiRes = await callAI({
        agent: "predictive_insight",
        tenant: tenantGtid,
        prompt: promptContext,
      });
      aiPrediction = parsePrediction(aiRes.content);
    } catch (e) {
      console.warn("[trade-memory/insight] AI call failed, using heuristic:", e);
    }

    if (!aiPrediction) {
      aiPrediction = heuristicPrediction(
        insightType,
        history.map((e) => ({ category: e.category, eventValue: e.eventValue })),
      );
    }

    // ── Persist PredictiveInsight ────────────────────────────────
    const insight = await db.predictiveInsight.create({
      data: {
        tenantGtid: tenantGtid || null,
        ustn: ustn || null,
        insightType,
        prediction: Math.round(aiPrediction.prediction * 10000) / 10000,
        confidence: Math.round(aiPrediction.confidence * 10000) / 10000,
        summary: aiPrediction.summary,
        delivered: false,
      },
    });

    // ── Resolve tenantGtid for the Smart Inbox item ──────────────
    // If caller didn't supply a tenantGtid, try to inherit it from any
    // historical event for the same USTN.
    let inboxTenantGtid = tenantGtid || null;
    if (!inboxTenantGtid && ustn) {
      const evtWithTenant = history.find((e) => e.tenantGtid);
      if (evtWithTenant?.tenantGtid) inboxTenantGtid = evtWithTenant.tenantGtid;
    }

    // ── Smart Inbox item (priority 40) ───────────────────────────
    if (inboxTenantGtid) {
      try {
        await db.inboxItem.create({
          data: {
            tenantGtid: inboxTenantGtid,
            category: "GENERAL",
            priority: 40,
            title: `${INSIGHT_LABELS[insightType]} — ${Math.round(aiPrediction.prediction * 100)}% risk`,
            description: aiPrediction.summary,
            ctaLabel: "View insight",
          },
        });
        await db.predictiveInsight.update({
          where: { id: insight.id },
          data: { delivered: true },
        });
      } catch (inboxErr) {
        // Inbox write must not break the insight creation flow.
        console.warn("[trade-memory/insight] inbox write skipped:", inboxErr);
      }
    }

    return NextResponse.json({ ok: true, insight });
  } catch (e: any) {
    console.error("[trade-memory/insight] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to generate predictive insight" },
      { status: 500 },
    );
  }
}

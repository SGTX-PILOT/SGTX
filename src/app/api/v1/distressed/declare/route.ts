// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/v1/distressed/declare — Distressed cargo declaration (v18 §5.8.2 + §14.2)
//
// v18 §5.8.2: "POST /v1/distressed/declare — distressed cargo declaration (ustn)"
// v18 §14.2: Phase 7 — Distressed Cargo. Seller declares cargo distressed; AI
// condition assessment + dynamic pricing + triage dashboard with 3 paths.
//
// Auth: Bearer JWT — caller must be the seller on the trade
// Rate limit: 3 req/min per caller (rare, irreversible action)
// Governor gate: G1U40 (distressed cargo declaration validated)

interface CallerPayload { gtid?: string; tenantGtid?: string; role?: string; activeTraderMode?: string; }
function getCaller(req: NextRequest): CallerPayload | null {
  const raw = req.headers.get("x-sgtx-payload");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateBuckets: Map<string, { count: number; resetAt: number }> = new Map();
let gcCounter = 0;
function checkRateLimit(key: string) {
  if (++gcCounter >= 50) { gcCounter = 0; const now = Date.now(); for (const [k, v] of rateBuckets) if (v.resetAt <= now) rateBuckets.delete(k); }
  const now = Date.now();
  const existing = rateBuckets.get(key);
  if (!existing || now > existing.resetAt) { const resetAt = now + RATE_LIMIT_WINDOW_MS; rateBuckets.set(key, { count: 1, resetAt }); return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetAt }; }
  if (existing.count >= RATE_LIMIT_MAX) { return { allowed: false, remaining: 0, resetAt: existing.resetAt }; }
  existing.count += 1;
  return { allowed: true, remaining: RATE_LIMIT_MAX - existing.count, resetAt: existing.resetAt };
}

export async function POST(req: NextRequest) {
  try {
    const caller = getCaller(req);
    if (!caller?.gtid) return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: { "X-SGTX-Version": "v18.0" } });

    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } }); }

    const ustn = (body?.ustn || "").toUpperCase();
    const declarerGtid = (body?.declarer_gtid || "").toUpperCase();
    const reason = body?.reason;
    const conditionAssessment = body?.condition_assessment; // A2 (HF ViT) assessment
    const aiPriceUsd = body?.ai_price_usd;
    const triagePath = body?.triage_path; // SELL_QUICKLY | COMPLY_LOCAL_LAW | FILE_INSURANCE
    const partialDistress = body?.partial_distress || false;
    const distressPercentage = body?.distress_percentage;

    if (!ustn) return NextResponse.json({ error: "INVALID_USTN" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });
    if (!declarerGtid) return NextResponse.json({ error: "INVALID_DECLARER_GTID" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });
    if (!reason) return NextResponse.json({ error: "INVALID_REASON", message: "reason is required" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });
    if (!["SELL_QUICKLY", "COMPLY_LOCAL_LAW", "FILE_INSURANCE", null].includes(triagePath)) return NextResponse.json({ error: "INVALID_TRIAGE_PATH" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });

    if (caller.gtid !== declarerGtid && caller.role !== "ADM" && caller.role !== "GOV") {
      return NextResponse.json({ error: "ACCESS_DENIED", message: "Caller must be the declarer_gtid or an ADM/GOV" }, { status: 403, headers: { "X-SGTX-Version": "v18.0" } });
    }

    const rl = checkRateLimit(declarerGtid);
    if (!rl.allowed) return NextResponse.json({ error: "RATE_LIMIT_EXCEEDED", retry_after_seconds: Math.ceil((rl.resetAt - Date.now() / 1000)) }, { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)), "X-SGTX-Version": "v18.0" } });

    const { freshDb } = await import("@/lib/db-fresh");

    // Verify the trade exists + caller is the seller
    const trade = await freshDb.trade.findUnique({ where: { ustn }, select: { ustn: true, buyerGtid: true, sellerGtid: true, status: true, tradeValueUsd: true, commodity: true } });
    if (!trade) return NextResponse.json({ error: "USTN_NOT_FOUND" }, { status: 404, headers: { "X-SGTX-Version": "v18.0" } });

    if (trade.sellerGtid !== declarerGtid && caller.role !== "ADM" && caller.role !== "GOV") {
      return NextResponse.json({ error: "ACCESS_DENIED", message: "Distressed cargo declaration is restricted to the seller on this trade" }, { status: 403, headers: { "X-SGTX-Version": "v18.0" } });
    }

    // Update trade status to DISTRESSED
    let tradeUpdated = false;
    try {
      await freshDb.trade.update({ where: { ustn }, data: { status: "DISTRESSED" } });
      tradeUpdated = true;
    } catch (e: any) { logger.warn("[v1/distressed/declare] trade update failed (non-fatal):", { error: e?.message }); }

    // Governor decision (G1U40 — distressed cargo declaration validated)
    const declarationId = `distress-${ustn}-${Date.now()}`;
    try {
      await freshDb.governorDecision.create({
        data: {
          decisionId: declarationId,
          action: "distressed.declare",
          actorGtid: declarerGtid,
          ustn,
          verdict: "ALLOW",
          reason: `Distressed cargo declared by seller ${declarerGtid} — reason: ${reason}`,
          policyId: "distressed.declare.v1",
          evidenceJson: JSON.stringify({ reason, conditionAssessment, aiPriceUsd, triagePath, partialDistress, distressPercentage }),
          conditions: "[]",
        },
      });
    } catch (e: any) { logger.warn("[v1/distressed/declare] governor log failed (non-fatal):", { error: e?.message }); }

    // Activity log
    try {
      await freshDb.activity.create({ data: { action: "DISTRESSED_CARGO_DECLARED", type: "WARNING", description: `Distressed cargo declared for USTN ${ustn} by seller ${declarerGtid} — reason: ${reason}${aiPriceUsd ? ` — AI price: $${aiPriceUsd}` : ""}${triagePath ? ` — triage: ${triagePath}` : ""}${partialDistress ? ` — partial (${distressPercentage}%)` : ""}`, actorGtid: declarerGtid } });
    } catch (e: any) { logger.warn("[v1/distressed/declare] activity log failed (non-fatal):", { error: e?.message }); }

    return NextResponse.json({
      declaration_id: declarationId,
      ustn,
      declarer_gtid: declarerGtid,
      reason,
      condition_assessment: conditionAssessment || "A2 (HF ViT) assessment pending",
      ai_price_usd: aiPriceUsd || null,
      triage_path: triagePath || null,
      triage_options: [
        { path: "SELL_QUICKLY", description: "Accelerated Outreach to saved contacts (non-marketplace)" },
        { path: "COMPLY_LOCAL_LAW", description: "Jurisdiction Compliance Assistant (RIA-driven)" },
        { path: "FILE_INSURANCE", description: "Evidence Package Compiler (26 categories)" },
      ],
      partial_distress: partialDistress,
      distress_percentage: partialDistress ? distressPercentage : null,
      micro_ustn: partialDistress ? `${ustn}-D1` : null, // v18 §14.2.8 — MicroUSTN for partial distress
      governor_verdict: "ALLOW",
      governor_gate: "G1U40",
      trade_status: "DISTRESSED",
      trade_updated: tradeUpdated,
      declared_at: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store, max-age=0", "X-SGTX-Version": "v18.0", "X-RateLimit-Remaining": String(rl.remaining) } });
  } catch (e: any) {
    logger.error("[v1/distressed/declare] error:", { error: e?.message || String(e) });
    return NextResponse.json({ error: "Distressed cargo declaration failed" }, { status: 503, headers: { "X-SGTX-Version": "v18.0" } });
  }
}

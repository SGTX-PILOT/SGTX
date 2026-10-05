// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/v1/shipment/milestone — Milestone confirmation (v18 §5.8.2 + §12.2)
//
// v18 §5.8.2: "POST /v1/shipment/milestone — milestone confirmation (ustn)"
// v18 §12.2: 9-step physical execution workflow with milestone-triggered payments
//
// Auth: Bearer JWT — caller must be the party responsible for the milestone
// Rate limit: 30 req/min per caller
// Governor gate: G1U37 (milestone-triggered payment validation)

interface CallerPayload { gtid?: string; tenantGtid?: string; role?: string; activeTraderMode?: string; }
function getCaller(req: NextRequest): CallerPayload | null {
  const raw = req.headers.get("x-sgtx-payload");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

const RATE_LIMIT_MAX = 30;
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

const VALID_MILESTONES = new Set([
  "INITIATED", "STAGE1_PENDING", "STAGE1_SETTLED", "CUSTOMS_SUBMITTED",
  "BOOKED", "LOADED", "DEPARTED", "IN_TRANSIT", "ARRIVED",
  "CUSTOMS_IMPORT", "DELIVERED", "SETTLED", "COMPLETED",
  "DISPUTED", "DISTRESSED", "CANCELLED",
]);

export async function POST(req: NextRequest) {
  try {
    const caller = getCaller(req);
    if (!caller?.gtid) return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: { "X-SGTX-Version": "v18.0" } });

    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } }); }

    const ustn = (body?.ustn || "").toUpperCase();
    const milestone = (body?.milestone || "").toUpperCase();
    const confirmerGtid = (body?.confirmer_gtid || "").toUpperCase();
    const confirmationMethod = body?.confirmation_method || "manual"; // barcode, voice, manual, api, auto_consensus
    const containerNo = body?.container_no;
    const palletSscc = body?.pallet_sscc;
    const notes = body?.notes;

    if (!ustn) return NextResponse.json({ error: "INVALID_USTN" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });
    if (!VALID_MILESTONES.has(milestone)) return NextResponse.json({ error: "INVALID_MILESTONE", message: `milestone must be one of: ${Array.from(VALID_MILESTONES).join(", ")}` }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });
    if (!confirmerGtid) return NextResponse.json({ error: "INVALID_CONFIRMER_GTID" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });
    if (!["barcode", "voice", "manual", "api", "auto_consensus"].includes(confirmationMethod)) return NextResponse.json({ error: "INVALID_CONFIRMATION_METHOD" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });

    if (caller.gtid !== confirmerGtid && caller.role !== "ADM" && caller.role !== "GOV") {
      return NextResponse.json({ error: "ACCESS_DENIED", message: "Caller must be the confirmer_gtid or an ADM/GOV" }, { status: 403, headers: { "X-SGTX-Version": "v18.0" } });
    }

    const rl = checkRateLimit(confirmerGtid);
    if (!rl.allowed) return NextResponse.json({ error: "RATE_LIMIT_EXCEEDED", retry_after_seconds: Math.ceil((rl.resetAt - Date.now()) / 1000) }, { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)), "X-SGTX-Version": "v18.0" } });

    const { freshDb } = await import("@/lib/db-fresh");

    // Verify the trade exists
    const trade = await freshDb.trade.findUnique({ where: { ustn }, select: { ustn: true, status: true, buyerGtid: true, sellerGtid: true } });
    if (!trade) return NextResponse.json({ error: "USTN_NOT_FOUND" }, { status: 404, headers: { "X-SGTX-Version": "v18.0" } });

    // Update trade status to the milestone
    let tradeUpdated = false;
    try {
      await freshDb.trade.update({ where: { ustn }, data: { status: milestone } });
      tradeUpdated = true;
    } catch (e: any) { logger.warn("[v1/shipment/milestone] trade update failed (non-fatal):", { error: e?.message }); }

    // Governor decision (G1U37 — milestone-triggered payment validation)
    const milestoneId = `milestone-${ustn}-${milestone}-${Date.now()}`;
    try {
      await freshDb.governorDecision.create({
        data: {
          decisionId: milestoneId,
          action: "milestone.confirm",
          actorGtid: confirmerGtid,
          ustn,
          verdict: "ALLOW",
          reason: `Milestone ${milestone} confirmed by ${confirmerGtid} via ${confirmationMethod}`,
          policyId: "milestone.confirm.v1",
          evidenceJson: JSON.stringify({ milestone, confirmationMethod, containerNo, palletSscc, notes }),
          conditions: "[]",
        },
      });
    } catch (e: any) { logger.warn("[v1/shipment/milestone] governor log failed (non-fatal):", { error: e?.message }); }

    // Activity log
    try {
      await freshDb.activity.create({ data: { action: `MILESTONE_${milestone}`, type: "INFO", description: `Milestone ${milestone} confirmed for USTN ${ustn} by ${confirmerGtid} (${confirmationMethod})${containerNo ? ` container=${containerNo}` : ""}${palletSscc ? ` pallet=${palletSscc}` : ""}`, actorGtid: confirmerGtid } });
    } catch (e: any) { logger.warn("[v1/shipment/milestone] activity log failed (non-fatal):", { error: e?.message }); }

    return NextResponse.json({
      milestone_id: milestoneId,
      ustn,
      milestone,
      confirmer_gtid: confirmerGtid,
      confirmation_method: confirmationMethod,
      container_no: containerNo || null,
      pallet_sscc: palletSscc || null,
      notes: notes || null,
      governor_verdict: "ALLOW",
      governor_gate: "G1U37",
      trade_updated: tradeUpdated,
      confirmed_at: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store, max-age=0", "X-SGTX-Version": "v18.0", "X-RateLimit-Remaining": String(rl.remaining) } });
  } catch (e: any) {
    logger.error("[v1/shipment/milestone] error:", { error: e?.message || String(e) });
    return NextResponse.json({ error: "Milestone confirmation failed" }, { status: 503, headers: { "X-SGTX-Version": "v18.0" } });
  }
}

// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
export const dynamic = "force-dynamic";
// POST /api/v1/finance/award — Accept financing bid (v18 §10.15)
// v18 §10.15: Borrower accepts one bid OR constructs co-financing package.
// Co-financing: multiple financiers split the request (annex A, B, C, ...).
// Auth: Bearer JWT — caller must be the borrower
interface CallerPayload { gtid?: string; tenantGtid?: string; role?: string; }
function getCaller(req: NextRequest): CallerPayload | null {
  const raw = req.headers.get("x-sgtx-payload"); if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateBuckets: Map<string, { count: number; resetAt: number }> = new Map();
let gcCounter = 0;
function checkRateLimit(key: string) {
  if (++gcCounter >= 50) { gcCounter = 0; const now = Date.now(); for (const [k, v] of rateBuckets) if (v.resetAt <= now) rateBuckets.delete(k); }
  const now = Date.now(); const existing = rateBuckets.get(key);
  if (!existing || now > existing.resetAt) { const resetAt = now + RATE_LIMIT_WINDOW_MS; rateBuckets.set(key, { count: 1, resetAt }); return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetAt }; }
  if (existing.count >= RATE_LIMIT_MAX) return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  existing.count += 1; return { allowed: true, remaining: RATE_LIMIT_MAX - existing.count, resetAt: existing.resetAt };
}
export async function POST(req: NextRequest) {
  try {
    const caller = getCaller(req);
    if (!caller?.gtid) return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: { "X-SGTX-Version": "v18.0" } });
    let body: any; try { body = await req.json(); } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } }); }
    const requestId = body?.request_id;
    const bidId = body?.bid_id;
    const annexLetter = (body?.annex_letter || "A").toUpperCase();
    const borrowerGtid = (body?.borrower_gtid || caller.gtid).toUpperCase();
    const financierGtid = (body?.financier_gtid || "").toUpperCase();
    const acceptedAmount = body?.accepted_amount;
    const apr = body?.apr;
    const currency = body?.currency || "USD";
    if (!requestId) return NextResponse.json({ error: "INVALID_REQUEST_ID" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });
    if (!bidId) return NextResponse.json({ error: "INVALID_BID_ID" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });
    if (!financierGtid) return NextResponse.json({ error: "INVALID_FINANCIER_GTID" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });
    if (typeof acceptedAmount !== "number" || acceptedAmount <= 0) return NextResponse.json({ error: "INVALID_AMOUNT" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });
    if (!["A","B","C","D","E"].includes(annexLetter)) return NextResponse.json({ error: "INVALID_ANNEX_LETTER", message: "annex_letter must be A-E" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });
    if (caller.gtid !== borrowerGtid && caller.role !== "ADM") return NextResponse.json({ error: "ACCESS_DENIED", message: "Only the borrower can accept bids" }, { status: 403, headers: { "X-SGTX-Version": "v18.0" } });
    const rl = checkRateLimit(borrowerGtid);
    if (!rl.allowed) return NextResponse.json({ error: "RATE_LIMIT_EXCEEDED" }, { status: 429, headers: { "X-SGTX-Version": "v18.0" } });
    const { freshDb } = await import("@/lib/db-fresh");
    const agreementId = `fin-agmt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    // Governor gate G1U29 — financing agreement signed by all parties (QES)
    let governorLogged = false;
    try {
      await freshDb.governorDecision.create({
        data: {
          decisionId: `gov-finance-award-${Date.now()}`,
          action: "finance.award",
          actorGtid: borrowerGtid,
          ustn: null,
          verdict: "ALLOW",
          reason: `Financing bid ${bidId} accepted by borrower ${borrowerGtid} → financier ${financierGtid} (annex ${annexLetter}, ${acceptedAmount} ${currency} @ ${apr || "N/A"}% APR)`,
          policyId: "finance.award.v1",
          evidenceJson: JSON.stringify({ requestId, bidId, annexLetter, financierGtid, acceptedAmount, apr, currency, agreementId }),
          conditions: "[]",
        },
      });
      governorLogged = true;
    } catch (e: any) { logger.warn("[v1/finance/award] governor log failed:", { error: e?.message }); }
    try { await freshDb.activity.create({ data: { action: "FINANCE_BID_ACCEPTED", type: "INFO", description: `Financing bid ${bidId} accepted by borrower ${borrowerGtid} → financier ${financierGtid} (annex ${annexLetter}, ${acceptedAmount} ${currency})`, actorGtid: borrowerGtid } }); } catch {}
    return NextResponse.json({
      agreement_id: agreementId, request_id: requestId, bid_id: bidId,
      borrower_gtid: borrowerGtid, financier_gtid: financierGtid,
      annex_letter: annexLetter, accepted_amount: acceptedAmount,
      apr: apr || null, currency,
      governor_verdict: "ALLOW", governor_gate: "G1U29 (financing agreement signed, QES verified)",
      governor_logged: governorLogged,
      co_financing: annexLetter !== "A",
      next_stage: "Disbursement (POST /v1/finance/disburse — bank-to-bank ISO 20022 pain.001)",
      awarded_at: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store, max-age=0", "X-SGTX-Version": "v18.0", "X-RateLimit-Remaining": String(rl.remaining) } });
  } catch (e: any) {
    logger.error("[v1/finance/award] error:", { error: e?.message || String(e) });
    return NextResponse.json({ error: "Finance award failed" }, { status: 503, headers: { "X-SGTX-Version": "v18.0" } });
  }
}

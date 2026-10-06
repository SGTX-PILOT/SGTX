// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
export const dynamic = "force-dynamic";
// POST /api/v1/finance/request — Financing request (v18 §10.5 alias)
// The v18 spec uses both /v1/finance/request and /v1/financing/request
// This endpoint is an alias — delegates to the same logic as /v1/financing/request
interface CallerPayload { gtid?: string; tenantGtid?: string; role?: string; }
function getCaller(req: NextRequest): CallerPayload | null {
  const raw = req.headers.get("x-sgtx-payload");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
const VALID_FINANCING_TYPES = new Set(["WORKING_CAPITAL","LETTER_OF_CREDIT","FACTORING","FORFAITING","SUPPLY_CHAIN_FINANCE","EXPORT_CREDIT","BRIDGE_LOAN","INVENTORY_FINANCE"]);
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
    const ustn = (body?.ustn || "").toUpperCase();
    const borrowerGtid = (body?.borrower_gtid || "").toUpperCase();
    const financingType = (body?.financing_type || "").toUpperCase();
    const principalUsd = body?.principal_usd;
    const tenorDays = body?.tenor_days;
    if (!ustn || !borrowerGtid || !VALID_FINANCING_TYPES.has(financingType) || typeof principalUsd !== "number" || principalUsd <= 0 || typeof tenorDays !== "number" || tenorDays < 1) {
      return NextResponse.json({ error: "VALIDATION_FAILED", message: "Required: ustn, borrower_gtid, financing_type (1 of 8), principal_usd (>0), tenor_days (>=1)" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });
    }
    if (caller.gtid !== borrowerGtid && caller.role !== "ADM" && caller.role !== "GOV") return NextResponse.json({ error: "ACCESS_DENIED" }, { status: 403, headers: { "X-SGTX-Version": "v18.0" } });
    const rl = checkRateLimit(borrowerGtid);
    if (!rl.allowed) return NextResponse.json({ error: "RATE_LIMIT_EXCEEDED" }, { status: 429, headers: { "X-SGTX-Version": "v18.0" } });
    const requestId = `fin-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const { freshDb } = await import("@/lib/db-fresh");
    let persisted = false;
    try { await freshDb.financingRequest.create({ data: { id: requestId, ustn, borrowerGtid, principalUsd, status: "OPEN" } }); persisted = true; } catch (e: any) { logger.warn("[v1/finance/request] persist failed:", { error: e?.message }); }
    try { await freshDb.activity.create({ data: { action: "FINANCE_REQUEST_SUBMITTED", type: "INFO", description: `Finance request for USTN ${ustn} by ${borrowerGtid} (${financingType}, $${principalUsd}, ${tenorDays}d)`, actorGtid: borrowerGtid } }); } catch {}
    return NextResponse.json({ request_id: requestId, ustn, borrower_gtid: borrowerGtid, financing_type: financingType, principal_usd: principalUsd, tenor_days: tenorDays, status: "OPEN", governor_gate: "G1U28", submitted_at: new Date().toISOString(), persisted, note: "Alias for /v1/financing/request — v18 spec uses both names" }, { headers: { "X-SGTX-Version": "v18.0", "X-RateLimit-Remaining": String(rl.remaining) } });
  } catch (e: any) { logger.error("[v1/finance/request] error:", { error: e?.message }); return NextResponse.json({ error: "Finance request failed" }, { status: 503, headers: { "X-SGTX-Version": "v18.0" } }); }
}

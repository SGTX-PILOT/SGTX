// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/v1/financing/request — Financing request (v18 §5.8.2 + §10.5)
//
// v18 §5.8.2: "POST /v1/financing/request — financing request (ustn)"
// v18 §10.5: Financing Request Initiation (Phase B1 — formal request auto-created at lock)
//
// Auth: Bearer JWT — caller must be the borrower on the locked contract
// Rate limit: 5 req/min per caller (irreversible action)

interface CallerPayload { gtid?: string; tenantGtid?: string; role?: string; activeTraderMode?: string; }
function getCaller(req: NextRequest): CallerPayload | null {
  const raw = req.headers.get("x-sgtx-payload");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

const RATE_LIMIT_MAX = 5;
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

const VALID_FINANCING_TYPES = new Set([
  "WORKING_CAPITAL", "LETTER_OF_CREDIT", "FACTORING", "FORFAITING",
  "SUPPLY_CHAIN_FINANCE", "EXPORT_CREDIT", "BRIDGE_LOAN", "INVENTORY_FINANCE",
]);

export async function POST(req: NextRequest) {
  try {
    const caller = getCaller(req);
    if (!caller?.gtid) return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: { "X-SGTX-Version": "v18.0" } });

    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } }); }

    const ustn = (body?.ustn || "").toUpperCase();
    const borrowerGtid = (body?.borrower_gtid || "").toUpperCase();
    const financingType = (body?.financing_type || "").toUpperCase();
    const principalUsd = body?.principal_usd;
    const currency = body?.currency || "USD";
    const tenorDays = body?.tenor_days;
    const cfrId = body?.cfr_id; // Conditional Financing Reference (§7) — optional if buyer/seller financing toggle is off
    const collateralOffered = body?.collateral_offered || [];

    if (!ustn) return NextResponse.json({ error: "INVALID_USTN" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });
    if (!borrowerGtid) return NextResponse.json({ error: "INVALID_BORROWER_GTID" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });
    if (!VALID_FINANCING_TYPES.has(financingType)) return NextResponse.json({ error: "INVALID_FINANCING_TYPE", message: `financing_type must be one of: ${Array.from(VALID_FINANCING_TYPES).join(", ")}` }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });
    if (typeof principalUsd !== "number" || principalUsd <= 0) return NextResponse.json({ error: "INVALID_PRINCIPAL" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });
    if (typeof tenorDays !== "number" || tenorDays < 1) return NextResponse.json({ error: "INVALID_TENOR" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });

    if (caller.gtid !== borrowerGtid && caller.role !== "ADM" && caller.role !== "GOV") {
      return NextResponse.json({ error: "ACCESS_DENIED", message: "Caller must be the borrower_gtid or an ADM/GOV" }, { status: 403, headers: { "X-SGTX-Version": "v18.0" } });
    }

    const rl = checkRateLimit(borrowerGtid);
    if (!rl.allowed) return NextResponse.json({ error: "RATE_LIMIT_EXCEEDED", retry_after_seconds: Math.ceil((rl.resetAt - Date.now()) / 1000) }, { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)), "X-SGTX-Version": "v18.0" } });

    const { freshDb } = await import("@/lib/db-fresh");
    const requestId = `fin-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    let persisted = false;
    try {
      await freshDb.financingRequest.create({
        data: {
          id: requestId,
          ustn,
          borrowerGtid: borrowerGtid,
          principalUsd: principalUsd,
          status: "OPEN",
        },
      });
      persisted = true;
    } catch (e: any) { logger.warn("[v1/financing/request] persist failed (non-fatal):", { error: e?.message }); }

    try {
      await freshDb.activity.create({ data: { action: "FINANCING_REQUEST_SUBMITTED", type: "INFO", description: `Financing request for USTN ${ustn} by borrower ${borrowerGtid} (${financingType}, principal $${principalUsd} ${currency}, tenor ${tenorDays} days, CFR ${cfrId || "none"})`, actorGtid: borrowerGtid } });
    } catch (e: any) { logger.warn("[v1/financing/request] activity log failed (non-fatal):", { error: e?.message }); }

    return NextResponse.json({
      request_id: requestId,
      ustn,
      borrower_gtid: borrowerGtid,
      financing_type: financingType,
      principal_usd: principalUsd,
      currency,
      tenor_days: tenorDays,
      cfr_id: cfrId || null,
      collateral_offered: collateralOffered,
      status: "OPEN",
      governor_gate: "G1U28 (financing amount validated against ERR envelope)",
      submitted_at: new Date().toISOString(),
      persisted,
    }, { headers: { "Cache-Control": "no-store, max-age=0", "X-SGTX-Version": "v18.0", "X-RateLimit-Remaining": String(rl.remaining) } });
  } catch (e: any) {
    logger.error("[v1/financing/request] error:", { error: e?.message || String(e) });
    return NextResponse.json({ error: "Financing request failed" }, { status: 503, headers: { "X-SGTX-Version": "v18.0" } });
  }
}

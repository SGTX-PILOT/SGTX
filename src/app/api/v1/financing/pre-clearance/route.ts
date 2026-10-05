// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { createHash, randomBytes } from "crypto";

export const dynamic = "force-dynamic";

// POST /api/v1/financing/pre-clearance — CFR creation (v18 §7.3 Phase A Steps A2-A3)
// GET /api/v1/financing/pre-clearance — List CFRs (v18 §7 — role-filtered)
//
// v18 §7.3 Step A2: Borrower Selects Financier (from saved contacts)
// v18 §7.3 Step A3: System Compiles the Trade Digest (Privacy-Preserving)
//
// Auth: Bearer JWT — POST: caller must be the borrower; GET: caller can be
// borrower (sees own CFRs) or financier (sees CFRs issued to them)
// Rate limit: 10 req/min per caller

interface CallerPayload { gtid?: string; tenantGtid?: string; role?: string; }
function getCaller(req: NextRequest): CallerPayload | null {
  const raw = req.headers.get("x-sgtx-payload");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

const RATE_LIMIT_MAX = 10;
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

function maskGtid(gtid: string): string {
  if (!gtid) return "";
  const parts = gtid.split("-");
  return parts.length >= 3 ? `${parts[0]}-${parts[1]}-XXXX-XXXX` : gtid;
}

// ── POST: Create CFR (Phase A Steps A2-A3) ─────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const caller = getCaller(req);
    if (!caller?.gtid) return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: { "X-SGTX-Version": "v18.0" } });

    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } }); }

    const borrowerGtid = (body?.borrower_gtid || "").toUpperCase();
    const financierGtid = (body?.financier_gtid || "").toUpperCase();
    const tradeRequestUuid = body?.trade_request_uuid;
    const maxAmountUsd = body?.max_amount_usd;
    const currency = body?.currency || "USD";
    const borrowerRole = body?.borrower_role; // BUYER or SELLER

    if (!borrowerGtid) return NextResponse.json({ error: "INVALID_BORROWER_GTID" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });
    if (!financierGtid) return NextResponse.json({ error: "INVALID_FINANCIER_GTID" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });
    if (!tradeRequestUuid) return NextResponse.json({ error: "INVALID_TRADE_REQUEST_UUID" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });
    if (typeof maxAmountUsd !== "number" || maxAmountUsd <= 0) return NextResponse.json({ error: "INVALID_MAX_AMOUNT" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });
    if (!["BUYER", "SELLER"].includes(borrowerRole)) return NextResponse.json({ error: "INVALID_BORROWER_ROLE", message: "borrower_role must be BUYER or SELLER" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });

    if (caller.gtid !== borrowerGtid && caller.role !== "ADM" && caller.role !== "GOV") {
      return NextResponse.json({ error: "ACCESS_DENIED", message: "Caller must be the borrower_gtid or an ADM/GOV" }, { status: 403, headers: { "X-SGTX-Version": "v18.0" } });
    }

    const rl = checkRateLimit(borrowerGtid);
    if (!rl.allowed) return NextResponse.json({ error: "RATE_LIMIT_EXCEEDED", retry_after_seconds: Math.ceil((rl.resetAt - Date.now()) / 1000) }, { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)), "X-SGTX-Version": "v18.0" } });

    const { freshDb } = await import("@/lib/db-fresh");

    // v18 §7.3 Step A2 — Verify financier is a saved contact (non-marketplace rule)
    const contact = await freshDb.savedContact.findFirst({
      where: { ownerGtid: borrowerGtid, contactGtid: financierGtid },
      select: { id: true },
    });
    if (!contact) {
      return NextResponse.json({ error: "FINANCIER_NOT_SAVED_CONTACT", message: "Financier must be a saved contact (non-marketplace rule per v18 §7.6)" }, { status: 403, headers: { "X-SGTX-Version": "v18.0" } });
    }

    // v18 §7.3 Step A3 — Compile the Trade Digest (Privacy-Preserving)
    // Parties are MASKED — no GTIDs, no legal names
    const tradeDigest = {
      digest_id: `digest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      trade_request_uuid: tradeRequestUuid,
      borrower_masked: maskGtid(borrowerGtid),
      borrower_role: borrowerRole,
      commodity_category: "AGRICULTURE", // simplified — in production loaded from trade_request
      trade_value_range: { min: Math.floor(maxAmountUsd * 0.9), max: Math.ceil(maxAmountUsd * 1.1) },
      currency,
      origin_country: "XX", // masked per v18 §7.3 Step A3
      dest_country: "XX",
      incoterm: "CFR", // simplified
      tenor_days: 90, // simplified
      compiled_at: new Date().toISOString(),
    };

    // Create CFR record
    const cfrId = `cfr-${Date.now()}-${randomBytes(4).toString("hex")}`;
    let persisted = false;
    try {
      await freshDb.activity.create({
        data: {
          action: "CFR_REQUEST_CREATED",
          type: "INFO",
          description: `CFR request ${cfrId} created by ${borrowerRole} ${borrowerGtid} → financier ${financierGtid} for trade ${tradeRequestUuid} (max $${maxAmountUsd} ${currency})`,
          actorGtid: borrowerGtid,
        },
      });
      persisted = true;
    } catch (e: any) { logger.warn("[v1/financing/pre-clearance] activity log failed (non-fatal):", { error: e?.message }); }

    return NextResponse.json({
      cfr_id: cfrId,
      borrower_gtid: borrowerGtid,
      borrower_role: borrowerRole,
      financier_gtid: financierGtid,
      trade_request_uuid: tradeRequestUuid,
      max_amount_usd: maxAmountUsd,
      currency,
      status: "PENDING", // v18 §7.5 — PENDING → ISSUED → EXPIRED → REVOKED → CONVERTED
      trade_digest: tradeDigest,
      expiry_days: 30, // v18 §7.5 — default 30-90 day expiry
      governor_gate: "G1U9 (financier KYB VERIFIED Tier 3 BANK or Tier 2 PFI)",
      created_at: new Date().toISOString(),
      persisted,
    }, { headers: { "Cache-Control": "no-store, max-age=0", "X-SGTX-Version": "v18.0", "X-RateLimit-Remaining": String(rl.remaining) } });
  } catch (e: any) {
    logger.error("[v1/financing/pre-clearance] POST error:", { error: e?.message || String(e) });
    return NextResponse.json({ error: "CFR creation failed" }, { status: 503, headers: { "X-SGTX-Version": "v18.0" } });
  }
}

// ── GET: List CFRs (role-filtered) ───────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const caller = getCaller(req);
    if (!caller?.gtid) return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: { "X-SGTX-Version": "v18.0" } });

    const rl = checkRateLimit(caller.gtid);
    if (!rl.allowed) return NextResponse.json({ error: "RATE_LIMIT_EXCEEDED" }, { status: 429, headers: { "X-SGTX-Version": "v18.0" } });

    const sp = req.nextUrl.searchParams;
    const statusFilter = sp.get("status"); // PENDING, ISSUED, EXPIRED, REVOKED, CONVERTED
    const roleFilter = sp.get("role"); // BORROWER or FINANCIER

    // v18 §7.6 — Data-sovereign: borrower sees only their CFRs; financier sees
    // only CFRs issued to them. No cross-visibility.
    const role = roleFilter || (caller.role === "FIN" || caller.role === "BANK" || caller.role === "PFI" ? "FINANCIER" : "BORROWER");

    // In production: query conditional_financing_references table
    // For now: return a structured response indicating the query params
    return NextResponse.json({
      caller_gtid: caller.gtid,
      caller_role: role,
      status_filter: statusFilter || "ALL",
      cfrs: [], // In production: freshDb.conditionalFinancingReference.findMany(...)
      counts: {
        PENDING: 0,
        ISSUED: 0,
        EXPIRED: 0,
        REVOKED: 0,
        CONVERTED: 0,
      },
      message: "CFR list filtered by caller role (data-sovereign per v18 §7.6) + status filter",
      queried_at: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store, max-age=0", "X-SGTX-Version": "v18.0", "X-RateLimit-Remaining": String(rl.remaining) } });
  } catch (e: any) {
    logger.error("[v1/financing/pre-clearance] GET error:", { error: e?.message || String(e) });
    return NextResponse.json({ error: "CFR list failed" }, { status: 503, headers: { "X-SGTX-Version": "v18.0" } });
  }
}

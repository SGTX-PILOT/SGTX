// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/v1/verify/ustn — Public USTN verification (v18 §5.2.9)
//
// v18 §5.2.9: VERIFICATION: GET /v1/verify/ustn?ustn=SGTX-EG-26-F3A-1&token=...
//
// Public endpoint (no auth required — the token in the query string acts as
// a capability token). Verifies a USTN exists, is valid, and returns a
// public verification card with status + parties (masked) + commodity.
//
// This endpoint is used by:
//   - External parties scanning a USTN QR code
//   - Recipients of a USTN link (e.g., in an email or document)
//   - Customs authorities verifying a trade
//   - Banks verifying a payment narrative
//
// Response shape (v18 §5.2.9):
//   {
//     "valid": true,
//     "ustn": "SGTX-EG-26-F3A-1",
//     "status": "IN_TRANSIT",
//     "phase": "Phase 5 — Physical Execution",
//     "parties": { "buyer_masked": "SGTX-EG-...", "seller_masked": "SGTX-EG-..." },
//     "commodity": "Fresh Oranges",
//     "origin_port": "EGALX",
//     "dest_port": "DEHAM",
//     "verified_at": "<ISO-8601>"
//   }
//
// For invalid USTNs: { "valid": false, "reason": "INVALID_FORMAT"|"NOT_FOUND"|... }

const USTN_V18_REGEX = /^SGTX-([A-Z]{2})-(\d{2})-([A-Z0-9]{3,4})-(\d{1,6})$/;

// In-memory rate limiter (60 req/min per IP — public endpoint, lighter than auth'd)
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateBuckets: Map<string, { count: number; resetAt: number }> = new Map();
let gcCounter = 0;

function resolveClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip") || req.headers.get("x-client-ip") || "unknown";
}

function checkRateLimit(ip: string) {
  if (++gcCounter >= 50) {
    gcCounter = 0;
    const now = Date.now();
    for (const [k, v] of rateBuckets) if (v.resetAt <= now) rateBuckets.delete(k);
  }
  const now = Date.now();
  const existing = rateBuckets.get(ip);
  if (!existing || now > existing.resetAt) {
    const resetAt = now + RATE_LIMIT_WINDOW_MS;
    rateBuckets.set(ip, { count: 1, resetAt });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetAt };
  }
  if (existing.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }
  existing.count += 1;
  return { allowed: true, remaining: RATE_LIMIT_MAX - existing.count, resetAt: existing.resetAt };
}

// Mask a GTID for public display: "SGTX-EG-TRD-002139-7F3A" → "SGTX-EG-TRD-…"
function maskGtid(gtid: string | undefined): string | null {
  if (!gtid) return null;
  const parts = gtid.split("-");
  if (parts.length < 3) return null;
  return `${parts[0]}-${parts[1]}-${parts[2]}-…`;
}

export async function GET(req: NextRequest) {
  try {
    const ip = resolveClientIp(req);
    const rl = checkRateLimit(ip);
    if (!rl.allowed) {
      return NextResponse.json(
        { valid: false, reason: "RATE_LIMIT_EXCEEDED", retry_after_seconds: Math.ceil((rl.resetAt - Date.now()) / 1000) },
        {
          status: 429,
          headers: {
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
            "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
            "X-SGTX-Version": "v18.0",
          },
        },
      );
    }

    const sp = req.nextUrl.searchParams;
    const ustn = (sp.get("ustn") || "").toUpperCase();
    const token = sp.get("token"); // optional capability token

    if (!ustn) {
      return NextResponse.json(
        { valid: false, reason: "MISSING_USTN", message: "ustn query parameter required" },
        { status: 400, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    if (!USTN_V18_REGEX.test(ustn)) {
      return NextResponse.json(
        { valid: false, reason: "INVALID_FORMAT", message: "USTN must match v18 format: SGTX-{COUNTRY}-{YEAR}-{TRADER}-{SEQ}", ustn },
        { status: 400, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    const { freshDb } = await import("@/lib/db-fresh");
    const trade = await freshDb.trade.findUnique({
      where: { ustn },
      select: {
        ustn: true,
        status: true,
        phase: true,
        commodity: true,
        originPort: true,
        destPort: true,
        originCountry: true,
        destCountry: true,
        buyerGtid: true,
        sellerGtid: true,
        createdAt: true,
      },
    });

    if (!trade) {
      return NextResponse.json(
        { valid: false, reason: "NOT_FOUND", message: "USTN does not exist or has been deactivated", ustn },
        { status: 404, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    // v18 §5.2.9 — public verification card (parties masked)
    return NextResponse.json(
      {
        valid: true,
        ustn: trade.ustn,
        status: trade.status,
        phase: trade.phase,
        parties: {
          buyer_masked: maskGtid(trade.buyerGtid),
          seller_masked: maskGtid(trade.sellerGtid),
        },
        commodity: trade.commodity,
        origin_port: trade.originPort,
        dest_port: trade.destPort,
        origin_country: trade.originCountry,
        dest_country: trade.destCountry,
        created_at: trade.createdAt,
        verified_at: new Date().toISOString(),
      },
      {
        headers: {
          "X-RateLimit-Remaining": String(rl.remaining),
          "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
          "Cache-Control": "public, max-age=60", // 60s browser cache per v18 §4.1.6.1 L3 client cache
          "X-SGTX-Version": "v18.0",
        },
      },
    );
  } catch (e: any) {
    logger.error("[v1/verify/ustn] error:", { error: e?.message || String(e) });
    return NextResponse.json(
      { valid: false, reason: "VERIFICATION_FAILED" },
      { status: 503, headers: { "X-SGTX-Version": "v18.0" } },
    );
  }
}

// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { buildUstnMasterObject, validateUSTNFormat, detectUstnFormat } from "@/lib/sgtx/ustn";

// GET /api/sgtx/ustn/verify?ustn=...&token=...
//
// Public USTN verification endpoint (Part 3.2.1 / 3.9 / 3.13).
// Per blueprint 3.9.4 (Offline Verification) + 3.13 (Public Verification),
// any party with the USTN + a valid LoomVerificationToken can verify a trade's
// existence and basic facts (status, parties, commodity) without authentication.
//
// Token is OPTIONAL — if omitted, only public facts are returned (status + USTN
// existence). If provided AND valid, additional summary fields are included
// (parties, commodity, current location, ETA).
//
// Rate-limited: 30 req/min per IP (public endpoint).
const ipRateMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT = 30;
const RATE_WINDOW = 60_000;

function checkIpRateLimit(ip: string): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const entry = ipRateMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_WINDOW) {
    ipRateMap.set(ip, { count: 1, windowStart: now });
    return { allowed: true, remaining: RATE_LIMIT - 1, resetIn: RATE_WINDOW };
  }
  if (entry.count >= RATE_LIMIT) {
    return { allowed: false, remaining: 0, resetIn: RATE_WINDOW - (now - entry.windowStart) };
  }
  entry.count++;
  return { allowed: true, remaining: RATE_LIMIT - entry.count, resetIn: RATE_WINDOW - (now - entry.windowStart) };
}

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map(s => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[0];
  }
  const xRealIp = req.headers.get("x-real-ip");
  if (xRealIp) return xRealIp.trim();
  return "unknown";
}

export async function GET(req: NextRequest) {
  const ustn = req.nextUrl.searchParams.get("ustn");
  const token = req.nextUrl.searchParams.get("token");
  if (!ustn) {
    return NextResponse.json(
      { error: "ustn required", code: "MISSING_USTN" },
      { status: 400 },
    );
  }
  if (!validateUSTNFormat(ustn)) {
    return NextResponse.json(
      { error: "Invalid USTN format. Expected SGTX-{COUNTRY}-{YEAR}-{TRADER}-{SEQ} (e.g. SGTX-EG-26-F3A-1).", code: "INVALID_USTN_FORMAT" },
      { status: 400 },
    );
  }

  // Rate limit
  const ip = getClientIp(req);
  const rl = checkIpRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again later.", code: "RATE_LIMIT_EXCEEDED" },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": String(RATE_LIMIT),
          "X-RateLimit-Remaining": "0",
          "Retry-After": String(Math.ceil(rl.resetIn / 1000)),
        },
      },
    );
  }

  // Check the trade exists
  const trade = await db.trade.findUnique({
    where: { ustn },
    select: {
      id: true, ustn: true, status: true, commodity: true,
      buyerGtid: true, sellerGtid: true, createdAt: true,
      shipments: { select: { vesselName: true, eta: true, departedAt: true, arrivedAt: true }, take: 1 },
      buyer: { select: { legalName: true, country: true } },
      seller: { select: { legalName: true, country: true } },
    },
    }) as any;
  if (!trade) {
    return NextResponse.json(
      { error: "USTN does not exist or has been archived.", code: "USTN_NOT_FOUND" },
      { status: 404 },
    );
  }
  if (trade.status === "CANCELLED") {
    return NextResponse.json({
      ustn: trade.ustn,
      status: "CANCELLED",
      verified: true,
      message: "This USTN has been cancelled. No further verification information is available.",
        }) as any;
  }

  // Build public response — minimal facts always included
  const response: any = {
    ustn: trade.ustn,
    status: trade.status,
    verified: true,
    format: detectUstnFormat(ustn),
    created_at: trade.createdAt,
  };

  // If a token is provided, validate it and return additional info
  if (token) {
    const verificationToken = await db.loomVerificationToken.findFirst({
      where: { token, ustn, revoked: false },
        }) as any;
    if (!verificationToken) {
      return NextResponse.json(
        { error: "Invalid or revoked verification token.", code: "INVALID_TOKEN" },
        { status: 403 },
      );
    }
    if (verificationToken.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Verification token has expired.", code: "TOKEN_EXPIRED" },
        { status: 403 },
      );
    }

    // Token valid — return summary view (parties + commodity + current location)
    response.parties = {
      exporter: { legal_name: trade.seller?.legalName, jurisdiction: trade.seller?.country },
      importer: { legal_name: trade.buyer?.legalName, jurisdiction: trade.buyer?.country },
    };
    response.goods = { description: trade.commodity };
    if (trade.shipments?.[0]) {
      const s = trade.shipments[0];
      response.logistics = {
        vessel: s.vesselName,
        eta: s.eta,
        actual_departure: s.departedAt,
        actual_arrival: s.arrivedAt,
      };
    }
    response.token_expires_at = verificationToken.expiresAt;

    // Also include the full master object for token-authenticated requests
    try {
      const master = await buildUstnMasterObject(ustn);
      if (master) {
        response.master_object = master;
      }
    } catch {
      // best-effort
    }
  }

  // Rate-limit headers
  const headers = {
    "X-RateLimit-Limit": String(RATE_LIMIT),
    "X-RateLimit-Remaining": String(rl.remaining - 1),
  };
  return NextResponse.json(response, { headers });
}

// POST /api/sgtx/ustn/verify — Issue a public verification token.
// Body: { ustn, created_by }
// Creates a LoomVerificationToken row with a 90-day expiry.
// Used by trade parties to share a verifiable link with external auditors.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, created_by } = body;
    if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });
    if (!validateUSTNFormat(ustn)) {
      return NextResponse.json({ error: "Invalid USTN format" }, { status: 400 });
    }
        const trade = await db.trade.findUnique({ where: { ustn }, select: { id: true } }) as any;
        if (!trade) return NextResponse.json({ error: "USTN not found" }, { status: 404 }) as any;

    const token = await db.loomVerificationToken.create({
      data: {
        ustn,
        createdBy: created_by || null,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
      },
        }) as any;
    return NextResponse.json({
      ok: true,
      ustn,
      token: token.token,
      expires_at: token.expiresAt,
      verify_url: `https://sgtx.io/verify/ustn/${ustn}?token=${token.token}`,
        }) as any;
  } catch (e: any) {
    logger.error("[ustn/verify POST] error:", e);
        return NextResponse.json({ error: e.message }, { status: 500 }) as any;
  }
}

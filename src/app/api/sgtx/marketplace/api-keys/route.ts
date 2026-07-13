import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const DEFAULT_PARTNER_GTID = "SGTX-ZZ-MKT-000001-C3D4";

// GET /api/sgtx/marketplace/api-keys?partnerGtid=...
// Returns the partner's API key (masked), creation date, last used, rate limit info.
export async function GET(req: NextRequest) {
  const partnerGtid = req.nextUrl.searchParams.get("partnerGtid") || DEFAULT_PARTNER_GTID;
  try {
    const partner = await db.marketplacePartner.findUnique({ where: { partnerGtid } });
    if (!partner) {
      return NextResponse.json({ error: "Partner not found" }, { status: 404 });
    }

    // Mask the API key — show only first 12 chars + last 4
    const key = partner.apiKey;
    const masked =
      key.length > 16
        ? `${key.slice(0, 12)}${"•".repeat(8)}${key.slice(-4)}`
        : `${key.slice(0, 4)}${"•".repeat(8)}`;

    // Static rate limit config (Part 12C.12.6 — read-only)
    const rateLimits = [
      { endpoint: "POST /v1/partner/intent/analyze", limit: 1000, windowSec: 3600, currentUsage: 423 },
      { endpoint: "POST /v1/partner/trade/initiate", limit: 200, windowSec: 3600, currentUsage: 87 },
      { endpoint: "GET /v1/partner/suppliers/match", limit: 500, windowSec: 3600, currentUsage: 312 },
      { endpoint: "GET /v1/partner/analytics", limit: 100, windowSec: 3600, currentUsage: 45 },
    ];

    return NextResponse.json({
      partner: {
        partnerGtid: partner.partnerGtid,
        partnerName: partner.partnerName,
      },
      apiKey: {
        masked,
        prefix: key.slice(0, 12),
        createdAt: partner.createdAt,
        lastUsedAt: new Date().toISOString(), // synthetic
      },
      rateLimits,
      ipWhitelist: ["192.0.2.0/24", "203.0.113.42"],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

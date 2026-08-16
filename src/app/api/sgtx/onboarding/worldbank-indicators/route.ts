// GET /api/sgtx/onboarding/worldbank-indicators?country=EG
//   Returns the country logistics profile (LPI, Trade %, tariff rate,
//   GDP per capita, ease of doing business) by composing 5 World Bank
//   indicator fetches. Cached in-memory (24h TTL).
//
// Optional query params:
//   ?country=EG      ISO 3166-1 alpha-2 country code (required)
//
// Example:
//   curl 'https://sgtx.io/api/sgtx/onboarding/worldbank-indicators?country=EG'
//   → { ok: true, country: 'EG', profile: { lpi: 2.7, tradePctGdp: 37.5, ... } }
import { NextRequest, NextResponse } from "next/server";
import { getCountryLogisticsProfile } from "@/lib/sgtx/onboarding/worldbank-indicators-sync";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const country = (searchParams.get("country") ?? "").toUpperCase().trim();
    if (!country || country.length !== 2) {
      return NextResponse.json(
        { error: "Required: ?country=XX (ISO 3166-1 alpha-2)" },
        { status: 400 },
      );
    }
    const profile = await getCountryLogisticsProfile(country);
    return NextResponse.json({ ok: true, country, profile });
  } catch (e: any) {
    logger.error("worldbank-indicators GET failed", {
      error: e?.message ?? String(e),
    });
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}

// GET /api/sgtx/compliance/imf-indicators?country=US&indicator=PCPI_IX
// GET /api/sgtx/compliance/imf-indicators?country=US&indicator=risk
//
// Returns the cached — or live-fetched — IMF indicator value for the given
// country × indicator. Use indicator=risk to get the composite 0-100
// emerging-market risk score.
//
// Source: dataservices.imf.org (IMF SDMX REST API, free, no auth).
import { NextRequest, NextResponse } from "next/server";
import {
  getCountryIndicator,
  getCountryRiskScore,
  getImfCacheStats,
  IMF_INDICATORS,
} from "@/lib/sgtx/compliance/imf-indicators-sync";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const country = (searchParams.get("country") ?? "").toUpperCase();
    const indicator = (searchParams.get("indicator") ?? "").toUpperCase();
    if (!country || !indicator) {
      return NextResponse.json(
        {
          error: "Required: ?country=ISO2&indicator=PCPI_IX|NGDP_R|TXG_FOB|TMG_CIF|BCA|risk",
          cacheStats: getImfCacheStats(),
        },
        { status: 400 },
      );
    }

    if (indicator === "RISK") {
      const result = await getCountryRiskScore(country);
      return NextResponse.json({ ...result, ok: result.ok, country });
    }

    // Validate indicator against the known set (we still allow ad-hoc codes
    // for forward-compat — IMF publishes hundreds of series).
    const knownIndicators = Object.values(IMF_INDICATORS) as string[];
    if (!knownIndicators.includes(indicator)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Unknown indicator '${indicator}'. Known: ${knownIndicators.join(", ")}`,
          cacheStats: getImfCacheStats(),
        },
        { status: 400 },
      );
    }

    const record = await getCountryIndicator(country, indicator);
    return NextResponse.json({
      ok: record !== null,
      country,
      indicator,
      record,
      cacheStats: getImfCacheStats(),
    });
  } catch (e: any) {
    logger.error("imf-indicators GET failed", { error: e?.message ?? String(e) });
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}

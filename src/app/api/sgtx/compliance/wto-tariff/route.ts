// GET /api/sgtx/compliance/wto-tariff?country=USA&hsCode=100190
//
// Returns the cached — or live-fetched — applied MFN tariff rate for the
// given reporter country × HS code. Source: tariffdata.wto.org.
import { NextRequest, NextResponse } from "next/server";
import { getMfnTariff, getWtoCacheStats } from "@/lib/sgtx/compliance/wto-tariff-sync";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const country = (searchParams.get("country") ?? "").toUpperCase();
    const hsCode = (searchParams.get("hsCode") ?? "").trim();
    if (!country || !hsCode) {
      return NextResponse.json(
        { error: "Required: ?country=ISO3&hsCode=HS", cacheStats: getWtoCacheStats() },
        { status: 400 },
      );
    }
    const result = await getMfnTariff(country, hsCode);
    return NextResponse.json({ ...result, ok: result.ok, country, hsCode });
  } catch (e: any) {
    logger.error("wto-tariff GET failed", { error: e?.message ?? String(e) });
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}

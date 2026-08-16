// GET /api/sgtx/onboarding/countries/lookup?countryCode=EG
import { NextRequest, NextResponse } from "next/server";
import { getCountryData } from "@/lib/sgtx/onboarding/restcountries-sync";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const countryCode = (searchParams.get("countryCode") ?? "").toUpperCase();
    if (!countryCode || countryCode.length !== 2) {
      return NextResponse.json(
        { error: "Required: ?countryCode=XX (ISO 3166-1 alpha-2)" },
        { status: 400 },
      );
    }
    const row = await getCountryData(countryCode);
    return NextResponse.json({ ok: true, countryCode, country: row });
  } catch (e: any) {
    logger.error("countries lookup GET failed", { error: e?.message ?? String(e) });
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}

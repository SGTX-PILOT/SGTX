// @ts-nocheck
// §1 Country Activation — GET list of all activated country codes (step20 complete + status=ACTIVATED)
// GET /api/sgtx/regulatory/activation/activated-countries
import { NextResponse } from "next/server";
import { getActivatedCountries } from "@/lib/sgtx/country-activation";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(_req: Request) {
  try {
    const countries = await getActivatedCountries();
    return NextResponse.json({ countries, count: countries.length });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/regulatory/activation/activated-countries] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

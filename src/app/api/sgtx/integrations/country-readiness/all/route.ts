// @ts-nocheck
// §8 Country Readiness — worldwide summary
// GET /api/sgtx/integrations/country-readiness/all
import { NextResponse } from "next/server";
import { getAllCountriesReadiness } from "@/lib/sgtx/country-readiness";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const countries = await getAllCountriesReadiness();
    return NextResponse.json({ countries });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/integrations/country-readiness/all] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

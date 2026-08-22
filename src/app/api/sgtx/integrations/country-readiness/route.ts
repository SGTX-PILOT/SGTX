// @ts-nocheck
// §8 Country Readiness — GET all dimensions for a country
// GET /api/sgtx/integrations/country-readiness?countryCode=X
import { NextResponse } from "next/server";
import { getCountryReadiness } from "@/lib/sgtx/country-readiness";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const countryCode = url.searchParams.get("countryCode") || "";
    if (!countryCode) {
      return NextResponse.json(
        { error: "countryCode required" },
        { status: 400 },
      );
    }
    const dimensions = await getCountryReadiness(countryCode);
    return NextResponse.json({ countryCode, dimensions });
  } catch (err: any) {
    logger.error("[api/sgtx/integrations/country-readiness] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// @ts-nocheck
// §8 Country Readiness — summary
// GET /api/sgtx/integrations/country-readiness/summary?countryCode=X
import { NextResponse } from "next/server";
import { getCountryReadinessSummary } from "@/lib/sgtx/country-readiness";
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
    const summary = await getCountryReadinessSummary(countryCode);
    return NextResponse.json({ summary });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/integrations/country-readiness/summary] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

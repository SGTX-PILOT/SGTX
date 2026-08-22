// @ts-nocheck
// §8 Country Readiness — POST assess + upsert
// POST /api/sgtx/integrations/country-readiness/assess?countryCode=X
import { NextResponse } from "next/server";
import { assessCountryReadiness } from "@/lib/sgtx/country-readiness";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const countryCode = url.searchParams.get("countryCode") || "";
    if (!countryCode) {
      return NextResponse.json(
        { error: "countryCode required" },
        { status: 400 },
      );
    }
    const result = await assessCountryReadiness(countryCode);
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/integrations/country-readiness/assess] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

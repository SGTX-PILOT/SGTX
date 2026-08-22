// @ts-nocheck
// §8 Country Readiness — by dimension
// GET /api/sgtx/integrations/country-readiness/dimension?countryCode=X&dimension=Y
import { NextResponse } from "next/server";
import { getCountryReadinessByDimension } from "@/lib/sgtx/country-readiness";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const countryCode = url.searchParams.get("countryCode") || "";
    const dimension = url.searchParams.get("dimension") || "";
    if (!countryCode) {
      return NextResponse.json(
        { error: "countryCode required" },
        { status: 400 },
      );
    }
    if (!dimension) {
      return NextResponse.json(
        { error: "dimension required" },
        { status: 400 },
      );
    }
    const row = await getCountryReadinessByDimension(countryCode, dimension);
    if (!row) {
      return NextResponse.json(
        { error: "country readiness not found for dimension" },
        { status: 404 },
      );
    }
    return NextResponse.json({ row });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/integrations/country-readiness/dimension] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

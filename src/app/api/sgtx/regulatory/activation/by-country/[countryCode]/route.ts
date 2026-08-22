// @ts-nocheck
// §1 Country Activation — GET workflow by country code (ISO alpha-2)
// GET /api/sgtx/regulatory/activation/by-country/[countryCode]
import { NextResponse } from "next/server";
import { getActivationByCountry } from "@/lib/sgtx/country-activation";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ countryCode: string }> },
) {
  try {
    const { countryCode } = await params;
    if (!countryCode) {
      return NextResponse.json(
        { error: "countryCode required" },
        { status: 400 },
      );
    }
    const workflow = await getActivationByCountry(countryCode);
    if (!workflow) {
      return NextResponse.json(
        { error: "no activation workflow for this country" },
        { status: 404 },
      );
    }
    return NextResponse.json({ workflow });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/regulatory/activation/by-country/[countryCode]] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// @ts-nocheck
// §8 Country Readiness — list with filters
// GET /api/sgtx/integrations/country-readiness/list?countryCode=X&dimension=Y&readinessLevel=Z
import { NextResponse } from "next/server";
import { listCountryReadiness } from "@/lib/sgtx/country-readiness";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const filters: any = {};
    const countryCode = url.searchParams.get("countryCode") || undefined;
    const dimension = url.searchParams.get("dimension") || undefined;
    const readinessLevel = url.searchParams.get("readinessLevel") || undefined;
    if (countryCode) filters.countryCode = countryCode;
    if (dimension) filters.dimension = dimension;
    if (readinessLevel) filters.readinessLevel = readinessLevel;
    const rows = await listCountryReadiness(filters);
    return NextResponse.json({ rows });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/integrations/country-readiness/list] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

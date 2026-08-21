// @ts-nocheck
// GET /api/sgtx/jurisdiction/list
// Query params:
//   ?status=ACTIVE|NOT_ACTIVE|INCOMPLETE|STALE
//   ?type=COUNTRY|CUSTOMS_TERRITORY|REGIONAL_UNION|... (JurisdictionFabric.jurisdictionType)
// Returns all jurisdictions matching the (optional) filters, ordered by code.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || undefined;
    const type = searchParams.get("type") || undefined;

    const where: any = {};
    if (status) where.status = status;
    if (type) where.jurisdictionType = type;

    const jurisdictions = await db.jurisdictionFabric.findMany({
      where,
      orderBy: { code: "asc" },
    });

    return NextResponse.json({ jurisdictions, count: jurisdictions.length });
  } catch (err: any) {
    logger.error("[api/sgtx/jurisdiction/list] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

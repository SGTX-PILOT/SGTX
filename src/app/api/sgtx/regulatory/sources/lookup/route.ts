// @ts-nocheck
// SGTX Phase 2 §7 ADMIN — Regulatory Source lookup API
//   GET /api/sgtx/regulatory/sources/lookup
//   Query: ?jurisdictionId=X&legalStatus=Y
//   Returns: RegulatorySource rows — lets the admin view the source backing
//   for each classification / tariff / origin / trade-agreement rule.
//   Mirrors the Phase 1 /api/sgtx/jurisdiction/sources GET (returns a JSON array).
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const jurisdictionId =
      url.searchParams.get("jurisdictionId") || undefined;
    const legalStatus = url.searchParams.get("legalStatus") || undefined;

    const where: any = {};
    if (jurisdictionId) where.jurisdictionId = jurisdictionId;
    if (legalStatus) where.legalStatus = legalStatus;

    const sources = await db.regulatorySource.findMany({
      where,
      include: {
        jurisdiction: { select: { code: true, name: true } },
      },
      orderBy: [{ updatedAt: "desc" }],
    });
    return NextResponse.json({ sources, count: sources.length });
  } catch (err: any) {
    logger.error("[api/sgtx/regulatory/sources/lookup] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

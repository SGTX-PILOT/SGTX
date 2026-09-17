// @ts-nocheck
// SGTX Phase 3 §7 — Sanctions Engine API
//   GET /api/sgtx/compliance/sanctions/screenings — list SanctionsScreening rows
//        Query: ?screeningType=&matchedList=&verdict=&jurisdictionCode=&screenedValue=
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { listSanctionsScreenings } from "@/lib/sgtx/sanctions";

export const dynamic = "force-dynamic";

// GET — list SanctionsScreening rows filtered by type / list / verdict /
// jurisdiction / screenedValue (case-insensitive contains).
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const screeningType = url.searchParams.get("screeningType") || undefined;
    const matchedList = url.searchParams.get("matchedList") || undefined;
    const verdict = url.searchParams.get("verdict") || undefined;
    const jurisdictionCode =
      url.searchParams.get("jurisdictionCode") || undefined;
    const screenedValue = url.searchParams.get("screenedValue") || undefined;

    const screenings = await listSanctionsScreenings({
      screeningType,
      matchedList,
      verdict,
      jurisdictionCode,
      screenedValue,
    });
    return NextResponse.json({
      screenings,
      count: screenings.length,
    });
  } catch (err: any) {
    logger.error("[api/sgtx/compliance/sanctions/screenings] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

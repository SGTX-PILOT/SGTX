// @ts-nocheck
// POST /api/sgtx/road/corridors
// Body: CreateRoadCorridorInput (ustn, originCountry, destinationCountry, transitCountries, legs, borderCrossings, ...)
// Returns: { corridor }
import { NextRequest, NextResponse } from "next/server";
import { createRoadCorridor } from "@/lib/sgtx/road-corridor";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const corridor = await createRoadCorridor(body);
    return NextResponse.json({ corridor });
  } catch (err: any) {
    logger.error("[api/road/corridors] POST failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "createRoadCorridor failed" },
      { status: 500 },
    );
  }
}

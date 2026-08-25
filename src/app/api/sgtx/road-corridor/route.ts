// @ts-nocheck
// GET  /api/sgtx/road-corridor        — list road corridors (filter by status/origin/dest)
// POST /api/sgtx/road-corridor        — create a new road corridor with optional legs
//
// Blueprint v13.1 FINAL — Article 43 (Road Corridor Engine). Defensive at every
// layer; lib functions return null/[] on failure so the route handler never
// crashes when Turso tables are missing.

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  createRoadCorridor,
  listRoadCorridors,
} from "@/lib/sgtx/road-corridor/mvp";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const takeParam = url.searchParams.get("take");
    const filter = {
      status: url.searchParams.get("status") || undefined,
      originCountry: url.searchParams.get("originCountry") || undefined,
      destinationCountry: url.searchParams.get("destinationCountry") || undefined,
      take: takeParam ? parseInt(takeParam, 10) : undefined,
    };

    const corridors = await listRoadCorridors(filter);
    return NextResponse.json({ ok: true, corridors, count: corridors.length, filter });
  } catch (e: any) {
    logger.error("[api/road-corridor] GET list failed", { error: e?.message || String(e) });
    return NextResponse.json(
      { ok: false, error: e?.message || "Internal server error", corridors: [], count: 0 },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const corridor = await createRoadCorridor(body || {});
    if (!corridor) {
      return NextResponse.json(
        { error: "Failed to create corridor (check required fields: corridorCode, originCountry, destinationCountry)" },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true, corridor }, { status: 201 });
  } catch (e: any) {
    logger.error("[api/road-corridor] POST create failed", { error: e?.message || String(e) });
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

// @ts-nocheck
// GET  /api/sgtx/rail/train — list train services (filter: ?operatorGtid= | ?status= | ?originTerminal= | ?destinationTerminal= | ?limit=)
// POST /api/sgtx/rail/train — register a new train service

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { listTrains, registerTrain } from "@/lib/sgtx/rail";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const filter = {
      operatorGtid: url.searchParams.get("operatorGtid") || undefined,
      status: url.searchParams.get("status") || undefined,
      originTerminal: url.searchParams.get("originTerminal") || undefined,
      destinationTerminal: url.searchParams.get("destinationTerminal") || undefined,
      limit: url.searchParams.get("limit") ? parseInt(url.searchParams.get("limit")!, 10) : undefined,
    };
    const trains = await listTrains(filter);
    return NextResponse.json({ ok: true, trains, count: trains.length, filter });
  } catch (e: any) {
    logger.error("[rail/train/GET] failed", { error: e?.message || String(e) });
    return NextResponse.json({ ok: false, error: e?.message || "Internal server error", trains: [], count: 0 }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await registerTrain(body);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result, { status: 201 });
  } catch (e: any) {
    logger.error("[rail/train/POST] failed", { error: e?.message || String(e) });
    return NextResponse.json({ ok: false, error: e?.message || "Internal server error" }, { status: 500 });
  }
}

// @ts-nocheck
// §1 Transport Leg — link leg to mode engine (ROAD_CORRIDOR / AIR_CARGO / etc.)
// POST /api/sgtx/transport/legs/[legId]/link-mode-engine  body: { modeEngineRef, modeEngineType }
import { NextResponse } from "next/server";
import { linkLegToModeEngine } from "@/lib/sgtx/transport-graph";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ legId: string }> },
) {
  try {
    const { legId } = await params;
    if (!legId) {
      return NextResponse.json({ error: "legId required" }, { status: 400 });
    }
    const body = await req.json();
    if (!body?.modeEngineRef || !body?.modeEngineType) {
      return NextResponse.json(
        { error: "modeEngineRef and modeEngineType required" },
        { status: 400 },
      );
    }
    const result = await linkLegToModeEngine(
      legId,
      body.modeEngineRef,
      body.modeEngineType,
    );
    if (result && result.ok === false) {
      const status = result.error === "LEG_NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: result.error, detail: result }, { status });
    }
    return NextResponse.json({ leg: result });
  } catch (err: any) {
    logger.error("[api/transport/legs/[legId]/link-mode-engine] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// @ts-nocheck
// DCSA Gate Moves API
import { NextRequest, NextResponse } from "next/server";
import { recordGateMove } from "@/lib/sgtx/dcsa";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ustn = searchParams.get("ustn");
    const containerId = searchParams.get("containerId");
    const where: any = {};
    if (ustn) where.ustn = ustn;
    if (containerId) where.containerId = containerId;
    const moves = await db.dcsaGateMove.findMany({ where, orderBy: { moveDateTime: "desc" }, take: 50 });
    return NextResponse.json({ ok: true, moves });
  } catch (err: any) {
    logger.error("[api/dcsa/gate] GET failed", { error: err?.message });
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const move = await recordGateMove(body);
    return NextResponse.json({ ok: true, move });
  } catch (err: any) {
    logger.error("[api/dcsa/gate] POST failed", { error: err?.message });
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}

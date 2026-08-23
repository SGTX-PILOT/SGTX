// @ts-nocheck
// §6-8 State Vector — GET (getStateVector) + POST (getOrCreateStateVector)
// GET  /api/sgtx/constitutional/state-vector?ustn=X
// POST /api/sgtx/constitutional/state-vector  body: { ustn }
import { NextResponse } from "next/server";
import { getStateVector, getOrCreateStateVector } from "@/lib/sgtx/state-vector";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn") || undefined;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const sv = await getStateVector(ustn);
    if (!sv) {
      return NextResponse.json(
        { error: "state vector not found", stateVector: null },
        { status: 404 },
      );
    }
    return NextResponse.json({ stateVector: sv });
  } catch (err: any) {
    logger.error("[api/constitutional/state-vector] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const ustn = body?.ustn;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const sv = await getOrCreateStateVector(ustn);
    return NextResponse.json({ stateVector: sv });
  } catch (err: any) {
    logger.error("[api/constitutional/state-vector] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

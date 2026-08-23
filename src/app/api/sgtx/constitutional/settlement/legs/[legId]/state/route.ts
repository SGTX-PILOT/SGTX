// @ts-nocheck
// §140 Settlement Orchestration — update a payment leg's state
// POST /api/sgtx/constitutional/settlement/legs/[legId]/state  body: { newState, metadata? }
import { NextResponse } from "next/server";
import { updateLegState } from "@/lib/sgtx/settlement-orchestration";
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
    const body = await req.json().catch(() => ({}));
    const { newState, metadata } = body || {};
    if (!newState) {
      return NextResponse.json({ error: "newState required" }, { status: 400 });
    }
    const updated = await updateLegState(legId, String(newState), metadata);
    if (!updated) {
      return NextResponse.json(
        { error: "updateLegState failed — see logs" },
        { status: 500 },
      );
    }
    return NextResponse.json({ leg: updated });
  } catch (err: any) {
    logger.error(
      "[api/constitutional/settlement/legs/[legId]/state] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

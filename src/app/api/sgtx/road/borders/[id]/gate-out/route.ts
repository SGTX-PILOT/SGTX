// @ts-nocheck
// POST /api/sgtx/road/borders/{id}/gate-out
// Body: {} (borderId in URL)
// Records border gate-out. Auto-selects next state (TRANSIT_ACTIVE or DESTINATION_CUSTOMS).
import { NextRequest, NextResponse } from "next/server";
import { recordBorderGateOut } from "@/lib/sgtx/road-corridor";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "border id required" }, { status: 400 });
    }
    const result = await recordBorderGateOut(id);
    return NextResponse.json({ borderId: id, ...result });
  } catch (err: any) {
    logger.error("[api/road/borders/[id]/gate-out] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

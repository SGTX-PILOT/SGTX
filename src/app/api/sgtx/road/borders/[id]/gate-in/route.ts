// @ts-nocheck
// POST /api/sgtx/road/borders/{id}/gate-in
// Body: {} (borderId in URL)
// Records border gate-in. Updates corridor status to BORDER_GATE_IN.
import { NextRequest, NextResponse } from "next/server";
import { recordBorderGateIn } from "@/lib/sgtx/road-corridor";
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
    const result = await recordBorderGateIn(id);
    return NextResponse.json({ borderId: id, ...result });
  } catch (err: any) {
    logger.error("[api/road/borders/[id]/gate-in] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

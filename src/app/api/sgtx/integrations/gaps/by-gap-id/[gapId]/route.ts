// @ts-nocheck
// §4 Gap Analysis — GET by gapId (GAP-YYYYMMDD-NNNNN)
// GET /api/sgtx/integrations/gaps/by-gap-id/[gapId]
import { NextResponse } from "next/server";
import { getGapByGapId } from "@/lib/sgtx/gap-analysis";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ gapId: string }> },
) {
  try {
    const { gapId } = await params;
    if (!gapId) {
      return NextResponse.json({ error: "gapId required" }, { status: 400 });
    }
    const gap = await getGapByGapId(gapId);
    if (!gap) {
      return NextResponse.json({ error: "gap not found" }, { status: 404 });
    }
    return NextResponse.json({ gap });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/integrations/gaps/by-gap-id/[gapId]] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

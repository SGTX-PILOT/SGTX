// @ts-nocheck
// §2 Regulatory Changes — GET by business changeId (RCG-YYYYMMDD-NNNNN)
// GET /api/sgtx/regulatory/changes/by-change-id/[changeId]
import { NextResponse } from "next/server";
import { getChangeByChangeId } from "@/lib/sgtx/regulatory-change";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ changeId: string }> },
) {
  try {
    const { changeId } = await params;
    if (!changeId) {
      return NextResponse.json(
        { error: "changeId required" },
        { status: 400 },
      );
    }
    const change = await getChangeByChangeId(changeId);
    if (!change) {
      return NextResponse.json(
        { error: "change not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ change });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/regulatory/changes/by-change-id/[changeId]] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

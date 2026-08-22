// @ts-nocheck
// §3 Impact Engine — POST simulate change (IMPACTED → SIMULATED)
// POST /api/sgtx/regulatory/impact/[changeId]/simulate  → simulateChange
import { NextResponse } from "next/server";
import { simulateChange } from "@/lib/sgtx/impact-engine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
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
    const simulation = await simulateChange(changeId);
    if (!simulation) {
      return NextResponse.json(
        { error: "change not found or not in IMPACTED state" },
        { status: 404 },
      );
    }
    return NextResponse.json({ simulation });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/regulatory/impact/[changeId]/simulate] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

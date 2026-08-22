// @ts-nocheck
// §3 Impact Engine — POST assess impact (VERIFIED → IMPACTED)
// POST /api/sgtx/regulatory/impact/[changeId]/assess  → assessImpact
import { NextResponse } from "next/server";
import { assessImpact } from "@/lib/sgtx/impact-engine";
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
    const impact = await assessImpact(changeId);
    if (!impact) {
      return NextResponse.json(
        { error: "change not found or not in VERIFIED state" },
        { status: 404 },
      );
    }
    return NextResponse.json({ impact });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/regulatory/impact/[changeId]/assess] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

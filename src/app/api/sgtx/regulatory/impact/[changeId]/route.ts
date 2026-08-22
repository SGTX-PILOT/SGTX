// @ts-nocheck
// §3 Impact Engine — GET stored impact assessment
// GET /api/sgtx/regulatory/impact/[changeId]
import { NextResponse } from "next/server";
import { getImpactAssessment } from "@/lib/sgtx/impact-engine";
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
    const impact = await getImpactAssessment(changeId);
    if (!impact) {
      return NextResponse.json(
        { error: "impact assessment not yet run for this change" },
        { status: 404 },
      );
    }
    return NextResponse.json({ impact });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/regulatory/impact/[changeId]] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

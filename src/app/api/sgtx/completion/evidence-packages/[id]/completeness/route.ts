// @ts-nocheck
// §5 Evidence Packages — completeness score (detailed)
// GET /api/sgtx/completion/evidence-packages/[id]/completeness
import { NextResponse } from "next/server";
import { getCompletenessScore } from "@/lib/sgtx/evidence-package";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const report = await getCompletenessScore(id);
    return NextResponse.json({ completeness: report });
  } catch (err: any) {
    logger.error(
      "[api/completion/evidence-packages/[id]/completeness] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

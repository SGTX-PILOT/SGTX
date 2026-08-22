// @ts-nocheck
// §4 Documentary Matching — ready for presentation?
// GET /api/sgtx/finance/documentary-match/[id]/ready
import { NextResponse } from "next/server";
import { isReadyForPresentation } from "@/lib/sgtx/documentary-matching";
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
    const readiness = await isReadyForPresentation(id);
    return NextResponse.json({ readiness });
  } catch (err: any) {
    logger.error("[api/finance/documentary-match/[id]/ready] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

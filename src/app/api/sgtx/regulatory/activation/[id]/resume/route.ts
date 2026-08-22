// @ts-nocheck
// §1 Country Activation — POST resume workflow (SUSPENDED → IN_PROGRESS)
// POST /api/sgtx/regulatory/activation/[id]/resume
import { NextResponse } from "next/server";
import { resumeWorkflow } from "@/lib/sgtx/country-activation";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const workflow = await resumeWorkflow(id);
    return NextResponse.json({ workflow });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/regulatory/activation/[id]/resume] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

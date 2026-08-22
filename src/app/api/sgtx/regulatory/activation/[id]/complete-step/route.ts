// @ts-nocheck
// §1 Country Activation — POST complete a step in the workflow
// POST /api/sgtx/regulatory/activation/[id]/complete-step
//      body: { stepNumber, completedBy, notes? }
import { NextResponse } from "next/server";
import { completeStep } from "@/lib/sgtx/country-activation";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    const stepNumber = Number(body.stepNumber);
    if (!Number.isInteger(stepNumber) || stepNumber < 1 || stepNumber > 20) {
      return NextResponse.json(
        { error: "stepNumber must be an integer 1..20" },
        { status: 400 },
      );
    }
    if (!body.completedBy || typeof body.completedBy !== "string") {
      return NextResponse.json(
        { error: "completedBy required" },
        { status: 400 },
      );
    }
    const workflow = await completeStep(
      id,
      stepNumber,
      body.completedBy,
      body.notes,
    );
    return NextResponse.json({ workflow });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/regulatory/activation/[id]/complete-step] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

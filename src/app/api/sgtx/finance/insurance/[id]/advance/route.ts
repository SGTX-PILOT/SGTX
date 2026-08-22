// @ts-nocheck
// §6 Insurance — advance step. Body: { stepData? }
// POST /api/sgtx/finance/insurance/[id]/advance
import { NextResponse } from "next/server";
import { advanceInsuranceStep } from "@/lib/sgtx/insurance-lifecycle";
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
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const stepData = body?.stepData || undefined;
    const lifecycle = await advanceInsuranceStep(id, stepData);
    return NextResponse.json({ lifecycle });
  } catch (err: any) {
    logger.error("[api/finance/insurance/[id]/advance] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

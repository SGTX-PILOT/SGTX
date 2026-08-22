// @ts-nocheck
// §6 Insurance — progress (step / completion percentage)
// GET /api/sgtx/finance/insurance/[id]/progress
import { NextResponse } from "next/server";
import { getInsuranceProgress } from "@/lib/sgtx/insurance-lifecycle";
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
    const progress = await getInsuranceProgress(id);
    if (!progress) {
      return NextResponse.json(
        { error: "insurance lifecycle not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ progress });
  } catch (err: any) {
    logger.error("[api/finance/insurance/[id]/progress] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

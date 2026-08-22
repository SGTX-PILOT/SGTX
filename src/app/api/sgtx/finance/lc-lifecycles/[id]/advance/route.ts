// @ts-nocheck
// §3 LC Lifecycle — advance step. Body: { stepData? }
// POST /api/sgtx/finance/lc-lifecycles/[id]/advance
import { NextResponse } from "next/server";
import { advanceLcStep } from "@/lib/sgtx/lc-engine";
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
    const lifecycle = await advanceLcStep(id, stepData);
    return NextResponse.json({ lifecycle });
  } catch (err: any) {
    logger.error("[api/finance/lc-lifecycles/[id]/advance] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

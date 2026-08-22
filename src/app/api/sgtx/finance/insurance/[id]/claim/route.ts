// @ts-nocheck
// §6 Insurance — file claim. Body: { claimAmountUsd }
// POST /api/sgtx/finance/insurance/[id]/claim
import { NextResponse } from "next/server";
import { fileClaim } from "@/lib/sgtx/insurance-lifecycle";
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
    if (!(Number(body?.claimAmountUsd) > 0)) {
      return NextResponse.json(
        { error: "claimAmountUsd must be positive" },
        { status: 400 },
      );
    }
    const lifecycle = await fileClaim(id, Number(body.claimAmountUsd));
    return NextResponse.json({ lifecycle });
  } catch (err: any) {
    logger.error("[api/finance/insurance/[id]/claim] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

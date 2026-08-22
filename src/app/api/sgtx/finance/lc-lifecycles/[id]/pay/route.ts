// @ts-nocheck
// §3 LC Lifecycle — pay LC. Body: { amountUsd }
// POST /api/sgtx/finance/lc-lifecycles/[id]/pay
import { NextResponse } from "next/server";
import { payLc } from "@/lib/sgtx/lc-engine";
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
    if (!(Number(body?.amountUsd) > 0)) {
      return NextResponse.json(
        { error: "amountUsd must be positive" },
        { status: 400 },
      );
    }
    const lifecycle = await payLc(id, Number(body.amountUsd));
    return NextResponse.json({ lifecycle });
  } catch (err: any) {
    logger.error("[api/finance/lc-lifecycles/[id]/pay] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

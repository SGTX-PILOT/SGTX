// @ts-nocheck
// SGTX Phase 3 §6 — Controlled Goods Engine API
//   GET /api/sgtx/compliance/controlled-goods/[id] — fetch a single ControlledGoodsControl by id.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getControlledGoodsControl } from "@/lib/sgtx/controlled-goods";

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
    const control = await getControlledGoodsControl(id);
    if (!control) {
      return NextResponse.json(
        { error: "controlled-goods control not found", id },
        { status: 404 },
      );
    }
    return NextResponse.json({ control });
  } catch (err: any) {
    logger.error("[api/sgtx/compliance/controlled-goods/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// @ts-nocheck
// SGTX Phase 2 §3 — Tariff Quota consumption API
//   POST /api/sgtx/regulatory/tariff/quota/[id]/consume
//   Body: { consumedQuantity }
//   Returns: the updated TariffRule row.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { applyQuotaConsumption } from "@/lib/sgtx/tariff";

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
      return NextResponse.json(
        { error: "request body required" },
        { status: 400 },
      );
    }
    const consumedQuantity = Number(body.consumedQuantity);
    if (!Number.isFinite(consumedQuantity) || consumedQuantity < 0) {
      return NextResponse.json(
        { error: "consumedQuantity must be a non-negative number" },
        { status: 400 },
      );
    }
    const rule = await applyQuotaConsumption(id, consumedQuantity);
    return NextResponse.json({ rule });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/regulatory/tariff/quota/[id]/consume] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

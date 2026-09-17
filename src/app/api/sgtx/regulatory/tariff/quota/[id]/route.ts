// @ts-nocheck
// SGTX Phase 2 §3 — Tariff Quota availability check API
//   GET /api/sgtx/regulatory/tariff/quota/[id]?requestedQuantity=N
//   Returns: QuotaStatus (quotaOpen, quotaRemaining, wouldExceed, ...).
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { checkQuotaAvailability } from "@/lib/sgtx/tariff";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const url = new URL(req.url);
    const qtyParam = url.searchParams.get("requestedQuantity");
    if (qtyParam == null) {
      return NextResponse.json(
        { error: "requestedQuantity query param required" },
        { status: 400 },
      );
    }
    const requestedQuantity = Number(qtyParam);
    if (!Number.isFinite(requestedQuantity) || requestedQuantity < 0) {
      return NextResponse.json(
        { error: "requestedQuantity must be a non-negative number" },
        { status: 400 },
      );
    }
    const status = await checkQuotaAvailability(id, requestedQuantity);
    return NextResponse.json({ status });
  } catch (err: any) {
    logger.error("[api/sgtx/regulatory/tariff/quota/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// @ts-nocheck
// SGTX Phase 4 §1 — Customs Operations API
//   POST /api/sgtx/government/customs-operations/[id]/cancel
//   Body: { reason }
//   Calls cancelCustomsOperation(operationId, reason) — cancels a previously-
//   submitted declaration via the gateway and transitions the operation to
//   GOVERNMENT_REJECTED (the §4 terminal state for a cancelled declaration).
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  cancelCustomsOperation,
  getCustomsOperation,
} from "@/lib/sgtx/customs-engine";

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
    const existing = await getCustomsOperation(id);
    if (!existing) {
      return NextResponse.json(
        { error: "customs operation not found", id },
        { status: 404 },
      );
    }
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "request body required" },
        { status: 400 },
      );
    }
    const reason = typeof body.reason === "string" ? body.reason : "";
    if (!reason) {
      return NextResponse.json(
        { error: "reason required" },
        { status: 400 },
      );
    }
    const result = await cancelCustomsOperation(id, reason);
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/government/customs-operations/[id]/cancel] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

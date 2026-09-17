// @ts-nocheck
// SGTX Phase 4 §1 — Customs Operations API
//   POST /api/sgtx/government/customs-operations/[id]/submit
//   Body: { connectorId, idempotencyKey? }
//   Calls submitCustomsOperation(operationId, connectorId, idempotencyKey?).
//   Transitions the operation SGTX_READY → SUBMITTED → GOVERNMENT_ACCEPTED /
//   GOVERNMENT_REJECTED / GOVERNMENT_HOLD based on the gateway response.
//   §9: pass an idempotencyKey for duplicate detection.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  submitCustomsOperation,
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
    // 404 the operation early so callers get a clear not-found.
    const existing = await getCustomsOperation(id);
    if (!existing) {
      return NextResponse.json(
        { error: "customs operation not found", id },
        { status: 404 },
      );
    }
    const body = await req.json().catch(() => ({}));
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "request body required" },
        { status: 400 },
      );
    }
    const connectorId = typeof body.connectorId === "string" ? body.connectorId : "";
    if (!connectorId) {
      return NextResponse.json(
        { error: "connectorId required" },
        { status: 400 },
      );
    }
    const idempotencyKey =
      typeof body.idempotencyKey === "string" && body.idempotencyKey.length > 0
        ? body.idempotencyKey
        : undefined;
    const result = await submitCustomsOperation(id, connectorId, idempotencyKey);
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/government/customs-operations/[id]/submit] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

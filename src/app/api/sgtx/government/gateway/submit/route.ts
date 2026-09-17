// @ts-nocheck
// SGTX Phase 4 §2 + §9 — Government Gateway operation #5: submit
//   POST /api/sgtx/government/gateway/submit
//   Body: { connectorId, operationType, payload, idempotencyKey? }
//   Calls submit(connectorId, operationType, payload, idempotencyKey?).
//   §9: if an idempotencyKey is supplied and a prior SUCCESS call exists,
//   the gateway returns { ok:true, status:"DUPLICATE", duplicate:true, ... }.
//   This endpoint surfaces the duplicate flag verbatim so callers can act on it.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { submit } from "@/lib/sgtx/gov-gateway";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
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
    const operationType = typeof body.operationType === "string" ? body.operationType : "";
    if (!operationType) {
      return NextResponse.json(
        { error: "operationType required" },
        { status: 400 },
      );
    }
    if (body.payload === undefined || body.payload === null) {
      return NextResponse.json(
        { error: "payload required" },
        { status: 400 },
      );
    }
    const idempotencyKey =
      typeof body.idempotencyKey === "string" && body.idempotencyKey.length > 0
        ? body.idempotencyKey
        : undefined;

    const result = await submit(connectorId, operationType, body.payload, idempotencyKey);

    if (!result.ok && result.error === "connector not found") {
      return NextResponse.json(
        { error: result.error, connectorId },
        { status: 404 },
      );
    }

    // §9 — surface the duplicate flag so callers can act on it (return the
    // prior response payload instead of re-submitting). The HTTP status is
    // 200 (the call was successful — it returned a cached response).
    return NextResponse.json({
      result,
      duplicate: result.duplicate === true,
    });
  } catch (err: any) {
    logger.error("[api/sgtx/government/gateway/submit] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

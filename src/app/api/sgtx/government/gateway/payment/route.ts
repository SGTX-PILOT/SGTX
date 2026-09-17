// @ts-nocheck
// SGTX Phase 4 §2 — Government Gateway operation #14: payment
//   POST /api/sgtx/government/gateway/payment
//   Body: { connectorId, paymentDetails }
//   Calls payment(connectorId, paymentDetails) — submits a payment
//   (duty, tax, fee) to the government system.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { payment } from "@/lib/sgtx/gov-gateway";

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
    if (body.paymentDetails === undefined || body.paymentDetails === null) {
      return NextResponse.json(
        { error: "paymentDetails required" },
        { status: 400 },
      );
    }
    const result = await payment(connectorId, body.paymentDetails);
    if (!result.ok && result.error === "connector not found") {
      return NextResponse.json(
        { error: result.error, connectorId },
        { status: 404 },
      );
    }
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error("[api/sgtx/government/gateway/payment] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

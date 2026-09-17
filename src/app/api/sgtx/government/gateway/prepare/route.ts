// @ts-nocheck
// SGTX Phase 4 §2 — Government Gateway operation #4: prepare
//   POST /api/sgtx/government/gateway/prepare
//   Body: { connectorId, operationType, canonicalData }
//   Calls prepare(connectorId, operationType, canonicalData) — translates
//   the canonical payload to the national format via the Single Window engine.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { prepare } from "@/lib/sgtx/gov-gateway";

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
    if (body.canonicalData === undefined || body.canonicalData === null) {
      return NextResponse.json(
        { error: "canonicalData required" },
        { status: 400 },
      );
    }
    const result = await prepare(connectorId, operationType, body.canonicalData);
    if (!result.ok && result.error === "connector not found") {
      return NextResponse.json(
        { error: result.error, connectorId },
        { status: 404 },
      );
    }
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error("[api/sgtx/government/gateway/prepare] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

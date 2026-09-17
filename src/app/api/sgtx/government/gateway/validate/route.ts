// @ts-nocheck
// SGTX Phase 4 §2 — Government Gateway operation #3: validate
//   POST /api/sgtx/government/gateway/validate
//   Body: { connectorId, payload }
//   Calls validate(connectorId, payload) — schema/field validation against
//   the national system's requirements.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { validate } from "@/lib/sgtx/gov-gateway";

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
    if (body.payload === undefined || body.payload === null) {
      return NextResponse.json(
        { error: "payload required" },
        { status: 400 },
      );
    }
    const result = await validate(connectorId, body.payload);
    if (!result.ok && result.error === "connector not found") {
      return NextResponse.json(
        { error: result.error, connectorId },
        { status: 404 },
      );
    }
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error("[api/sgtx/government/gateway/validate] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

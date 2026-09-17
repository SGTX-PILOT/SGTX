// @ts-nocheck
// SGTX Phase 4 §2 — Government Gateway operation #2: authenticate
//   POST /api/sgtx/government/gateway/authenticate
//   Body: { connectorId, credentials? }
//   Calls authenticate(connectorId, credentials?).
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { authenticate } from "@/lib/sgtx/gov-gateway";

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
    const credentials = body.credentials;
    const result = await authenticate(connectorId, credentials);
    if (!result.ok && result.error === "connector not found") {
      return NextResponse.json(
        { error: result.error, connectorId },
        { status: 404 },
      );
    }
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error("[api/sgtx/government/gateway/authenticate] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

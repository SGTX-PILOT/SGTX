// @ts-nocheck
// SGTX Phase 4 §2 — Government Gateway operation #1: discover
//   POST /api/sgtx/government/gateway/discover  Body: { connectorId }
//   Calls discover(connectorId) — returns the connector's capabilities
//   (protocols, endpoints, auth methods, enabled flags).
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { discover } from "@/lib/sgtx/gov-gateway";

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
    const result = await discover(connectorId);
    // 404 if the connector row wasn't found — the gateway returns ok:false
    // with "connector not found" so callers can distinguish a missing
    // connector from a recoverable gateway failure.
    if (!result.ok && result.error === "connector not found") {
      return NextResponse.json(
        { error: result.error, connectorId },
        { status: 404 },
      );
    }
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error("[api/sgtx/government/gateway/discover] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// @ts-nocheck
// SGTX Phase 4 §2 — Government Gateway operation #8: cancel
//   POST /api/sgtx/government/gateway/cancel
//   Body: { connectorId, governmentReference, reason }
//   Calls cancel(connectorId, governmentReference, reason).
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { cancel } from "@/lib/sgtx/gov-gateway";

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
    const governmentReference =
      typeof body.governmentReference === "string" ? body.governmentReference : "";
    if (!governmentReference) {
      return NextResponse.json(
        { error: "governmentReference required" },
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
    const result = await cancel(connectorId, governmentReference, reason);
    if (!result.ok && result.error === "connector not found") {
      return NextResponse.json(
        { error: result.error, connectorId },
        { status: 404 },
      );
    }
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error("[api/sgtx/government/gateway/cancel] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

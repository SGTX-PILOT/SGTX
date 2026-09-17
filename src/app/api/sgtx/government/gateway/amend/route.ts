// @ts-nocheck
// SGTX Phase 4 §2 — Government Gateway operation #7: amend
//   POST /api/sgtx/government/gateway/amend
//   Body: { connectorId, governmentReference, amendments }
//   Calls amend(connectorId, governmentReference, amendments).
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { amend } from "@/lib/sgtx/gov-gateway";

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
    if (body.amendments === undefined || body.amendments === null) {
      return NextResponse.json(
        { error: "amendments required" },
        { status: 400 },
      );
    }
    const result = await amend(connectorId, governmentReference, body.amendments);
    if (!result.ok && result.error === "connector not found") {
      return NextResponse.json(
        { error: result.error, connectorId },
        { status: 404 },
      );
    }
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error("[api/sgtx/government/gateway/amend] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// @ts-nocheck
// SGTX Phase 4 §2 — Government Gateway operation #15: reconcile
//   POST /api/sgtx/government/gateway/reconcile
//   Body: { connectorId, fromDate, toDate }
//   Calls reconcile(connectorId, fromDate, toDate) — fetches a reconciliation
//   report (accepted/rejected/hold counts) for the date range.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { reconcile } from "@/lib/sgtx/gov-gateway";

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
    const fromDate = typeof body.fromDate === "string" ? body.fromDate : "";
    if (!fromDate) {
      return NextResponse.json(
        { error: "fromDate required (ISO date string)" },
        { status: 400 },
      );
    }
    const toDate = typeof body.toDate === "string" ? body.toDate : "";
    if (!toDate) {
      return NextResponse.json(
        { error: "toDate required (ISO date string)" },
        { status: 400 },
      );
    }
    const result = await reconcile(connectorId, fromDate, toDate);
    if (!result.ok && result.error === "connector not found") {
      return NextResponse.json(
        { error: result.error, connectorId },
        { status: 404 },
      );
    }
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error("[api/sgtx/government/gateway/reconcile] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

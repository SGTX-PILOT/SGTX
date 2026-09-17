// @ts-nocheck
// SGTX Phase 4 §2 — Government Gateway call log
//   GET /api/sgtx/government/gateway/calls — list GovGatewayCall rows
//   Query: ?connectorId=&ustn=&operationType=&status=&idempotencyKey=
//   Calls listGatewayCalls (most-recent first, capped at 500 rows).
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { listGatewayCalls } from "@/lib/sgtx/gov-gateway";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const connectorId = url.searchParams.get("connectorId") || undefined;
    const ustn = url.searchParams.get("ustn") || undefined;
    const operationType = url.searchParams.get("operationType") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const idempotencyKey = url.searchParams.get("idempotencyKey") || undefined;

    const calls = await listGatewayCalls({
      connectorId,
      ustn,
      operationType,
      status,
      idempotencyKey,
    });
    return NextResponse.json({ calls, count: calls.length });
  } catch (err: any) {
    logger.error("[api/sgtx/government/gateway/calls] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

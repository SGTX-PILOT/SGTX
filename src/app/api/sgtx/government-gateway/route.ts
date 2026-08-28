// @ts-nocheck
/**
 * SGTX Parts 33+34 — Government Gateway API
 * GET /api/sgtx/government-gateway?connectorId=<ID>
 *   Returns: 14 ConnectorOperation descriptors
 * GET /api/sgtx/government-gateway?ustn=<USTN>
 *   Returns: AuthoritativeStatus (never manufactured)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getConnectorOperations,
  getAuthoritativeStatus,
  listConnectorOperations,
  listKnownConnectors,
} from "@/lib/sgtx/government-gateway";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const connectorId = searchParams.get("connectorId");
    const ustn = searchParams.get("ustn");

    if (ustn) {
      const status = await getAuthoritativeStatus(ustn);
      return NextResponse.json({ ok: true, status });
    }
    if (connectorId) {
      const operations = await getConnectorOperations(connectorId);
      return NextResponse.json({
        ok: true,
        connectorId,
        operationCount: operations.length,
        operations,
      });
    }
    return NextResponse.json({
      ok: true,
      operations: listConnectorOperations(),
      knownConnectors: listKnownConnectors(),
      note: "All connectors implement the 14-operation standard. Pass ?connectorId=<ID> or ?ustn=<USTN>.",
    });
  } catch (err: any) {
    logger.error("[api/government-gateway] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

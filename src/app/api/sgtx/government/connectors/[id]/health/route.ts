// @ts-nocheck
// SGTX Phase 4 §2 — Government Connectors health
//   GET /api/sgtx/government/connectors/[id]/health — derive connector health
//   Calls getConnectorStatus (HEALTHY / DEGRADED / OUTAGE / UNKNOWN).
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getConnectorStatus, getGovConnector } from "@/lib/sgtx/gov-gateway";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    // 404 if the connector row doesn't exist (so callers can distinguish a
    // missing connector from a healthy one with no recent activity).
    const existing = await getGovConnector(id);
    if (!existing) {
      return NextResponse.json(
        { error: "government connector not found", id },
        { status: 404 },
      );
    }
    const health = await getConnectorStatus(id);
    return NextResponse.json({ health, connectorId: id });
  } catch (err: any) {
    logger.error("[api/sgtx/government/connectors/[id]/health] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

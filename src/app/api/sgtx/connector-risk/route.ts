// @ts-nocheck
// SGTX Part 74 + 75 + 108 — Connector Risk / Outage Impact / Active Trade Impact
// GET /api/sgtx/connector-risk?connectorId=FASAH-AE                  — risk profile
// GET /api/sgtx/connector-risk?connectorId=FASAH-AE&view=outage      — outage impact
// GET /api/sgtx/connector-risk?connectorId=FASAH-AE&view=trades      — active trade impact
import { NextResponse } from "next/server";
import {
  getConnectorRiskProfile,
  getOutageImpact,
  getActiveTradeImpact,
} from "@/lib/sgtx/connector-risk";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const connectorId = url.searchParams.get("connectorId");
    const view = url.searchParams.get("view") || "profile";
    if (!connectorId) {
      return NextResponse.json({ error: "connectorId required" }, { status: 400 });
    }
    if (view === "outage") {
      const impact = await getOutageImpact(connectorId);
      return NextResponse.json({ ok: true, impact });
    }
    if (view === "trades") {
      const trades = await getActiveTradeImpact(connectorId);
      return NextResponse.json({ ok: true, connectorId, affectedTrades: trades, count: trades.length });
    }
    const profile = await getConnectorRiskProfile(connectorId);
    return NextResponse.json({ ok: true, profile });
  } catch (err: any) {
    logger.error("[api/sgtx/connector-risk] GET failed", { error: err?.message });
    return NextResponse.json({ error: err?.message || "internal error" }, { status: 500 });
  }
}

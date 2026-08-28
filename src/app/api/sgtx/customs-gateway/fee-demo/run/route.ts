// @ts-nocheck
/**
 * SGTX Customs Gateway — Fee Demo Scenario Runner API (§53)
 * ===========================================================================
 * POST /api/sgtx/customs-gateway/fee-demo/run
 *   Query: ?scenarioId=FEE-01&brokerGtid=<optional>
 *   Body:  { scenarioId?: string, brokerGtid?: string } (alternative to query)
 *   Returns:{ ok, result: ScenarioRunResult }
 *
 * GET  /api/sgtx/customs-gateway/fee-demo/run
 *   Returns:{ ok, scenarios: FeeDemoScenario[] }
 *
 * Runs one of the 12 required fee demo scenarios (FEE-01 … FEE-12) end-to-end
 * without persisting anything (purely in-memory synthetic state machines).
 * The result includes step-by-step details for audit / demonstration.
 *
 * L0 invariants: NON-CUSTODIAL (no funds moved), NON-MARKETPLACE (no broker
 * rankings), purely synthetic.
 */

import { NextRequest, NextResponse } from "next/server";
import { runFeeDemoScenario, FEE_DEMO_SCENARIOS } from "@/lib/sgtx/customs-gateway/fee-demo";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const qScenarioId = searchParams.get("scenarioId");
    let body: any = {};
    try { body = await req.json(); } catch { /* empty body is fine */ }
    const scenarioId = qScenarioId || body?.scenarioId;
    if (!scenarioId) {
      return NextResponse.json(
        { ok: false, error: "scenarioId is required (query or body)", scenarios: FEE_DEMO_SCENARIOS.map(s => s.id) },
        { status: 400 },
      );
    }
    const result = await runFeeDemoScenario(scenarioId);
    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    logger.error("[api/customs-gateway/fee-demo/run] POST failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    return NextResponse.json({
      ok: true,
      scenarios: FEE_DEMO_SCENARIOS,
      note: "POST with ?scenarioId=FEE-01..FEE-12 to run a specific demo end-to-end.",
    });
  } catch (err: any) {
    logger.error("[api/customs-gateway/fee-demo/run] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

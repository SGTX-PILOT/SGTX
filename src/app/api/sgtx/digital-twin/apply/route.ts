import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { acknowledgeScenario, applyScenario } from "@/lib/sgtx/digital-twin";

// POST /api/sgtx/digital-twin/apply — Acknowledge or apply a scenario.
// Per blueprint 3.19.4, "Apply Recommendation" is a one-click action.
// This endpoint records the acknowledgment/application — the actual domain
// action (e.g., creating a hedging instrument, switching corridor) is performed
// by the relevant domain endpoint called separately by the frontend.
//
// Body: { scenario_id, action: "acknowledge" | "apply" }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { scenario_id, action } = body;
    if (!scenario_id || !action) {
      return NextResponse.json({ error: "scenario_id and action required" }, { status: 400 });
    }
    if (action !== "acknowledge" && action !== "apply") {
      return NextResponse.json(
        { error: "action must be 'acknowledge' or 'apply'" },
        { status: 400 },
      );
    }

    // Verify the scenario exists
    const scenario = await db.tradeDigitalTwinScenario.findUnique({
      where: { id: scenario_id },
    });
    if (!scenario) return NextResponse.json({ error: "Scenario not found" }, { status: 404 });

    if (action === "acknowledge") {
      const result = acknowledgeScenario(scenario_id);
      return NextResponse.json({ ok: true, action, scenario_id, acknowledged: true });
    } else {
      const result = await applyScenario(scenario_id);
      return NextResponse.json({
        ok: result.ok,
        action,
        scenario_id: result.scenarioId,
        applied_at: result.appliedAt,
      });
    }
  } catch (e: any) {
    console.error("[digital-twin/apply] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

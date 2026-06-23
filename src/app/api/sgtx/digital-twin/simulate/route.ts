import { NextRequest, NextResponse } from "next/server";
import { simulateScenario, SCENARIO_TYPES, type ScenarioType } from "@/lib/sgtx/digital-twin";

// POST /api/sgtx/digital-twin/simulate — Run a Trade Digital Twin scenario.
// Per blueprint 3.19, this is ADVISORY ONLY — it never blocks or executes trades.
//
// Body: {
//   scenario_type: "TARIFF" | "CURRENCY" | "REGULATORY" | "LOGISTICS" | "FINANCING",
//   tenant_gtid: string,
//   ustn?: string,            // optional single-trade scope
//   parameters: { ... }       // scenario-specific input params
// }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { scenario_type, tenant_gtid, ustn, parameters } = body;

    if (!scenario_type || !tenant_gtid || !parameters) {
      return NextResponse.json(
        { error: "scenario_type, tenant_gtid, and parameters are required" },
        { status: 400 },
      );
    }
    const validTypes: ScenarioType[] = ["TARIFF", "CURRENCY", "REGULATORY", "LOGISTICS", "FINANCING"];
    if (!validTypes.includes(scenario_type)) {
      return NextResponse.json(
        { error: `scenario_type must be one of: ${validTypes.join(", ")}` },
        { status: 400 },
      );
    }

    const result = await simulateScenario({
      scenarioType: scenario_type,
      tenantGtid: tenant_gtid,
      ustn: ustn || undefined,
      parameters,
    });

    return NextResponse.json(result);
  } catch (e: any) {
    console.error("[digital-twin/simulate] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET /api/sgtx/digital-twin/simulate — Returns the 5 supported scenario types
// with their input parameter schemas. Used by the frontend "Scenario Analysis"
// button to render the scenario picker.
export async function GET() {
  return NextResponse.json({
    scenario_types: SCENARIO_TYPES,
    disclaimer: "Advisory only — not a guarantee. Trade Digital Twin never blocks or executes trades.",
    documentation: "POST to /api/sgtx/digital-twin/simulate with { scenario_type, tenant_gtid, parameters } to run a simulation.",
  });
}

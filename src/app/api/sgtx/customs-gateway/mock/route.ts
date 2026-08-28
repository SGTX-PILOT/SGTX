// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  const { getMockScenarioList } = await import("@/lib/sgtx/customs-gateway/mock-government");
  return NextResponse.json({ ok: true, scenarios: getMockScenarioList() });
}
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mockSubmit, runMockScenario } = await import("@/lib/sgtx/customs-gateway/mock-government");
    if (body.scenarioId) {
      const result = await runMockScenario(body.scenarioId);
      return NextResponse.json({ ok: true, ...result });
    }
    const result = await mockSubmit(body.system || "MOCK-ACE", body.declaration || {}, body.scenario);
    return NextResponse.json({ ok: true, result });
  } catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}

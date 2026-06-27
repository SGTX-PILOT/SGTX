import { NextRequest, NextResponse } from "next/server";
export async function POST(req: NextRequest) {
  try {
    const { policyName, testInput } = await req.json();
    const result = testInput?.action === "trade.create" && testInput?.readinessScore >= 70 ? "ALLOW" : testInput?.readinessScore < 70 ? "CONDITIONAL" : "DENY";
    return NextResponse.json({ ok: true, policyName, input: testInput, simulatedResult: result, conditions: result === "CONDITIONAL" ? ["readinessScore < 70"] : [] });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

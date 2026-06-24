import { NextRequest, NextResponse } from "next/server";
import { checkCustomsPreClearance } from "@/lib/sgtx/tcn/compliance-gates";
import { featureGateResponse } from "@/lib/sgtx/platform/feature-check";

/**
 * GET /api/sgtx/tcn/compliance/customs?corridorCode=...&ustn=...
 *
 * Returns customs pre-clearance status for the given USTN + corridor:
 *   - status (PASS / CONDITIONAL / FAIL)
 *   - clearancePort
 *   - estimatedHours
 *   - detail
 */
export async function GET(req: NextRequest) {
  const gate = await featureGateResponse("roro_corridors");
  if (gate) return gate;

  try {
    const corridorCode = req.nextUrl.searchParams.get("corridorCode");
    const ustn = req.nextUrl.searchParams.get("ustn");
    if (!corridorCode) return NextResponse.json({ error: "corridorCode required" }, { status: 400 });
    if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });
    const result = await checkCustomsPreClearance(corridorCode, ustn);
    return NextResponse.json({ ok: true, corridorCode, ustn, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

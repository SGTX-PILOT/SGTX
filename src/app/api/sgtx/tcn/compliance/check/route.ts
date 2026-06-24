import { NextRequest, NextResponse } from "next/server";
import { runAllGates } from "@/lib/sgtx/tcn/compliance-gates";
import { featureGateResponse } from "@/lib/sgtx/platform/feature-check";

/**
 * POST /api/sgtx/tcn/compliance/check
 *
 * Body: { corridorCode, ustn }
 *
 * Runs all four compliance gates for the given USTN + corridor:
 *   1. Document compliance (COO, phyto, health cert, etc.)
 *   2. Customs pre-clearance (Nafeza ACI / FASAH / Dubai Trade)
 *   3. RoRo dimension check (LOA / beam / weight vs vessel limits)
 *   4. Dangerous goods check (IMDG class restrictions)
 *
 * Returns overall status (PASS / CONDITIONAL / FAIL) plus individual gate results.
 */
export async function POST(req: NextRequest) {
  const gate = await featureGateResponse("roro_corridors");
  if (gate) return gate;

  try {
    const body = await req.json().catch(() => ({}));
    const { corridorCode, ustn } = body as { corridorCode?: string; ustn?: string };
    if (!corridorCode) return NextResponse.json({ error: "corridorCode required" }, { status: 400 });
    if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });
    const result = await runAllGates(corridorCode, ustn);
    return NextResponse.json({ ok: true, corridorCode, ustn, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getCorridorEligibility } from "@/lib/sgtx/corridor";

// GET /api/sgtx/corridor/{code}/eligibility?commodity=...&origin=...&dest=...&incoterm=...&value=...&coldChain=true
// Advisory only — never blocks. Returns eligibility score + reasons.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  if (!code) {
    return NextResponse.json({ error: "corridor code required" }, { status: 400 });
  }
  const sp = req.nextUrl.searchParams;
  const tradeData = {
    commodity: sp.get("commodity") || undefined,
    origin: sp.get("origin") || undefined,
    dest: sp.get("dest") || undefined,
    incoterm: sp.get("incoterm") || undefined,
    value: sp.get("value") ? Number(sp.get("value")) : undefined,
    quantityKg: sp.get("quantityKg") ? Number(sp.get("quantityKg")) : undefined,
    coldChain: sp.get("coldChain") === "true",
    hsCode: sp.get("hsCode") || undefined,
  };

  const result = await getCorridorEligibility(code.toUpperCase(), tradeData);
  if (!result) {
    return NextResponse.json({ error: "corridor not found" }, { status: 404 });
  }
  return NextResponse.json(result);
}

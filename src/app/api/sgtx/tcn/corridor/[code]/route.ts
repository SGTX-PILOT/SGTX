import { NextRequest, NextResponse } from "next/server";
import { getCorridor, getPassport } from "@/lib/sgtx/tcn";
import { freshDb as db } from "@/lib/db-fresh";
import { featureGateResponse } from "@/lib/sgtx/platform/feature-check";

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  // Feature gate — Platform Admin can deactivate the RoRo Corridors (TCN) feature.
  const gate = await featureGateResponse("roro_corridors");
  if (gate) return gate;

  try {
    const { code } = await params;
    const corridor = await getCorridor(code);
    if (!corridor) return NextResponse.json({ error: "Corridor not found" }, { status: 404 });
    const passports = await getPassport(code);
    const gates = await db.corridorComplianceGate.findMany({ where: { corridorCode: code, isActive: true } });
    return NextResponse.json({ ok: true, corridor, passports: passports ? [passports] : [], complianceGates: gates });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

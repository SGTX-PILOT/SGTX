import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";
import { featureGateResponse } from "@/lib/sgtx/platform/feature-check";

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  // Feature gate — Platform Admin can deactivate the RoRo Corridors (TCN) feature.
  const gate = await featureGateResponse("roro_corridors");
  if (gate) return gate;

  try {
    const { code } = await params;
    const corridor = await db.tradeCorridor.findUnique({ where: { corridorCode: code } });
    if (!corridor) return NextResponse.json({ error: "Corridor not found" }, { status: 404 });
    const originPorts = JSON.parse(corridor.originPorts || "[]");
    const destPorts = JSON.parse(corridor.destinationPorts || "[]");
    const allPorts = [...originPorts, ...destPorts];
    const twins = await db.portDigitalTwin.findMany({ where: { portUnlocode: { in: allPorts } } });
    return NextResponse.json({ ok: true, ports: twins, total: twins.length });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";
import { featureGateResponse } from "@/lib/sgtx/platform/feature-check";

export async function GET(req: NextRequest, { params }: { params: Promise<{ unlocode: string }> }) {
  // Feature gate — Platform Admin can deactivate the RoRo Corridors (TCN) feature.
  const gate = await featureGateResponse("roro_corridors");
  if (gate) return gate;

  try { const { unlocode } = await params; const port = await db.portDigitalTwin.findUnique({ where: { portUnlocode: unlocode.toUpperCase() } }); if (!port) return NextResponse.json({ error: "Port not found" }, { status: 404 }); return NextResponse.json({ ok: true, port }); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

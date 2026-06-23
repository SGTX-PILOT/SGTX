import { NextRequest, NextResponse } from "next/server";
import { listCorridors } from "@/lib/sgtx/tcn";
import { featureGateResponse } from "@/lib/sgtx/platform/feature-check";

export async function GET(req: NextRequest) {
  // Feature gate — Platform Admin can deactivate the RoRo Corridors (TCN) feature.
  const gate = await featureGateResponse("roro_corridors");
  if (gate) return gate;

  try {
    const country = req.nextUrl.searchParams.get("country") || undefined;
    const type = req.nextUrl.searchParams.get("type") || undefined;
    const status = req.nextUrl.searchParams.get("status") || undefined;
    const corridors = await listCorridors({ country, type, status });
    return NextResponse.json({ ok: true, corridors, total: corridors.length });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

import { NextRequest, NextResponse } from "next/server";
import { getCorridorAnalytics } from "@/lib/sgtx/tcn";
import { featureGateResponse } from "@/lib/sgtx/platform/feature-check";

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  // Feature gate — Platform Admin can deactivate the RoRo Corridors (TCN) feature.
  const gate = await featureGateResponse("roro_corridors");
  if (gate) return gate;

  try { const { code } = await params; const result = await getCorridorAnalytics(code); return NextResponse.json({ ok: true, ...result }); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

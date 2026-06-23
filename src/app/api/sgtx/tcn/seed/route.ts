import { NextRequest, NextResponse } from "next/server";
import { seedTCN } from "@/lib/sgtx/tcn/seed";
import { featureGateResponse } from "@/lib/sgtx/platform/feature-check";

export async function POST() {
  // Feature gate — Platform Admin can deactivate the RoRo Corridors (TCN) feature.
  const gate = await featureGateResponse("roro_corridors");
  if (gate) return gate;

  try { const result = await seedTCN(); return NextResponse.json(result); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

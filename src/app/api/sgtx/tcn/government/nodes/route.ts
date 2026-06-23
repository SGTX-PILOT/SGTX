import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";
import { featureGateResponse } from "@/lib/sgtx/platform/feature-check";

export async function GET(req: NextRequest) {
  // Feature gate — Platform Admin can deactivate the RoRo Corridors (TCN) feature.
  const gate = await featureGateResponse("roro_corridors");
  if (gate) return gate;

  try {
    const country = req.nextUrl.searchParams.get("country");
    const type = req.nextUrl.searchParams.get("type");
    const where: any = {};
    if (country) where.countryCode = country;
    if (type) where.authorityType = type;
    const nodes = await db.governmentNode.findMany({ where, orderBy: { authorityType: "asc" }, take: 100 });
    return NextResponse.json({ ok: true, nodes, total: nodes.length });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

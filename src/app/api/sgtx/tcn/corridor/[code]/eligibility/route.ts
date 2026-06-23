import { NextRequest, NextResponse } from "next/server";
import { checkEligibility } from "@/lib/sgtx/tcn";
import { featureGateResponse } from "@/lib/sgtx/platform/feature-check";

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  // Feature gate — Platform Admin can deactivate the RoRo Corridors (TCN) feature.
  const gate = await featureGateResponse("roro_corridors");
  if (gate) return gate;

  try {
    const { code } = await params;
    const product = req.nextUrl.searchParams.get("product") || undefined;
    const hsCode = req.nextUrl.searchParams.get("hsCode") || undefined;
    const origin = req.nextUrl.searchParams.get("origin") || undefined;
    const dest = req.nextUrl.searchParams.get("dest") || undefined;
    const incoterm = req.nextUrl.searchParams.get("incoterm") || undefined;
    const transportMode = req.nextUrl.searchParams.get("transportMode") || undefined;
    const coldChain = req.nextUrl.searchParams.get("coldChain") === "true";
    const result = await checkEligibility({ corridorCode: code, product, hsCode, origin, dest, incoterm, transportMode, coldChain });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

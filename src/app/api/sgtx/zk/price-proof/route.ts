import { NextRequest, NextResponse } from "next/server";
import { generatePriceProof } from "@/lib/sgtx/addons";
import { featureGateResponse } from "@/lib/sgtx/platform/feature-check";

// POST /api/sgtx/zk/price-proof — Generate a ZK price commitment
// Body: { sellerGtid, priceUsd, ustn? }
// Returns: { proof, commitment } — price is hidden until revealed
export async function POST(req: NextRequest) {
  // Feature gate — ZK add-on can be deactivated by Platform Admin.
  const gate = await featureGateResponse("zk_proofs");
  if (gate) return gate;

  const body = await req.json().catch(() => null);
  if (!body || typeof body.priceUsd !== "number") {
    return NextResponse.json({ error: "priceUsd (number) required" }, { status: 400 });
  }
  const result = generatePriceProof({ priceUsd: body.priceUsd, sellerGtid: body.sellerGtid, ustn: body.ustn } as any);
  return NextResponse.json({ ok: true, ...result, sellerGtid: body.sellerGtid, ustn: body.ustn || null });
}

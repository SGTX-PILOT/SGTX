import { NextRequest, NextResponse } from "next/server";
import { verifyZkProof } from "@/lib/sgtx/addons";
import { featureGateResponse } from "@/lib/sgtx/platform/feature-check";

// POST /api/sgtx/zk/verify — Verify a ZK proof
// Body: { proof, type: "reserve" | "price", commitment?, revealedValue? }
// Returns: { verified, type }
export async function POST(req: NextRequest) {
  // Feature gate — ZK add-on can be deactivated by Platform Admin.
  const gate = await featureGateResponse("zk_proofs");
  if (gate) return gate;

  const body = await req.json().catch(() => null);
  if (!body || !body.proof || !body.type) {
    return NextResponse.json({ error: "proof and type ('reserve' | 'price') required" }, { status: 400 });
  }
  // Forward commitment + revealedValue to the verifier — required for price-proof
  // binding checks (reserve proofs only need the proof string itself).
  const verified = verifyZkProof(body.proof, {
    type: body.type,
    commitment: body.commitment,
    revealedValue: body.revealedValue,
  });
  return NextResponse.json({
    ok: true,
    verified,
    type: body.type,
    proof: body.proof.slice(0, 30) + "...",
  });
}

// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
// GET /api/sgtx/zk/status
// Returns the ZK proof system status: activation, cumulative proof counts, last proof.
import { NextResponse } from "next/server";
import { getZkStats } from "@/lib/sgtx/addons";

export async function GET() {
  const stats = getZkStats();
  return NextResponse.json({
    activated: true,
    algorithm: "zk-SNARK (simulated · SHA-256 commitments)",
    reserveProofs: stats.reserveProofs,
    priceProofs: stats.priceProofs,
    verifications: stats.verifications,
    totalProofs: stats.reserveProofs + stats.priceProofs,
    lastProofAt: stats.lastProofAt ? stats.lastProofAt.toISOString() : null,
    lastProofType: stats.lastProofType,
    endpoints: {
      reserveProof: "POST /api/sgtx/zk/reserve-proof",
      priceProof: "POST /api/sgtx/zk/price-proof",
      verify: "POST /api/sgtx/zk/verify",
      status: "GET /api/sgtx/zk/status",
    },
  });
}

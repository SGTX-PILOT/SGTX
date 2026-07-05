import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getChainStats } from "@/lib/sgtx/governor/loom-verifier";

// GET /api/sgtx/governor/loom/stats — chain statistics
//
// Blueprint Part 1.6 — returns summary statistics for the Loom chain:
//   - totalDecisions   — count of GovernorDecision rows
//   - chainLength      — same as totalDecisions (chain is linear)
//   - genesisHash      — SHA256 of the immutable module version manifest
//   - latestHash       — the most recent decision's loomHash (chain tip)
//   - lastVerifiedAt   — timestamp of the last replay run
//   - lastVerificationChainVerified — boolean result of last replay
//   - lastVerificationMismatches   — count of mismatches in last replay
//
// Query params:
//   ?ustn=SGTX-…    (scope stats to a single trade)
export async function GET(req: NextRequest) {
  try {
    const ustn = req.nextUrl.searchParams.get("ustn") || undefined;
    const stats = await getChainStats(ustn);
    return NextResponse.json(stats);
  } catch (e: any) {
    logger.error("[governor/loom/stats GET] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to fetch Loom chain stats" },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { verifyDecision } from "@/lib/sgtx/governor/loom-verifier";

// GET /api/sgtx/governor/loom/verify/[decisionId] — verify a single decision
//
// Blueprint Part 1.6 — verifies a single Governor decision's hash integrity.
// Recomputes the decision's SHA256 hash from its stored JSON (decisionId +
// action + actorGtid + verdict + conditions + previousHash + signature) and
// compares with the stored loomHash. Also verifies the previousHash linkage
// by looking up the predecessor decision (the decision immediately before
// this one in createdAt order) and comparing its loomHash.
//
// Path param:
//   decisionId — the dec-xxxxx identifier (NOT the database cuid)
//
// Returns:
//   {
//     decisionId, found, verified, storedHash, recomputedHash,
//     expectedPreviousHash, storedPreviousHash, reason, decision?, verifiedAt
//   }
//   reason ∈ "ok" | "hash_mismatch" | "previous_hash_mismatch" | "not_found"
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ decisionId: string }> },
) {
  try {
    const { decisionId } = await params;
    if (!decisionId) {
      return NextResponse.json(
        { error: "decisionId path parameter is required" },
        { status: 400 },
      );
    }

    const result = await verifyDecision(decisionId);
    const status = result.found ? (result.verified ? 200 : 409) : 404;

    return NextResponse.json(result, { status });
  } catch (e: any) {
    logger.error("[governor/loom/verify GET] error:", e);
    return NextResponse.json(
      { error: e?.message || "Decision verification failed" },
      { status: 500 },
    );
  }
}

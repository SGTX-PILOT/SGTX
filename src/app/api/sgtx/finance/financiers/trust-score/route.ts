// @ts-nocheck
// §2b Financier Relationships — internal trust score (NOT shown publicly).
// GET /api/sgtx/finance/financiers/trust-score?traderGtid=X&financierGtid=Y
//
// Returns the financier's INTERNAL trust score (0..100) for the trader's own
// decision-making. SGTX is a non-marketplace platform: this score MUST NOT be
// displayed to other traders, used for public ranking, or compared across
// financiers as a marketplace-style leaderboard.
import { NextResponse } from "next/server";
import { getFinancierInternalTrustScore } from "@/lib/sgtx/financier-relationship";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const traderGtid = url.searchParams.get("traderGtid");
    const financierGtid = url.searchParams.get("financierGtid");
    if (!traderGtid || !financierGtid) {
      return NextResponse.json(
        { error: "traderGtid and financierGtid required" },
        { status: 400 },
      );
    }
    const internalTrustScore = await getFinancierInternalTrustScore(
      traderGtid,
      financierGtid,
    );
    return NextResponse.json({
      traderGtid,
      financierGtid,
      internalTrustScore,
      // Explicit reminder for API consumers: this score is internal.
      note: "internal — not shown publicly",
    });
  } catch (err: any) {
    logger.error("[api/finance/financiers/trust-score] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

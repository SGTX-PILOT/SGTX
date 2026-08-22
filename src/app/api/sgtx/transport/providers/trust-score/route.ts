// @ts-nocheck
// §2 Provider Relationship — internal trust score (NOT shown publicly).
// GET /api/sgtx/transport/providers/trust-score?providerGtid=X
//
// Returns the provider's INTERNAL trust score (0..100). SGTX is a
// non-marketplace platform: this score is for the trader's own
// decision-making only and MUST NOT be displayed to other traders
// or used for public ranking.
import { NextResponse } from "next/server";
import { getProviderInternalTrustScore } from "@/lib/sgtx/provider-relationship";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const providerGtid = url.searchParams.get("providerGtid");
    if (!providerGtid) {
      return NextResponse.json(
        { error: "providerGtid required" },
        { status: 400 },
      );
    }
    const internalTrustScore = await getProviderInternalTrustScore(
      providerGtid,
    );
    return NextResponse.json({
      providerGtid,
      internalTrustScore,
      // Explicit reminder for API consumers: this score is internal.
      note: "internal — not shown publicly",
    });
  } catch (err: any) {
    logger.error("[api/transport/providers/trust-score] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

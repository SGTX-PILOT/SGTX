// @ts-nocheck
// §2 Trade Finance — all cases for a trader (borrower)
// GET /api/sgtx/finance/cases/trader/[traderGtid]
import { NextResponse } from "next/server";
import { getFinancingCasesForTrader } from "@/lib/sgtx/trade-finance";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ traderGtid: string }> },
) {
  try {
    const { traderGtid } = await params;
    if (!traderGtid) {
      return NextResponse.json(
        { error: "traderGtid required" },
        { status: 400 },
      );
    }
    const cases = await getFinancingCasesForTrader(traderGtid);
    return NextResponse.json({ cases });
  } catch (err: any) {
    logger.error("[api/finance/cases/trader] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

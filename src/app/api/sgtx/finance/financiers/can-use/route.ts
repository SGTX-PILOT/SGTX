// @ts-nocheck
// §2b Financier Relationships — can trader use financier?
// GET /api/sgtx/finance/financiers/can-use?traderGtid=X&financierGtid=Y
import { NextResponse } from "next/server";
import { canTraderUseFinancier } from "@/lib/sgtx/financier-relationship";
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
    const result = await canTraderUseFinancier(traderGtid, financierGtid);
    return NextResponse.json(result);
  } catch (err: any) {
    logger.error("[api/finance/financiers/can-use] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

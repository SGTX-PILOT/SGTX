// @ts-nocheck
// §2b Financier Relationships — list connected financiers (FLAT list, NON-marketplace)
// GET /api/sgtx/finance/financiers/connected?traderGtid=X&financierType=Y
//
// Returns a FLAT list of financiers the trader has an explicit relationship
// with. SGTX is non-marketplace: NO ranking, NO scoring, NO sort by trust /
// exposure. Order is purely chronological (oldest first) so the trader sees
// their longest relationships first — no comparison between financiers.
import { NextResponse } from "next/server";
import { listConnectedFinanciers } from "@/lib/sgtx/financier-relationship";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const traderGtid = url.searchParams.get("traderGtid");
    if (!traderGtid) {
      return NextResponse.json(
        { error: "traderGtid required" },
        { status: 400 },
      );
    }
    const filters: any = {};
    const financierType = url.searchParams.get("financierType") || undefined;
    if (financierType) filters.financierType = financierType;
    const financiers = await listConnectedFinanciers(traderGtid, filters);
    // Explicit reminder: FLAT list, NO marketplace ranking.
    return NextResponse.json({
      financiers,
      flatList: true,
      note: "non-marketplace — flat list, no ranking or scoring",
    });
  } catch (err: any) {
    logger.error("[api/finance/financiers/connected] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

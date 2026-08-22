// @ts-nocheck
// §2b Financier Relationships — GET by (traderGtid, financierGtid)
// GET /api/sgtx/finance/financiers/by-gtids?traderGtid=X&financierGtid=Y
import { NextResponse } from "next/server";
import { getFinancierRelationshipByGtids } from "@/lib/sgtx/financier-relationship";
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
    const relationship = await getFinancierRelationshipByGtids(
      traderGtid,
      financierGtid,
    );
    if (!relationship) {
      return NextResponse.json(
        { error: "relationship not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ relationship });
  } catch (err: any) {
    logger.error("[api/finance/financiers/by-gtids] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

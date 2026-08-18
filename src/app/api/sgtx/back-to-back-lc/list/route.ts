// GET /api/sgtx/back-to-back-lc/list?buyerGtid=X — list back-to-back LCs for a buyer
//
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const buyerGtid = url.searchParams.get("buyerGtid") || "";

    if (!buyerGtid) {
      return NextResponse.json({ error: "Missing required query param: buyerGtid" }, { status: 400 });
    }

    const lcs = await (db as any).backToBackLc.findMany({
      where: { buyerGtid },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      ok: true,
      buyerGtid,
      lcs: lcs || [],
      count: (lcs || []).length,
    });
  } catch (e: any) {
    logger.error("[back-to-back-lc/list] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

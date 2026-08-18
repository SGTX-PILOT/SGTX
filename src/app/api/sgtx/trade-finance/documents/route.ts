// GET /api/sgtx/trade-finance/documents?ustn=X — list trade finance docs for a shipment
//
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn") || "";

    if (!ustn) {
      return NextResponse.json({ error: "Missing required query param: ustn" }, { status: 400 });
    }

    const docs = await (db as any).tradeFinanceDocument.findMany({
      where: { ustn },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      ok: true,
      ustn,
      documents: docs || [],
      count: (docs || []).length,
    });
  } catch (e: any) {
    logger.error("[trade-finance/documents] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

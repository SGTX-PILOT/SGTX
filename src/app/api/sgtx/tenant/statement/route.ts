import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
export async function GET(req: NextRequest) {
  try {
    const tenantGtid = req.nextUrl.searchParams.get("tenantGtid");
    if (!tenantGtid) return NextResponse.json({ error: "tenantGtid required" }, { status: 400 });
    const trades = await db.trade.findMany({ where: { OR: [{ buyerGtid: tenantGtid }, { sellerGtid: tenantGtid }] }, select: { ustn: true, commodity: true, status: true, tradeValueUsd: true, createdAt: true } });
    const totalTradeVolumeUsd = trades.reduce((s, t) => s + (t.tradeValueUsd || 0), 0);
    return NextResponse.json({ ok: true, tenantGtid, period: { from: req.nextUrl.searchParams.get("from") || "all", to: req.nextUrl.searchParams.get("to") || "now" }, summary: { totalTradeVolumeUsd, tradesCount: trades.length }, trades });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

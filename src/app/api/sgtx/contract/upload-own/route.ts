import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
export async function POST(req: NextRequest) {
  try {
    const { ustn, contractHtml, uploadedByGtid } = await req.json();
    if (!ustn || !contractHtml || !uploadedByGtid) return NextResponse.json({ error: "ustn, contractHtml, uploadedByGtid required" }, { status: 400 });
    if (contractHtml.length < 100) return NextResponse.json({ error: "contractHtml too short (min 100 chars)" }, { status: 400 });
    const trade = await db.trade.findUnique({ where: { ustn } });
    if (!trade) return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    if (trade.buyerGtid !== uploadedByGtid && trade.sellerGtid !== uploadedByGtid) return NextResponse.json({ error: "Uploader must be buyer or seller" }, { status: 403 });
    const contract = await db.tradeContract.create({ data: { tradeId: trade.id, contractId: `SC-${Date.now().toString(36).toUpperCase()}`, version: 1, status: "PENDING_SIGNATURES", contractJson: JSON.stringify({ html: contractHtml, uploadedBy: uploadedByGtid, uploadedAt: new Date().toISOString() }) } });
    return NextResponse.json({ ok: true, contractId: contract.contractId, status: "PENDING_SIGNATURES", message: "Own contract uploaded — awaiting counterparty review" });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

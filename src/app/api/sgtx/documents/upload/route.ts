import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";
export async function POST(req: NextRequest) {
  try {
    const { ustn, docType, title, uploadedBy, hashSha256, fileSizeKb } = await req.json();
    if (!ustn || !docType) return NextResponse.json({ error: "ustn and docType required" }, { status: 400 });
    const trade = await db.trade.findUnique({ where: { ustn }, select: { id: true, buyerGtid: true, sellerGtid: true } });
    if (!trade) return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    const doc = await db.document.create({ data: { tradeId: trade.id, type: docType, title: title || docType, status: "UPLOADED", uploadedBy: uploadedBy || "unknown", hashSha256: hashSha256 || `doc-${Date.now()}`, fileSizeKb } });
    const counterparty = uploadedBy === trade.buyerGtid ? trade.sellerGtid : trade.buyerGtid;
    await db.inboxItem.create({ data: { tenantGtid: counterparty, tradeId: trade.id, category: "GENERAL", priority: 70, title: `Document uploaded: ${docType}`, description: `${title || docType} uploaded by ${uploadedBy}`, ctaLabel: "View Document" } }).catch(() => null);
    return NextResponse.json({ ok: true, documentId: doc.id, status: "UPLOADED" });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
export async function GET(req: NextRequest) {
  const ustn = req.nextUrl.searchParams.get("ustn");
  if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });
  const trade = await db.trade.findUnique({ where: { ustn }, select: { id: true } });
  if (!trade) return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  const docs = await db.document.findMany({ where: { tradeId: trade.id }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ ok: true, documents: docs, total: docs.length });
}

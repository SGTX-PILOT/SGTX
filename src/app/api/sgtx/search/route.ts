import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get("q") || "").trim();
    const tenantGtid = req.nextUrl.searchParams.get("tenantGtid") || undefined;
    if (q.length < 2) return NextResponse.json({ error: "Query must be ≥2 chars" }, { status: 400 });
    const contains = { contains: q };
    const [trades, tenants, documents, invoices] = await Promise.all([
      db.trade.findMany({ where: { AND: [tenantGtid ? { OR: [{ buyerGtid: tenantGtid }, { sellerGtid: tenantGtid }] } : {}, { OR: [{ ustn: contains }, { commodity: contains }] }] }, take: 10, orderBy: { createdAt: "desc" }, select: { ustn: true, commodity: true, status: true, tradeValueUsd: true } }),
      db.tenant.findMany({ where: { OR: [{ gtid: contains }, { legalName: contains }] }, take: 10, select: { gtid: true, legalName: true, type: true, country: true, trustScore: true } }),
      db.document.findMany({ where: { title: contains }, take: 10, select: { id: true, title: true, type: true, status: true } }),
      db.invoice.findMany({ where: { number: contains }, take: 10, select: { id: true, number: true, status: true, totalUsd: true } }),
    ]);
    return NextResponse.json({ ok: true, results: { trades, tenants, documents, invoices }, query: q });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

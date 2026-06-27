import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
export async function GET(req: NextRequest) {
  try {
    const tenantGtid = req.nextUrl.searchParams.get("tenantGtid");
    if (!tenantGtid) return NextResponse.json({ error: "tenantGtid required" }, { status: 400 });
    const [profile, tradesAsBuyer, tradesAsSeller, employees, documents, invoices, inboxItems, activities] = await Promise.all([
      db.tenant.findUnique({ where: { gtid: tenantGtid } }),
      db.trade.findMany({ where: { buyerGtid: tenantGtid }, take: 100, orderBy: { createdAt: "desc" } }),
      db.trade.findMany({ where: { sellerGtid: tenantGtid }, take: 100, orderBy: { createdAt: "desc" } }),
      db.employee.findMany({ where: { tenantGtid } }),
      db.document.findMany({ where: { uploadedBy: tenantGtid }, take: 100 }),
      db.invoice.findMany({ where: { OR: [{ payerGtid: tenantGtid }, { payeeGtid: tenantGtid }] }, take: 100 }),
      db.inboxItem.findMany({ where: { tenantGtid }, take: 100, orderBy: { createdAt: "desc" } }),
      db.activity.findMany({ where: { actorGtid: tenantGtid }, take: 100, orderBy: { createdAt: "desc" } }),
    ]);
    if (!profile) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    return NextResponse.json({ ok: true, tenantGtid, exportGeneratedAt: new Date().toISOString(), data: { profile, tradesAsBuyer, tradesAsSeller, employees, documents, invoices, inboxItems, activities } });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

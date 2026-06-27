import { NextResponse } from "next/server";
import { db } from "@/lib/db";
export async function POST() {
  try {
    const results = { documentsChecked: 0, pendingExpiry: 0, urgentExpiry: 0, expired: 0, alertsRaised: 0 };
    const docs = await db.document.findMany({ where: { OR: [{ type: { contains: "CERTIFICATE" } }, { type: { contains: "PERMIT" } }] }, include: { trade: { select: { ustn: true, buyerGtid: true, sellerGtid: true, status: true } } }, take: 500 });
    results.documentsChecked = docs.length;
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    for (const doc of docs) {
      const assumedExpiry = new Date(doc.createdAt.getTime() + 90 * 24 * 60 * 60 * 1000);
      let severity: "PENDING" | "URGENT" | "EXPIRED" | null = null;
      if (assumedExpiry < now) { severity = "EXPIRED"; results.expired++; }
      else if (assumedExpiry < in7Days) { severity = "URGENT"; results.urgentExpiry++; }
      else if (assumedExpiry < in30Days) { severity = "PENDING"; results.pendingExpiry++; }
      if (!severity) continue;
      if (!doc.trade || !["CONTRACT_SIGNED", "IN_EXECUTION"].includes(doc.trade.status)) continue;
      const priority = severity === "EXPIRED" ? 95 : severity === "URGENT" ? 90 : 70;
      if (doc.trade.buyerGtid) {
        await db.inboxItem.create({ data: { tenantGtid: doc.trade.buyerGtid, tradeId: doc.tradeId, category: "COMPLIANCE", priority, title: `Document ${severity}: ${doc.type}`, description: `${doc.title} — assumed expiry: ${assumedExpiry.toISOString().slice(0, 10)}`, ctaLabel: "View Documents" } });
        results.alertsRaised++;
      }
    }
    return NextResponse.json({ ok: true, results, ranAt: now.toISOString() });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
export async function GET() { return POST(); }

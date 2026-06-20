import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const DEFAULT_PARTNER_GTID = "SGTX-XX-MKT-000001-API1";

// GET /api/sgtx/marketplace/revenue?partnerGtid=...
// Revenue share summary, monthly breakdown, payout history (synthesised from attributions + invoices).
export async function GET(req: NextRequest) {
  const partnerGtid = req.nextUrl.searchParams.get("partnerGtid") || DEFAULT_PARTNER_GTID;
  try {
    const partner = await db.marketplacePartner.findUnique({ where: { partnerGtid } });
    if (!partner) {
      return NextResponse.json({ error: "Partner not found" }, { status: 404 });
    }

    const [leads, disputedLeads] = await Promise.all([
      db.partnerLeadAttribution.findMany({ where: { partnerGtid }, orderBy: { createdAt: "desc" } }),
      db.partnerLeadAttribution.findMany({ where: { partnerGtid, status: "DISPUTED" } }),
    ]);

    // Sum revenue share — we don't have a direct revenue column on attribution,
    // so we sum the trade invoices we can attribute. For demo, synthesize from leads count
    // and an assumed avg trade value.
    const activeLeads = leads.filter((l) => l.status === "ACTIVE");
    const assumedAvgTradeValue = 24000; // USD per attributed trade
    const totalRevenue = activeLeads.reduce(
      (sum, l) => sum + (assumedAvgTradeValue * l.revenueSharePct) / 100,
      0,
    );

    // Monthly breakdown (last 6 months)
    const now = new Date();
    const months: { month: string; leads: number; revenue: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const mLeads = leads.filter((l) => {
        const cd = new Date(l.createdAt);
        return cd >= monthStart && cd < monthEnd;
      });
      const mActive = mLeads.filter((l) => l.status === "ACTIVE");
      const mRevenue = mActive.reduce(
        (sum, l) => sum + (assumedAvgTradeValue * l.revenueSharePct) / 100,
        0,
      );
      months.push({
        month: d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
        leads: mLeads.length,
        revenue: Math.round(mRevenue),
      });
    }

    // Top corridors (origin → destination pairs) — synthesised from buyer/seller GTIDs
    const corridorMap = new Map<string, { pair: string; count: number; revenue: number }>();
    for (const l of activeLeads) {
      const buyerCtry = l.buyerGtid?.slice(5, 7) || "??";
      const sellerCtry = l.sellerGtid?.slice(5, 7) || "??";
      const pair = `${sellerCtry} → ${buyerCtry}`;
      const cur = corridorMap.get(pair) || { pair, count: 0, revenue: 0 };
      cur.count += 1;
      cur.revenue += (assumedAvgTradeValue * l.revenueSharePct) / 100;
      corridorMap.set(pair, cur);
    }
    const topCorridors = Array.from(corridorMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Payout history (synthetic)
    const payouts = months.slice(0, 3).map((m, i) => ({
      id: `PAY-2026-${String(months.length - i).padStart(3, "0")}`,
      month: m.month,
      amount: Math.round(m.revenue * 0.8),
      status: i === 0 ? "PENDING" : "PAID",
      paidAt: i === 0 ? null : new Date(now.getFullYear(), now.getMonth() - i, 15).toISOString(),
    }));

    return NextResponse.json({
      partner: {
        partnerGtid: partner.partnerGtid,
        partnerName: partner.partnerName,
        revenueSharePct: partner.revenueSharePct,
        agreementSignedAt: partner.agreementSignedAt,
      },
      summary: {
        totalLeads: leads.length,
        activeLeads: activeLeads.length,
        disputedLeads: disputedLeads.length,
        totalRevenue: Math.round(totalRevenue),
        avgTradeValue: assumedAvgTradeValue,
        conversionRate: leads.length > 0 ? Math.round((activeLeads.length / leads.length) * 100) : 0,
      },
      monthly: months,
      topCorridors,
      payouts,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

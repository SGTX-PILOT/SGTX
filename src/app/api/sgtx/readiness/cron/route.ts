import { NextResponse } from "next/server";
import { db } from "@/lib/db";
export async function POST() {
  try {
    const results = { tenantsChecked: 0, scoresUpdated: 0, alertsRaised: 0, errors: [] as string[] };
    const tenants = await db.tenant.findMany({ where: { lifecycleState: "VERIFIED" }, select: { gtid: true, kybTier: true, sanctionsCleared: true, bankSwift: true, bankAccountNo: true } });
    results.tenantsChecked = tenants.length;
    for (const t of tenants) {
      try {
        const companyPassed = t.kybTier >= 2 && t.sanctionsCleared;
        const bankingPassed = !!(t.bankSwift && t.bankAccountNo);
        const tradeCount = await db.trade.count({ where: { OR: [{ buyerGtid: t.gtid }, { sellerGtid: t.gtid }] } });
        const score = Math.round((companyPassed ? 35 : 0) + (bankingPassed ? 25 : 0) + (tradeCount > 0 ? 20 : 0) + 15 + 5);
        const existing = await db.tradeReadiness.findFirst({ where: { tenantGtid: t.gtid } });
        if (!existing || existing.score !== score) {
          await db.tradeReadiness.upsert({ where: { tenantGtid: t.gtid }, update: { score, lastCalculated: new Date() }, create: { tenantGtid: t.gtid, score, checklist: JSON.stringify({ company: companyPassed, banking: bankingPassed, trade: tradeCount > 0 }) } });
          results.scoresUpdated++;
        }
        if (score < 70 && (!existing || existing.score >= 70)) {
          await db.inboxItem.create({ data: { tenantGtid: t.gtid, category: "COMPLIANCE", priority: 85, title: `Trade Readiness dropped to ${score}%`, description: "Governor will block new trade creation until score ≥70%.", ctaLabel: "View Readiness" } });
          results.alertsRaised++;
        }
      } catch (e: any) { results.errors.push(`${t.gtid}: ${e.message}`); }
    }
    return NextResponse.json({ ok: true, results, ranAt: new Date().toISOString() });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
export async function GET() { return POST(); }

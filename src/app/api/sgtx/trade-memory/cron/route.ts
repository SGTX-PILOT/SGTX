import { NextResponse } from "next/server";
import { db } from "@/lib/db";
export async function POST() {
  try {
    const results = { insightsGenerated: 0, anomaliesDetected: 0, activeTradesChecked: 0, errors: [] as string[] };
    const activeTrades = await db.trade.findMany({ where: { status: { in: ["CONTRACT_SIGNED", "IN_EXECUTION"] } }, select: { id: true, ustn: true, commodity: true, tradeValueUsd: true, buyerGtid: true, createdAt: true }, take: 100 });
    results.activeTradesChecked = activeTrades.length;
    for (const trade of activeTrades) {
      try {
        const daysSinceCreation = Math.floor((Date.now() - trade.createdAt.getTime()) / (1000 * 60 * 60 * 24));
        const delayProb = Math.min(0.8, daysSinceCreation / 30);
        if (delayProb > 0.3) {
          await db.predictiveInsight.create({ data: { ustn: trade.ustn, insightType: "delay_forecast", probability: delayProb, prediction: `Delay forecast: ${(delayProb * 100).toFixed(0)}% probability`, recommendedAction: "Contact carrier for ETA update.", confidence: 0.72 } });
          results.insightsGenerated++;
        }
        if (delayProb > 0.5) {
          await db.inboxItem.create({ data: { tenantGtid: trade.buyerGtid, tradeId: trade.id, category: "NEGOTIATION", priority: 40, title: `Delay forecast: ${trade.ustn.slice(0, 20)}…`, description: `AI predicts ${(delayProb * 100).toFixed(0)}% delay probability.`, ctaLabel: "View Trade" } });
        }
      } catch (e: any) { results.errors.push(`${trade.ustn}: ${e.message}`); }
    }
    return NextResponse.json({ ok: true, results, ranAt: new Date().toISOString() });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
export async function GET() { return POST(); }

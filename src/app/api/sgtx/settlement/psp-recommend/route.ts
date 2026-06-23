// 3B.7.2 — PSP Recommendation (AI ranked)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recommendPsp } from "@/lib/sgtx/settlement";
import { pspRecommendationExplanation } from "@/lib/sgtx/ai/orchestrator";

export async function GET(req: NextRequest) {
  const payerGtid = req.nextUrl.searchParams.get("payerGtid");
  const payeeGtid = req.nextUrl.searchParams.get("payeeGtid");
  const amountUsd = parseFloat(req.nextUrl.searchParams.get("amountUsd") || "0");
  const currency = req.nextUrl.searchParams.get("currency") || "USD";
  const includeAi = req.nextUrl.searchParams.get("includeAi") === "true";

  if (!payerGtid || !payeeGtid || !amountUsd) return NextResponse.json({ error: "payerGtid, payeeGtid, amountUsd required" }, { status: 400 });

  const [payer, payee] = await Promise.all([
    db.tenant.findUnique({ where: { gtid: payerGtid } }),
    db.tenant.findUnique({ where: { gtid: payeeGtid } }),
  ]);
  if (!payer || !payee) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  const { ranked, top } = await recommendPsp({
    payerCountry: payer.country, payeeCountry: payee.country,
    amountUsd, currency,
  });

  // AI explanation for top recommendation
  let aiExplanation: string | null = null;
  if (includeAi && top) {
    try {
      const r = await pspRecommendationExplanation({
        pspName: top.displayName, feeUsd: top.feeUsd, settlementDays: top.settlementDays,
        healthScore: top.healthScore, payerCountry: payer.country, payeeCountry: payee.country, amountUsd,
      });
      aiExplanation = r.content;
    } catch { /* ignore */ }
  }

  return NextResponse.json({ ranked, top, aiExplanation });
}

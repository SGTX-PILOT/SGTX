import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { callAI } from "@/lib/sgtx/ai/orchestrator";

// POST /api/sgtx/disputes/prediction — predict dispute outcome using AI + historical data
// Body: { disputeId }
export async function POST(req: NextRequest) {
  try {
    const { disputeId } = await req.json();
    if (!disputeId) return NextResponse.json({ error: "disputeId required" }, { status: 400 });

    const dispute = await db.dispute.findUnique({
      where: { id: disputeId },
      include: { trade: { include: { buyer: true, seller: true } } },
    });
    if (!dispute) return NextResponse.json({ error: "Dispute not found" }, { status: 404 });

    // Check for existing prediction
    const existing = await db.disputePrediction.findUnique({ where: { disputeId } });
    if (existing) return NextResponse.json({ ok: true, prediction: existing });

    // ── Gather features for prediction ──────────────────────────
    const [evidenceCount, mediationRounds] = await Promise.all([
      db.disputeEvidence.count({ where: { disputeId } }),
      db.disputeMediation.count({ where: { disputeId } }),
    ]);
    const buyerTri = await db.triHistory.findFirst({ where: { tenantGtid: dispute.trade?.buyerGtid || "" }, orderBy: { calculatedAt: "desc" } });
    const sellerTri = await db.triHistory.findFirst({ where: { tenantGtid: dispute.trade?.sellerGtid || "" }, orderBy: { calculatedAt: "desc" } });
    const claimAmount = dispute.claimAmountUsd || 0;
    const tradeValue = dispute.trade?.tradeValueUsd || 0;
    const claimRatio = tradeValue > 0 ? claimAmount / tradeValue : 0;

    // Historical: similar disputes by type
    const similarDisputes = await db.dispute.findMany({
      where: { type: dispute.type, status: { in: ["RESOLVED", "ARBITRATION_PENDING"] } },
      take: 20,
      orderBy: { createdAt: "desc" },
    });
    const filerWins = similarDisputes.filter(d => d.resolution?.toLowerCase().includes("filer") || d.resolution?.toLowerCase().includes("claimant")).length;
    const historicalFilerWinRate = similarDisputes.length > 0 ? filerWins / similarDisputes.length : 0.5;

    // ── Feature vector ──────────────────────────────────────────
    const features = {
      dispute_type: dispute.type,
      claim_amount_usd: claimAmount,
      trade_value_usd: tradeValue,
      claim_ratio: Math.round(claimRatio * 100) / 100,
      evidence_count: evidenceCount,
      mediation_rounds: mediationRounds,
      buyer_tri: buyerTri?.triScore || 500,
      seller_tri: sellerTri?.triScore || 500,
      tri_gap: Math.abs((buyerTri?.triScore || 500) - (sellerTri?.triScore || 500)),
      historical_filer_win_rate: Math.round(historicalFilerWinRate * 100) / 100,
      similar_cases: similarDisputes.length,
    };

    // ── AI prediction (A2 — constraining) ──────────────────────
    let filerWinProbability: number;
    let predictedAwardMin: number | null = null;
    let predictedAwardMax: number | null = null;
    let confidence: number;
    let summary: string;

    try {
      const aiRes = await callAI({
        agent: "disputeRootCause",
        tenant: dispute.filedByGtid,
        prompt: `Predict the outcome of this trade dispute. Return JSON only: {"filer_win_probability": 0.0-1.0, "predicted_award_min_usd": number, "predicted_award_max_usd": number, "confidence": 0.0-1.0, "summary": "one sentence"}.
Dispute type: ${dispute.type}
Claim amount: $${claimAmount}
Trade value: $${tradeValue}
Evidence count: ${evidenceCount}
Mediation rounds: ${mediationRounds}
Buyer TRI: ${buyerTri?.triScore || 500}
Seller TRI: ${sellerTri?.triScore || 500}
Historical filer win rate for this dispute type: ${Math.round(historicalFilerWinRate * 100)}%
Description: ${dispute.description?.slice(0, 300)}`,
      });
      const m = aiRes.content.match(/\{[\s\S]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        filerWinProbability = Math.max(0, Math.min(1, parsed.filer_win_probability || 0.5));
        predictedAwardMin = parsed.predicted_award_min_usd ?? Math.round(claimAmount * 0.3);
        predictedAwardMax = parsed.predicted_award_max_usd ?? Math.round(claimAmount * 0.7);
        confidence = Math.max(0, Math.min(1, parsed.confidence || 0.7));
        summary = parsed.summary || "Prediction generated from historical dispute patterns.";
      } else { throw new Error("no JSON"); }
    } catch {
      // Fallback: heuristic based on features
      filerWinProbability = historicalFilerWinRate * 0.6 + (evidenceCount > 5 ? 0.15 : 0) + (buyerTri && sellerTri && buyerTri.triScore > sellerTri.triScore ? 0.1 : 0);
      filerWinProbability = Math.max(0.1, Math.min(0.9, filerWinProbability));
      predictedAwardMin = Math.round(claimAmount * 0.3);
      predictedAwardMax = Math.round(claimAmount * 0.7);
      confidence = Math.min(0.85, 0.5 + (similarDisputes.length / 40));
      summary = `Based on ${similarDisputes.length} similar ${dispute.type} disputes, filer has ${Math.round(filerWinProbability * 100)}% win probability. Historical win rate: ${Math.round(historicalFilerWinRate * 100)}%.`;
    }

    // ── Persist prediction ─────────────────────────────────────
    const prediction = await db.disputePrediction.create({
      data: {
        disputeId,
        filerWinProbability: Math.round(filerWinProbability * 1000) / 1000,
        predictedAwardMin,
        predictedAwardMax,
        confidence: Math.round(confidence * 1000) / 1000,
        summary,
        features: JSON.stringify(features),
      },
    });

    return NextResponse.json({ ok: true, prediction, features });
  } catch (e: any) {
    logger.error("[disputes/prediction] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET /api/sgtx/disputes/prediction?disputeId=... — get existing prediction
export async function GET(req: NextRequest) {
  const disputeId = req.nextUrl.searchParams.get("disputeId");
  if (!disputeId) return NextResponse.json({ error: "disputeId required" }, { status: 400 });
  const prediction = await db.disputePrediction.findUnique({ where: { disputeId } });
  return NextResponse.json({ prediction });
}

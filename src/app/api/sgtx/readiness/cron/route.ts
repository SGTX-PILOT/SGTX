// SGTX Readiness Cron — AI-weighted scoring via Brain's calculateTradeReadinessScore
// ============================================================================
// Replaces the previous inline rule-based scoring (kybTier≥2 + sanctionsCleared
// + bankSwift + tradeCount) with a Brain-driven 6-component weighted score.
// The full assessment is persisted both in the TradeReadiness row (score +
// component breakdown in the `checklist` JSON) and as an Activity log row
// tagged `TRADE_READINESS_SCORED` so the audit trail records every Brain
// re-assessment with its trend, tier and recommendations.
//
// Auth: soft CRON_SECRET bearer check — only enforced when the env var is
// set (matches the pattern in /api/sgtx/brain/cron). The cron's tenant-
// iteration loop is preserved.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  calculateTradeReadinessScore,
  tenantToPortal,
  serializeTradeReadinessScore,
  type TradeReadinessScore,
} from "@/lib/sgtx/ai/portal-intelligence";

interface CronResults {
  tenantsChecked: number;
  scoresUpdated: number;
  alertsRaised: number;
  errors: string[];
  trendSummary: { improving: number; stable: number; declining: number };
}

export async function POST(req?: NextRequest) {
  const results: CronResults = {
    tenantsChecked: 0,
    scoresUpdated: 0,
    alertsRaised: 0,
    errors: [],
    trendSummary: { improving: 0, stable: 0, declining: 0 },
  };

  try {
    // --- Soft CRON_SECRET auth (only enforced when env var is set) -------
    if (req) {
      const cronSecret = process.env.CRON_SECRET;
      if (cronSecret) {
        const authHeader = req.headers.get("authorization") || "";
        const provided = authHeader.replace(/^Bearer\s+/i, "");
        if (provided !== cronSecret) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
      }
    }

    // --- Iterate every VERIFIED tenant -----------------------------------
    const tenants = await db.tenant.findMany({
      where: { lifecycleState: "VERIFIED" },
      select: {
        gtid: true,
        type: true,
        traderMode: true,
      },
    });
    results.tenantsChecked = tenants.length;

    for (const t of tenants) {
      try {
        // --- Brain-driven AI-weighted scoring ----------------------------
        const score: TradeReadinessScore = await calculateTradeReadinessScore(
          t.gtid,
        );

        // --- Recover previous score to detect tier transitions ----------
        const existing = await db.tradeReadiness.findUnique({
          where: { tenantGtid: t.gtid },
          select: { score: true },
        });
        const previousScore = existing?.score ?? null;

        // --- Persist the Brain result into TradeReadiness ----------------
        // The TradeReadiness model's `checklist` JSON column carries the
        // full AI assessment (tier, trend, components, recommendations).
        // The five legacy component columns (companyScore, bankingScore,
        // tradeScore, securityScore, legalScore) are populated from the
        // closest-matching Brain components so existing dashboards keep
        // rendering meaningful values.
        const checklistJson = serializeTradeReadinessScore(score);
        await db.tradeReadiness.upsert({
          where: { tenantGtid: t.gtid },
          update: {
            score: score.overallScore,
            companyScore: score.components.complianceVelocity.score,
            bankingScore: score.components.paymentReliability.score,
            tradeScore: score.components.tradeVolume.score,
            securityScore: score.components.sanctionsClear.score,
            legalScore: score.components.disputeFrequency.score,
            checklist: checklistJson,
            lastCalculated: new Date(),
          },
          create: {
            tenantGtid: t.gtid,
            score: score.overallScore,
            companyScore: score.components.complianceVelocity.score,
            bankingScore: score.components.paymentReliability.score,
            tradeScore: score.components.tradeVolume.score,
            securityScore: score.components.sanctionsClear.score,
            legalScore: score.components.disputeFrequency.score,
            checklist: checklistJson,
            lastCalculated: new Date(),
          },
        });
        results.scoresUpdated++;

        // --- Activity log row (audit trail) ------------------------------
        // The Tenant model has no readinessScore / readinessTier fields
        // (per schema audit), so per the IMPL-8 task spec we record every
        // Brain re-assessment as an Activity log row tagged
        // `TRADE_READINESS_SCORED`. The metadata JSON carries the full
        // TradeReadinessScore for downstream forensics.
        await db.activity.create({
          data: {
            actorGtid: t.gtid,
            action: "TRADE_READINESS_SCORED",
            description: `Brain readiness score: ${score.overallScore}/100 (${score.tier}, trend ${score.trend}). Components: marketAlignment=${score.components.marketAlignment.score}, complianceVelocity=${score.components.complianceVelocity.score}, disputeFrequency=${score.components.disputeFrequency.score}, paymentReliability=${score.components.paymentReliability.score}, sanctionsClear=${score.components.sanctionsClear.score}, tradeVolume=${score.components.tradeVolume.score}.`,
            type:
              score.tier === "PLATINUM" || score.tier === "GOLD"
                ? "SUCCESS"
                : score.tier === "BRONZE" || score.tier === "PROVISIONAL"
                  ? "WARNING"
                  : "INFO",
            metadata: checklistJson,
          },
        }).catch(() => null); // non-fatal — log failure must not break the cron

        // --- Trend summary ----------------------------------------------
        if (score.trend === "improving") results.trendSummary.improving++;
        else if (score.trend === "declining") results.trendSummary.declining++;
        else results.trendSummary.stable++;

        // --- Alert: tier drop below GOLD (score < 70) -------------------
        if (
          score.overallScore < 70 &&
          (previousScore == null || previousScore >= 70)
        ) {
          await db.inboxItem.create({
            data: {
              tenantGtid: t.gtid,
              category: "COMPLIANCE",
              priority: 85,
              title: `Trade Readiness dropped to ${score.overallScore}/100 (${score.tier})`,
              description: `Brain flagged your readiness as ${score.tier} (trend: ${score.trend}). Governor will block new trade creation until score ≥ 70. Top recommendation: ${score.recommendations[0] || "Review your readiness checklist."}`,
              ctaLabel: "View Readiness",
            },
          }).catch(() => null);
          results.alertsRaised++;
        }

        // --- Optional portal-intelligence side-effect --------------------
        // After re-scoring, opportunistically refresh the tenant's portal-
        // intelligence feed snapshot so their next dashboard mount sees a
        // fresh Brain read. Wrapped in try/catch — this is best-effort and
        // must never break the cron.
        try {
          const portal = tenantToPortal(t.type, t.traderMode);
          // Import lazily to avoid a circular import at module-load time.
          const { getPortalIntelligence } = await import(
            "@/lib/sgtx/ai/portal-intelligence"
          );
          const intelligence = await getPortalIntelligence({
            tenantGtid: t.gtid,
            portal,
          });
          await db.activity.create({
            data: {
              actorGtid: t.gtid,
              action: "PORTAL_INTELLIGENCE_REFRESHED",
              description: `Brain portal-intelligence feed refreshed (${portal}): ${intelligence.insights.map((i) => i.title).join(" | ")}`,
              type: "INFO",
              metadata: JSON.stringify(intelligence),
            },
          }).catch(() => null);
        } catch {
          /* best-effort — ignore */
        }
      } catch (e: any) {
        results.errors.push(`${t.gtid}: ${e.message}`);
      }
    }

    return NextResponse.json({
      ok: true,
      results,
      ranAt: new Date().toISOString(),
      brainModule: "calculateTradeReadinessScore + getPortalIntelligence",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET(req?: NextRequest) {
  return POST(req);
}

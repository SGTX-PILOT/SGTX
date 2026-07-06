// POST /api/sgtx/payment/fealock/freeze — body: { ustn, reason }
// Freezes FeeLock on dispute (Part 6.6.3).
//
// IMPL-7: Before freezing, the Brain's `calculateDynamicFee` is invoked to
// re-price the SGTX platform fee based on commodity volatility, route risk,
// platform liquidity, and perishable urgency — replacing the static 1.5% per
// side. The Brain-computed rate (clamped to constitutional bounds 0.1%-2.5%)
// is passed to `freezeFeeLock`, which updates the FeeLock's `sgtxFeeUsd` and
// `totalAmountUsd` before the ACTIVE → FROZEN transition. The full factor
// breakdown is recorded in an Activity log row.
//
// If the Brain call fails, the route falls back to the static 1.5% with an
// Activity log noting the fallback — existing freeze logic is preserved.
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { freezeFeeLock } from "@/lib/sgtx/payment/fealock";
import {
  calculateDynamicFee,
  BASE_FEE_RATE,
  type DynamicFeeResult,
} from "@/lib/sgtx/ai/dynamic-fee";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, reason } = body;
    if (!ustn || !reason) {
      return NextResponse.json(
        { error: "ustn and reason required" },
        { status: 400 },
      );
    }

    // ---- 1. Look up trade context (commodity / corridor / value) ----
    // The Brain needs these fields to compute the dynamic fee. We fetch them
    // from the Trade + Tenant rows (the freeze body only carries ustn+reason).
    let trade: any = null;
    try {
      trade = await db.trade.findUnique({
        where: { ustn },
        include: { buyer: true, seller: true },
      });
    } catch (err) {
      logger.warn("[payment/fealock/freeze] trade lookup failed", {
        ustn,
        error: (err as Error)?.message,
      });
    }

    const dynamicFeeInput = trade
      ? {
          ustn,
          commodity: trade.commodity,
          originCountry: trade.originCountry,
          destCountry: trade.destCountry,
          contractValueUsd: trade.tradeValueUsd,
          hsCode: trade.commodityHs || undefined,
        }
      : { ustn };

    // ---- 2. Brain — calculate dynamic fee (graceful fallback) ----
    let brainResult: DynamicFeeResult | null = null;
    let brainFallback = false;
    try {
      brainResult = await calculateDynamicFee(dynamicFeeInput);
    } catch (err) {
      logger.error("[payment/fealock/freeze] calculateDynamicFee threw", {
        ustn,
        error: (err as Error)?.message,
      });
      brainFallback = true;
    }

    // ---- 3. Compute the fee override to apply (Brain or fallback 1.5%) ----
    let feeRate: number;
    let feeAmountUsd: number;
    let rationale: string;

    if (brainResult) {
      feeRate = brainResult.finalRate;
      feeAmountUsd = brainResult.feeAmountUsd;
      rationale = brainResult.rationale;
    } else {
      // Fallback — static 1.5% on the trade value (or zero if trade lookup failed).
      const contractValueUsd = trade?.tradeValueUsd ?? 0;
      feeRate = BASE_FEE_RATE;
      feeAmountUsd = Math.round(contractValueUsd * BASE_FEE_RATE * 100) / 100;
      rationale =
        `Brain calculateDynamicFee failed — falling back to static ${(BASE_FEE_RATE * 100).toFixed(1)}% ` +
        `(multiplier 1.0). Constitutional bounds 0.1%-2.5% respected.`;
      brainFallback = true;
    }

    // ---- 4. Freeze FeeLock with the Brain-computed (or fallback) rate ----
    // The existing freeze logic (state transition, kvVersion bump, FeePaymentRequest
    // mirror, Smart Inbox alert) is fully preserved — we only add an optional
    // dynamicFee override that re-prices sgtxFeeUsd + totalAmountUsd.
    const result = await freezeFeeLock(ustn, reason, {
      rate: feeRate,
      amountUsd: feeAmountUsd,
    });

    // ---- 5. Activity log — full dynamic-fee breakdown (audit trail) ----
    // The FeeLock Prisma model has no fields for factors/rationale/multiplier,
    // so we persist the breakdown as an Activity log row per the task spec.
    try {
      await db.activity.create({
        data: {
          tradeId: trade?.id ?? null,
          actorGtid: trade?.buyerGtid ?? null,
          action: "FEELOCK_DYNAMIC_FEE_ASSESSED",
          description: `FeeLock frozen for ${ustn.slice(0, 24)}… — ` +
            `Brain dynamic fee ${(feeRate * 100).toFixed(2)}% ` +
            `($${feeAmountUsd.toFixed(2)} USD) applied. ${rationale}`,
          type: brainFallback ? "WARNING" : "INFO",
          metadata: JSON.stringify({
            ustn,
            brainModule: brainResult?.brainModule ?? "calculateDynamicFee (fallback)",
            baseRate: brainResult?.baseRate ?? BASE_FEE_RATE,
            multiplier: brainResult?.multiplier ?? 1.0,
            finalRate: feeRate,
            feeAmountUsd,
            factors: brainResult?.factors ?? [],
            rationale,
            constitutionalCompliant: brainResult?.constitutionalCompliant ?? true,
            assessedAt: brainResult?.assessedAt ?? new Date().toISOString(),
            fallback: brainFallback,
            freezeReason: reason,
            feeLockId: result.id,
            feeLockStatus: result.status,
            feeLockKvVersion: result.kvVersion,
          }),
        },
      });
    } catch (err) {
      // Non-fatal — the freeze itself succeeded; we just couldn't write the audit row.
      logger.error("[payment/fealock/freeze] activity log write failed", {
        ustn,
        error: (err as Error)?.message,
      });
    }

    return NextResponse.json({
      ok: true,
      feeLock: result,
      dynamicFee: {
        brainModule: brainResult?.brainModule ?? "calculateDynamicFee (fallback)",
        baseRate: brainResult?.baseRate ?? BASE_FEE_RATE,
        multiplier: brainResult?.multiplier ?? 1.0,
        finalRate: feeRate,
        feeAmountUsd,
        factors: brainResult?.factors ?? [],
        rationale,
        constitutionalCompliant: brainResult?.constitutionalCompliant ?? true,
        fallback: brainFallback,
        assessedAt: brainResult?.assessedAt ?? new Date().toISOString(),
      },
      message: brainFallback
        ? "FeeLock frozen with fallback 1.5% fee (Brain unavailable). Container release authorisation is now blocked."
        : `FeeLock frozen with Brain dynamic fee ${(feeRate * 100).toFixed(2)}%. Container release authorisation is now blocked.`,
    });
  } catch (e: any) {
    logger.error("[payment/fealock/freeze]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

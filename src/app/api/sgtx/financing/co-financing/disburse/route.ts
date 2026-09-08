// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v17 §10.23-10.24 — Co-financing: disburse via PSP split (0.25% fee per leg).
// POST /api/sgtx/financing/co-financing/disburse
//   body: { co_financing_id, actor_gtid? }
//
// Generates ONE PSP split instruction with one leg per accepted financier
// tranche. Each leg:
//   • Financier → PSP: full tranche amount
//   • PSP → Borrower: tranche × (1 − 0.25%) = borrowerNet
//   • PSP → SGTX: tranche × 0.25% = feeUsd
//
// The PSP split is recorded as PaymentLeg rows (one per financier) and a
// single pspSplitReference stamped on each FinancingAgreementAnnex. Each
// annex is marked DISBURSED. The master FinancingAgreement is marked
// DISBURSED when ALL annexes are disbursed.
//
// Currency: USD / EGP / EURO based on financingRequest.preferredCurrency.
//
// Returns: { split_id, legs: [{ financier_gtid, amount, currency, fee_usd }], total_fee_usd }
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import {
  generatePspSplitInstruction,
  type AcceptedBid,
} from "@/lib/sgtx/financing/co-financing";
import { computeFinancingFee } from "@/lib/sgtx/financing";

export const dynamic = "force-dynamic";

// Currency map: FinancingRequest.preferredCurrency → ISO 4217 code
// (the schema uses informal strings — USD / EGP / EURO).
function normalizeCurrency(pref: string | null | undefined): string {
  if (!pref) return "USD";
  const upper = pref.toUpperCase();
  if (upper === "EUR" || upper === "EURO") return "EUR";
  if (upper === "EGP" || upper === "EG") return "EGP";
  return "USD";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const coFinancingId = body?.co_financing_id || body?.coFinancingId;
    const actorGtid = body?.actor_gtid || body?.actorGtid || req.headers.get("x-tenant-gtid") || "";

    if (!coFinancingId) {
      return NextResponse.json(
        { error: "co_financing_id is required" },
        { status: 400 },
      );
    }

    const financingRequest = await db.financingRequest.findUnique({
      where: { id: coFinancingId },
      include: {
        borrower: true,
        trade: true,
        agreements: {
          include: {
            annexes: { include: { bid: true } },
          },
        },
      },
    });
    if (!financingRequest) {
      return NextResponse.json(
        { error: "Co-financing request not found" },
        { status: 404 },
      );
    }

    // The first FinancingAgreement for this request is the master co-financing
    // agreement (created by /co-financing/agreement).
    const masterAgreement = financingRequest.agreements[0];
    if (!masterAgreement) {
      return NextResponse.json(
        {
          error:
            "No master financing agreement found. Call /co-financing/agreement first.",
        },
        { status: 400 },
      );
    }

    // All annexes must be signed by their financier before disbursement
    const unsignedAnnexes = masterAgreement.annexes.filter((a) => !a.financierSignedAt);
    if (unsignedAnnexes.length > 0) {
      return NextResponse.json(
        {
          error: `${unsignedAnnexes.length} annex(es) are not yet signed by their financier. Disbursement blocked.`,
          code: "G4U7_NOT_SIGNED",
          unsigned_annex_ids: unsignedAnnexes.map((a) => a.id),
        },
        { status: 400 },
      );
    }

    // Filter to annexes not yet disbursed (idempotency — re-calling disburse
    // only disburses the remaining annexes)
    const pendingAnnexes = masterAgreement.annexes.filter((a) => a.status !== "DISBURSED");
    if (pendingAnnexes.length === 0) {
      // All already disbursed — return the existing split summary
      const allAnnexes = masterAgreement.annexes;
      const totalFee = allAnnexes.reduce((s, a) => s + a.feeUsd, 0);
      return NextResponse.json({
        ok: true,
        split_id: masterAgreement.annexes[0]?.pspSplitReference || null,
        legs: allAnnexes.map((a) => ({
          financier_gtid: a.financierGtid,
          amount: a.amountFinanced,
          currency: normalizeCurrency(financingRequest.preferredCurrency),
          fee_usd: a.feeUsd,
          borrower_net: a.borrowerNetProceeds,
          leg_state: "DISBURSED",
          psp_split_reference: a.pspSplitReference,
        })),
        total_fee_usd: +totalFee.toFixed(2),
        total_borrower_net: +allAnnexes.reduce((s, a) => s + a.borrowerNetProceeds, 0).toFixed(2),
        currency: normalizeCurrency(financingRequest.preferredCurrency),
        fee_rate_pct: 0.25,
        already_disbursed: true,
      });
    }

    // Build the PSP split instruction from the pending annexes
    const acceptedBids: AcceptedBid[] = pendingAnnexes.map((a) => ({
      bidId: a.bidId,
      financierGtid: a.financierGtid,
      amount: a.amountFinanced,
      apr: a.apr,
    }));
    const currency = normalizeCurrency(financingRequest.preferredCurrency);
    const split = generatePspSplitInstruction(acceptedBids, currency);

    // Persist each leg as a PaymentLeg row + stamp each annex as DISBURSED
    const disbursedLegs: any[] = [];
    for (let i = 0; i < split.legs.length; i++) {
      const leg = split.legs[i];
      const annex = pendingAnnexes[i];

      // Create a PaymentLeg row (the actual payment to the borrower)
      const paymentLeg = await db.paymentLeg.create({
        data: {
          legId: leg.legId,
          ustn: financingRequest.ustn || financingRequest.requestId,
          beneficiaryId: financingRequest.borrowerGtid,
          beneficiaryName: financingRequest.borrower?.legalName || financingRequest.borrowerGtid,
          beneficiaryType: "SELLER", // borrower of financing is the seller (pre-shipment) or buyer (post-shipment)
          amount: leg.borrowerNet,
          currency: leg.currency,
          legState: "SUBMITTED",
          sgtxEventHash: annex.id, // link back to the annex for reconciliation
        },
      });

      // Stamp the annex as DISBURSED with the PSP split reference
      await db.financingAgreementAnnex.update({
        where: { id: annex.id },
        data: {
          disbursedAt: new Date(),
          pspSplitReference: split.splitId,
          status: "DISBURSED",
        },
      });

      // If this annex is for a DeFi bid, create a DeFiPosition for monitoring
      if (annex.bid?.isDeFi && annex.bid.deFiProtocol) {
        try {
          await db.deFiPosition.create({
            data: {
              annexId: annex.id,
              protocolName: annex.bid.deFiProtocol,
              borrowerGtid: financingRequest.borrowerGtid,
              financierGtid: annex.financierGtid,
              principalUsd: annex.amountFinanced,
              healthFactor: 2.0,
              collateralUsd: annex.amountFinanced * 1.5,
              debtUsd: annex.amountFinanced,
              status: "ACTIVE",
            },
          });
        } catch (_) { /* best-effort */ }
      }

      disbursedLegs.push({
        annex_id: annex.id,
        financier_gtid: leg.financierGtid,
        amount: leg.amount,
        currency: leg.currency,
        fee_usd: leg.feeUsd,
        borrower_net: leg.borrowerNet,
        payment_leg_id: paymentLeg.id,
        leg_state: "DISBURSED",
        psp_split_reference: split.splitId,
      });
    }

    // Update the financing request fee lock status
    await db.financingRequest.update({
      where: { id: coFinancingId },
      data: { feeLockStatus: "ACTIVE", status: "ACTIVE" },
    });

    // If all annexes are now disbursed, mark the master agreement DISBURSED
    const refreshedAnnexes = await db.financingAgreementAnnex.findMany({
      where: { agreementId: masterAgreement.id },
    });
    const allDisbursed = refreshedAnnexes.every((a) => a.status === "DISBURSED");
    if (allDisbursed) {
      await db.financingAgreement.update({
        where: { id: masterAgreement.id },
        data: { status: "DISBURSED" },
      });

      // Notify the borrower
      try {
        const totalBorrowerNet = refreshedAnnexes.reduce(
          (s, a) => s + a.borrowerNetProceeds,
          0,
        );
        const totalFee = refreshedAnnexes.reduce((s, a) => s + a.feeUsd, 0);
        await db.inboxItem.create({
          data: {
            tenantGtid: financingRequest.borrowerGtid,
            tradeId: financingRequest.tradeId,
            category: "NEW_OFFER",
            priority: 95,
            title: `Co-financing disbursed — $${totalBorrowerNet.toLocaleString()} received`,
            description: `All ${refreshedAnnexes.length} financier tranches disbursed via PSP split ${split.splitId}. Net proceeds after 0.25% SGTX fee ($${totalFee.toFixed(2)}) deposited. Blended APR ${masterAgreement.blendedApr}%. Repayment schedule active.`,
            ctaLabel: "View Co-Financing",
          },
        });
      } catch (_) { /* best-effort */ }
    }

    return NextResponse.json({
      ok: true,
      split_id: split.splitId,
      legs: disbursedLegs,
      total_fee_usd: split.totalFeeUsd,
      total_borrower_net: split.totalBorrowerNet,
      currency: split.currency,
      fee_rate_pct: split.feeRatePct,
      all_disbursed: allDisbursed,
      master_agreement_id: masterAgreement.agreementId,
      master_agreement_status: allDisbursed ? "DISBURSED" : "PARTIALLY_DISBURSED",
    });
  } catch (e: any) {
    logger.error("[financing/co-financing/disburse]", { message: e?.message, stack: e?.stack });
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

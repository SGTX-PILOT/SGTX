// POST /api/sgtx/payment-evidence/match — Match a PaymentEvent to a TradeCostObligation.
//
// Body:
//   {
//     paymentEventId: string,       // existing PaymentEvent row id
//     obligationId: string          // existing TradeCostObligation row id
//   }
// OR inline form:
//   {
//     payment: { amount, currency?, payer?, beneficiary?, ... },
//     obligation: { amount, currency?, payer?, payee?, ... }
//   }
//
// On match, the PaymentEvent's `reconciliationState` and `obligationId` are
// updated in-place (defensive try/catch). The computed match result and
// amount difference are returned.
//
// Response:
//   {
//     ok,
//     match: { matchResult, amountDifference, amountDifferencePct, issues },
//     updated?: { paymentEventId, reconciliationState }
//   }

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { matchPaymentToObligation } from "@/lib/sgtx/payment-evidence";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { paymentEventId, obligationId, payment: paymentInline, obligation: obligationInline } = body || {};

    let payment: any = paymentInline;
    let obligation: any = obligationInline;

    // Load from DB if IDs provided
    if ((paymentEventId || obligationId) && (!payment || !obligation)) {
      try {
        if (paymentEventId && !payment) {
          payment = await db.paymentEvent.findUnique({ where: { id: paymentEventId } });
          if (!payment) {
            return NextResponse.json({ error: "PaymentEvent not found" }, { status: 404 });
          }
        }
        if (obligationId && !obligation) {
          obligation = await db.tradeCostObligation.findUnique({ where: { id: obligationId } });
          if (!obligation) {
            return NextResponse.json({ error: "TradeCostObligation not found" }, { status: 404 });
          }
        }
      } catch (e: any) {
        logger.error("[payment-evidence/match] DB lookup failed", { error: e?.message });
        return NextResponse.json(
          { error: "Database lookup failed", detail: e?.message },
          { status: 500 },
        );
      }
    }

    if (!payment || !obligation) {
      return NextResponse.json(
        { error: "Both payment and obligation must be provided (inline or via IDs)" },
        { status: 400 },
      );
    }

    // Run pure matching engine
    const match = matchPaymentToObligation(payment, obligation);

    // Update PaymentEvent reconciliationState if we have an ID
    let updated: { paymentEventId: string; reconciliationState: string } | null = null;
    if (payment.id) {
      try {
        await db.paymentEvent.update({
          where: { id: payment.id },
          data: {
            reconciliationState: match.matchResult,
            ...(obligation.id ? { obligationId: obligation.id } : {}),
            status: match.matchResult === "MATCH" ? "MATCHED_TO_USTN" : "PAYMENT_MANUAL_REVIEW",
          },
        });
        updated = { paymentEventId: payment.id, reconciliationState: match.matchResult };
      } catch (e: any) {
        logger.error("[payment-evidence/match] DB update failed", {
          paymentEventId: payment.id,
          error: e?.message,
        });
      }
    }

    return NextResponse.json({ ok: true, match, updated });
  } catch (e: any) {
    logger.error("[payment-evidence/match] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

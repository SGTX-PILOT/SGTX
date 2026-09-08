// @ts-nocheck
/**
 * SGTX v17 §24 — Imports Workflow: create local payment batch
 * ============================================================================
 * POST /api/sgtx/imports/payments/batch
 *   Body: { declaration_id }
 *   Returns: { ok, batch_id, declaration_id, settlement_instruction_id,
 *              payments: [{ leg_id, payee, payee_name, beneficiary_type,
 *                           amount_usd, currency, purpose, state }],
 *              total_usd, currency }
 *
 * Builds the local payment batch for an import declaration. Creates a single
 * SettlementInstruction + one PaymentLeg per payee:
 *   1. Egyptian Customs Authority — duty + anti-dumping
 *   2. Egyptian Tax Authority     — VAT + excise
 *   3. Port Authority             — THC + port handling
 *   4. Customs Broker             — broker entry fee
 *
 * Non-custodial: SGTX only emits the split instructions; the licensed PSP
 * (Fawry / PayMob / Stripe / CBE IPN) holds and executes the funds.
 *
 * Idempotent — re-calling with the same declaration_id returns the existing
 * batch summary.
 */

import { NextRequest, NextResponse } from "next/server";
import { createLocalPaymentBatch } from "@/lib/sgtx/imports";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.declaration_id) {
      return NextResponse.json(
        { ok: false, error: "declaration_id is required" },
        { status: 400 },
      );
    }
    const batch = await createLocalPaymentBatch(body.declaration_id);
    return NextResponse.json({
      ok: true,
      batch_id: batch.batchId,
      declaration_id: batch.declarationId,
      settlement_instruction_id: batch.settlementInstructionId,
      payments: batch.payments.map((p) => ({
        leg_id: p.legId,
        payee: p.payee,
        payee_name: p.payeeName,
        beneficiary_type: p.beneficiaryType,
        amount_usd: p.amountUsd,
        currency: p.currency,
        purpose: p.purpose,
        state: p.state,
      })),
      total_usd: batch.totalUsd,
      currency: batch.currency,
    }, { status: 201 });
  } catch (err: any) {
    logger.error("[api/sgtx/imports/payments/batch] POST failed", { error: err?.message });
    const status = err?.message?.startsWith("DECLARATION_NOT_FOUND")
      || err?.message?.startsWith("DECLARATION_ID_REQUIRED")
      || err?.message?.startsWith("USTN_NOT_RESOLVED")
      || err?.message?.startsWith("IMPORTER_GTID_NOT_RESOLVED")
      ? 400 : 500;
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status },
    );
  }
}

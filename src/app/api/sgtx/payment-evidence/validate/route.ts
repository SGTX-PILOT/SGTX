// POST /api/sgtx/payment-evidence/validate — Pure validation endpoint.
// Runs `validatePaymentEvidence()` against the supplied evidence payload
// WITHOUT persisting anything. Useful for pre-flight checks before submit.
//
// Body: the PaymentEvidenceInput shape (same as /submit, without ustn /
// paymentEventId which are linkage-only fields).
//
// Response:
//   { ok, validation: { valid, confidenceLevel, matchResult, issues } }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { validatePaymentEvidence } from "@/lib/sgtx/payment-evidence";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      evidenceType,
      evidenceHash,
      evidenceUrl,
      payer,
      beneficiary,
      bankName,
      amount,
      currency,
      executionDate,
      valueDate,
      paymentStatus,
      bankReference,
      source,
    } = body || {};

    if (!evidenceType) {
      return NextResponse.json({ error: "evidenceType is required" }, { status: 400 });
    }
    if (typeof amount !== "number" || amount <= 0) {
      return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
    }
    if (!evidenceHash && !evidenceUrl) {
      return NextResponse.json(
        { error: "evidenceHash or evidenceUrl is required" },
        { status: 400 },
      );
    }

    const validation = validatePaymentEvidence({
      evidenceType,
      evidenceHash,
      evidenceUrl,
      payer,
      beneficiary,
      bankName,
      amount,
      currency,
      executionDate,
      valueDate,
      paymentStatus,
      bankReference,
      source,
    });

    return NextResponse.json({ ok: true, validation });
  } catch (e: any) {
    logger.error("[payment-evidence/validate] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

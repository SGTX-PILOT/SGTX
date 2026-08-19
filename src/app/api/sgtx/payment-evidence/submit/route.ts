// POST /api/sgtx/payment-evidence/submit — Submit a new PaymentEvidence row
// (typically accompanying a PaymentEvent that has been previously recorded).
//
// Body:
//   {
//     ustn?, paymentEventId?,
//     evidenceType,           // BANK_STATEMENT | MT103 | API_CONFIRMATION | ...
//     evidenceHash?, evidenceUrl?,
//     payer?, beneficiary?, bankName?,
//     amount, currency?,
//     executionDate? (ISO), valueDate? (ISO),
//     paymentStatus?, bankReference?,
//     source?,                // default "API"
//     confidenceLevel?,       // default 5; override only if you know better
//   }
//
// On submit, the engine also runs `validatePaymentEvidence()` and stores
// the computed confidenceLevel (overriding any caller-supplied value when
// the engine downgrades confidence). The validation issues are returned
// in the response but not stored.
//
// Response:
//   { ok, evidence: { id, confidenceLevel, verified }, validation: { valid, issues, matchResult } }

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { validatePaymentEvidence } from "@/lib/sgtx/payment-evidence";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      ustn,
      paymentEventId,
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
      source = "API",
      confidenceLevel,
    } = body || {};

    // Validate required fields
    const missing: string[] = [];
    if (!evidenceType) missing.push("evidenceType");
    if (typeof amount !== "number" || amount <= 0) missing.push("amount");
    if (!evidenceHash && !evidenceUrl) missing.push("evidenceHash or evidenceUrl");
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 },
      );
    }

    // Run validation engine (computes confidence + issues)
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

    // Persist — use the engine-computed confidence unless caller provided
    // an explicitly lower (better) number AND validation passed
    const finalConfidence =
      typeof confidenceLevel === "number" && confidenceLevel > 0 && confidenceLevel < validation.confidenceLevel && validation.valid
        ? confidenceLevel
        : validation.confidenceLevel;

    let created: { id: string; confidenceLevel: number; verified: boolean } | null = null;
    try {
      const row = await db.paymentEvidence.create({
        data: {
          ustn: ustn ?? null,
          paymentEventId: paymentEventId ?? null,
          evidenceType,
          evidenceHash: evidenceHash ?? null,
          evidenceUrl: evidenceUrl ?? null,
          payer: payer ?? null,
          beneficiary: beneficiary ?? null,
          bankName: bankName ?? null,
          amount,
          currency: currency ?? null,
          executionDate: executionDate ? new Date(executionDate) : null,
          valueDate: valueDate ? new Date(valueDate) : null,
          paymentStatus: paymentStatus ?? null,
          bankReference: bankReference ?? null,
          source,
          confidenceLevel: finalConfidence,
          verified: false,
        },
      });
      created = {
        id: row.id,
        confidenceLevel: row.confidenceLevel,
        verified: row.verified,
      };
    } catch (e: any) {
      logger.error("[payment-evidence/submit] DB insert failed", { error: e?.message });
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to persist payment evidence",
          validation,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      evidence: created,
      validation,
    });
  } catch (e: any) {
    logger.error("[payment-evidence/submit] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

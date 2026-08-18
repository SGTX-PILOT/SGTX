// SGTX Payment Evidence Engine — Part XIII (CCL-009)
// ============================================================================
// Validates payment evidence (bank statements, MT103, electronic messages,
// counterparty confirmations) and matches PaymentEvent rows against
// TradeCostObligation rows.
//
// Confidence-level ladder (1 = best, 5 = worst):
//   1. Direct API confirmation   (e.g. CBE open-banking, SWIFT gpi)
//   2. Structured confirmation   (MT103, MT202, ISO 20022)
//   3. Electronic evidence       (bank PDF, electronic message)
//   4. Counterparty confirmation (beneficiary confirmation letter)
//   5. User-uploaded             (manual upload, no third-party attestation)
//
// Match outcome (reconciliationState):
//   MATCH | PARTIAL | OVERPAYMENT | UNDERPAYMENT | WRONG_PAYER |
//   WRONG_BENEFICIARY | WRONG_CURRENCY | DUPLICATE | MISMATCH |
//   SUSPICIOUS | MANUAL_REVIEW | UNMATCHED
//
// All functions are pure (no DB). The API routes handle persistence via the
// Prisma models PaymentEvent / PaymentEvidence / TradeCostObligation.

import { logger } from "@/lib/sgtx/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type EvidenceType =
  | "BANK_STATEMENT"
  | "BANK_CONFIRMATION"
  | "MT103"
  | "ELECTRONIC_BANK_MESSAGE"
  | "BANK_PDF"
  | "BENEFICIARY_CONFIRMATION"
  | "TRANSACTION_REFERENCE"
  | "API_CONFIRMATION";

export interface PaymentEvidenceInput {
  evidenceType: EvidenceType | string;
  evidenceHash?: string;
  evidenceUrl?: string;
  payer?: string;
  beneficiary?: string;
  bankName?: string;
  amount: number;
  currency?: string;
  executionDate?: Date | string;
  valueDate?: Date | string;
  paymentStatus?: string;
  bankReference?: string;
  source?: string;
}

// Minimal shape of a PaymentEvent row — kept loose so callers can pass a
// Prisma row, a plain object, or a partial record.
export interface PaymentEvent {
  id?: string;
  ustn?: string | null;
  obligationId?: string | null;
  bankTransactionRef?: string | null;
  amount: number;
  currency?: string | null;
  payer?: string | null;
  beneficiary?: string | null;
  executionDate?: Date | string | null;
  valueDate?: Date | string | null;
  status?: string | null;
  evidenceReference?: string | null;
  evidenceConfidence?: number | null;
  reconciliationState?: string | null;
}

// Minimal shape of a TradeCostObligation row.
export interface TradeCostObligation {
  id?: string;
  ustn?: string | null;
  obligationType?: string;
  recipientClass?: string;
  amount: number;
  currency?: string | null;
  payer?: string | null;
  payee?: string | null;
  dueDate?: Date | string | null;
  calculationMethod?: string | null;
  costState?: string;
}

export type MatchResult =
  | "MATCH"
  | "PARTIAL"
  | "OVERPAYMENT"
  | "UNDERPAYMENT"
  | "WRONG_PAYER"
  | "WRONG_BENEFICIARY"
  | "WRONG_CURRENCY"
  | "DUPLICATE"
  | "MISMATCH"
  | "SUSPICIOUS"
  | "MANUAL_REVIEW"
  | "UNMATCHED";

export interface ValidationOutcome {
  valid: boolean;
  confidenceLevel: number; // 1-5 (1 = best)
  matchResult: MatchResult;
  issues: string[];
}

// ---------------------------------------------------------------------------
// Confidence lookup table
// ---------------------------------------------------------------------------
const CONFIDENCE_BY_TYPE: Record<string, number> = {
  API_CONFIRMATION: 1,
  MT103: 2,
  ELECTRONIC_BANK_MESSAGE: 2,
  BANK_CONFIRMATION: 3,
  BANK_STATEMENT: 3,
  BANK_PDF: 3,
  BENEFICIARY_CONFIRMATION: 4,
  TRANSACTION_REFERENCE: 5,
};

const AMOUNT_TOLERANCE_PCT = 0.005; // 0.5% — typical FX/timing tolerance

// ---------------------------------------------------------------------------
// validatePaymentEvidence
// ---------------------------------------------------------------------------
export function validatePaymentEvidence(evidence: PaymentEvidenceInput): ValidationOutcome {
  const issues: string[] = [];
  let confidence = CONFIDENCE_BY_TYPE[evidence.evidenceType] ?? 5;

  // Required fields
  if (typeof evidence.amount !== "number" || evidence.amount <= 0) {
    issues.push("amount must be a positive number");
  }
  if (!evidence.evidenceType) {
    issues.push("evidenceType is required");
  }
  // Evidence must have either a hash, a URL, or both
  if (!evidence.evidenceHash && !evidence.evidenceUrl) {
    issues.push("evidenceHash or evidenceUrl is required");
  }
  // Payer/beneficiary presence (downgrades confidence for low-tier types)
  if (!evidence.payer) {
    issues.push("payer is missing — confidence downgraded");
    confidence = Math.max(confidence, 4);
  }
  if (!evidence.beneficiary) {
    issues.push("beneficiary is missing — confidence downgraded");
    confidence = Math.max(confidence, 4);
  }
  // Currency presence (downgrades confidence)
  if (!evidence.currency) {
    issues.push("currency is missing — confidence downgraded");
    confidence = Math.max(confidence, 4);
  }
  // For higher-confidence types we additionally require bankReference + executionDate
  if (confidence <= 2) {
    if (!evidence.bankReference) {
      issues.push("high-confidence evidence requires bankReference");
      confidence = Math.max(confidence, 3);
    }
    if (!evidence.executionDate) {
      issues.push("high-confidence evidence requires executionDate");
      confidence = Math.max(confidence, 3);
    }
  }
  // Sanity: valueDate cannot precede executionDate
  if (evidence.executionDate && evidence.valueDate) {
    const exec = toDate(evidence.executionDate);
    const val = toDate(evidence.valueDate);
    if (exec && val && val.getTime() < exec.getTime()) {
      issues.push("valueDate precedes executionDate — flagged for review");
      confidence = Math.max(confidence, 4);
    }
  }
  // Sanity: amount unreasonably large (> $10M)
  if (evidence.amount > 10_000_000) {
    issues.push("amount exceeds $10M — flagged for manual review");
    confidence = Math.max(confidence, 4);
  }

  // Match result: pre-validation result (no obligation to compare against)
  // The result is the evidence's standalone quality classification — the
  // caller will typically call matchPaymentToObligation afterwards.
  let matchResult: MatchResult = "UNMATCHED";
  if (issues.length === 0 && confidence <= 3) {
    matchResult = "MATCH";
  } else if (issues.length === 0) {
    matchResult = "MANUAL_REVIEW";
  } else if (issues.length > 3) {
    matchResult = "SUSPICIOUS";
  } else {
    matchResult = "MANUAL_REVIEW";
  }

  // valid = no blocking issues AND confidence ≤ 4 (5 = unverified user upload)
  const blockingIssues = issues.filter(
    (i) =>
      i.includes("is required") ||
      i.includes("must be a positive") ||
      i.includes("evidenceHash or evidenceUrl"),
  );
  const valid = blockingIssues.length === 0 && confidence <= 4;

  if (!valid) {
    logger.warn("[payment-evidence] evidence rejected", {
      evidenceType: evidence.evidenceType,
      issues,
      confidence,
    });
  }

  return { valid, confidenceLevel: confidence, matchResult, issues };
}

// ---------------------------------------------------------------------------
// matchPaymentToObligation
// ---------------------------------------------------------------------------
export function matchPaymentToObligation(
  payment: PaymentEvent,
  obligation: TradeCostObligation,
): {
  matchResult: MatchResult;
  amountDifference: number;
  amountDifferencePct: number;
  issues: string[];
} {
  const issues: string[] = [];

  // Currency mismatch
  if (payment.currency && obligation.currency && payment.currency !== obligation.currency) {
    issues.push(`currency mismatch: payment ${payment.currency} vs obligation ${obligation.currency}`);
  }

  // Amount comparison (with tolerance)
  const amountDiff = payment.amount - obligation.amount;
  const amountDiffPct = obligation.amount > 0 ? Math.abs(amountDiff) / obligation.amount : 0;
  let amountOutcome: MatchResult = "MATCH";
  if (amountDiffPct > AMOUNT_TOLERANCE_PCT) {
    if (amountDiff > 0) {
      amountOutcome = "OVERPAYMENT";
      issues.push(
        `overpayment of ${amountDiff.toFixed(2)} (${(amountDiffPct * 100).toFixed(2)}% above obligation)`,
      );
    } else {
      amountOutcome = "UNDERPAYMENT";
      issues.push(
        `underpayment of ${Math.abs(amountDiff).toFixed(2)} (${(amountDiffPct * 100).toFixed(2)}% below obligation)`,
      );
    }
  }

  // Payer mismatch
  let payerOutcome: MatchResult | null = null;
  if (payment.payer && obligation.payer && payment.payer !== obligation.payer) {
    // Both are BUYER/SELLER tags — if they differ, that's a wrong-payer flag
    if (
      ["BUYER", "SELLER"].includes(payment.payer) &&
      ["BUYER", "SELLER"].includes(obligation.payer) &&
      payment.payer !== obligation.payer
    ) {
      payerOutcome = "WRONG_PAYER";
      issues.push(`payer mismatch: payment ${payment.payer} vs obligation ${obligation.payer}`);
    }
  }

  // Beneficiary mismatch (best-effort — obligations carry payee, payments carry beneficiary)
  let beneficiaryOutcome: MatchResult | null = null;
  if (
    payment.beneficiary &&
    obligation.payee &&
    payment.beneficiary !== obligation.payee &&
    !obligation.payee.endsWith("_CUSTOMS") // payee like "EG_CUSTOMS" is a class, not a strict party
  ) {
    beneficiaryOutcome = "WRONG_BENEFICIARY";
    issues.push(`beneficiary mismatch: payment ${payment.beneficiary} vs obligation ${obligation.payee}`);
  }

  // Currency mismatch overrides amount outcome
  let matchResult: MatchResult;
  if (payment.currency && obligation.currency && payment.currency !== obligation.currency) {
    matchResult = "WRONG_CURRENCY";
  } else if (payerOutcome) {
    matchResult = payerOutcome;
  } else if (beneficiaryOutcome) {
    matchResult = beneficiaryOutcome;
  } else if (amountOutcome === "OVERPAYMENT" && amountDiffPct > 0.1) {
    // >10% overpayment is suspicious (possible duplicate or wrong obligation)
    matchResult = "DUPLICATE";
  } else {
    matchResult = amountOutcome;
  }

  // Special case: underpayment small enough to be a partial match
  if (matchResult === "UNDERPAYMENT" && amountDiffPct <= 0.05) {
    matchResult = "PARTIAL";
  }

  return {
    matchResult,
    amountDifference: amountDiff,
    amountDifferencePct: amountDiffPct,
    issues,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function toDate(d: Date | string): Date | null {
  if (d instanceof Date) return d;
  try {
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

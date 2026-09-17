// SGTX Part 6.10 — Reconciliation Engine (A2 HF Donut)
// Continuously matches incoming payment confirmations (PSP webhooks, bank statements)
// against open FeeLock + PaymentAttempt records.
//
// Match confidence rules (Part 6.10.1):
//   - USTN pattern in reference: +50
//   - Amount within $0.50 tolerance: +30
//   - Currency matches: +10
//   - Date within ±3 days of attemptedAt: +10
//   ≥95% confidence → auto-reconciled (we use ≥90 / 100 here as score-based).
//
// Unmatched items → Smart Inbox alert for finance team manual review.

import { db } from "@/lib/db";

export interface BankStatementLine {
  reference: string;       // free-text bank ref (USTN may be embedded)
  amount: number;          // signed; positive = credit
  currency: string;
  valueDate: string;       // ISO date
  counterparty?: string;
  bankRef?: string;
}

export interface ReconciliationMatch {
  bankLine: BankStatementLine;
  paymentAttemptId: string | null;
  feeLockId: string | null;
  ustn: string | null;
  confidence: number;       // 0-100
  matchedFields: string[];
  status: "MATCHED" | "PARTIAL" | "UNMATCHED";
}

export interface Discrepancy {
  type: "AMOUNT_MISMATCH" | "MISSING_PAYMENT" | "DUPLICATE_PAYMENT" | "ORPHAN_PAYMENT";
  ustn: string;
  bankLine?: BankStatementLine;
  paymentAttemptId?: string;
  expected: number;
  actual: number;
  description: string;
}

export interface ReconciliationReport {
  ustn: string;
  matched: ReconciliationMatch[];
  unmatched: ReconciliationMatch[];
  discrepancies: Discrepancy[];
  summary: {
    totalBankLines: number;
    totalMatched: number;
    totalUnmatched: number;
    totalDiscrepancies: number;
    totalUsdReconciled: number;
    totalUsdUnreconciled: number;
  };
}

// Extract USTN pattern from a free-text reference.
// USTN format: SGTX-{BUYER6/7}-{SELLER6/7}-{YYYYMMDDHHMMSS}-{RANDOM8}
const USTN_REGEX = /SGTX-[A-Z0-9]{6,8}-[A-Z0-9]{6,8}-\d{12,16}-[A-Z0-9]{6,10}/i;

function extractUstn(text: string): string | null {
  const m = text?.match(USTN_REGEX);
  return m ? m[0] : null;
}

function computeConfidence(
  line: BankStatementLine,
  attempt: any,
  ustnFromRef: string | null
): { score: number; matched: string[] } {
  let score = 0;
  const matched: string[] = [];

  // USTN pattern in reference
  if (ustnFromRef && ustnFromRef === attempt.ustn) {
    score += 50;
    matched.push("ustn_reference");
  }

  // Amount within $0.50 tolerance
  if (Math.abs(line.amount - attempt.amountUsd) < 0.5) {
    score += 30;
    matched.push("amount");
  } else if (Math.abs(line.amount - attempt.amountUsd) / attempt.amountUsd < 0.01) {
    // within 1%
    score += 25;
    matched.push("amount_1pct");
  }

  // Currency match
  if (line.currency === attempt.currency) {
    score += 10;
    matched.push("currency");
  }

  // Date within ±3 days of attemptedAt
  const attemptDate = new Date(attempt.attemptedAt);
  const lineDate = new Date(line.valueDate);
  const diffDays = Math.abs(lineDate.getTime() - attemptDate.getTime()) / (86400 * 1000);
  if (diffDays <= 3) {
    score += 10;
    matched.push("date_window");
  } else if (diffDays <= 7) {
    score += 5;
    matched.push("date_window_extended");
  }

  return { score, matched };
}

// ============ 6.10.1: reconcilePayment ============
// Matches bank statement lines against PaymentAttempt + FeeLock records.
export async function reconcilePayment(
  ustn: string,
  bankStatementData: BankStatementLine[] | { lines: BankStatementLine[] }
): Promise<ReconciliationReport> {
  const lines: BankStatementLine[] = Array.isArray(bankStatementData)
    ? bankStatementData
    : (bankStatementData as any).lines ?? [];

  // Load all payment attempts and fee locks for this USTN
  const [attempts, feeLocks] = await Promise.all([
    db.paymentAttempt.findMany({ where: { ustn }, orderBy: { attemptedAt: "desc" } }),
    db.feeLock.findMany({ where: { ustn }, orderBy: { createdAt: "desc" } }),
  ]);

  const matched: ReconciliationMatch[] = [];
  const unmatched: ReconciliationMatch[] = [];
  const discrepancies: Discrepancy[] = [];
  const matchedAttemptIds = new Set<string>();

  for (const line of lines) {
    const ustnFromRef = extractUstn(line.reference) ?? extractUstn(line.counterparty ?? "") ?? extractUstn(line.bankRef ?? "");

    let bestMatch: { attempt: any; score: number; matched: string[] } | null = null;

    for (const attempt of attempts) {
      if (matchedAttemptIds.has(attempt.id)) continue;
      const { score, matched: matchedFields } = computeConfidence(line, attempt, ustnFromRef);
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { attempt, score, matched: matchedFields };
      }
    }

    if (bestMatch && bestMatch.score >= 90) {
      matchedAttemptIds.add(bestMatch.attempt.id);
      const attempt = bestMatch.attempt;
      const feeLock = feeLocks.find(fl => fl.id === attempt.feeLockId) ?? null;

      // Mark PaymentAttempt as COMPLETED if previously PROCESSING
      if (attempt.status === "PROCESSING" || attempt.status === "PENDING") {
        await db.paymentAttempt.update({
          where: { id: attempt.id },
          data: { status: "COMPLETED", completedAt: new Date() },
        });
      }

      // Discrepancy: amount mismatch > $0.50
      if (Math.abs(line.amount - attempt.amountUsd) > 0.5) {
        discrepancies.push({
          type: "AMOUNT_MISMATCH",
          ustn,
          bankLine: line,
          paymentAttemptId: attempt.id,
          expected: attempt.amountUsd,
          actual: line.amount,
          description: `Bank credit $${line.amount.toFixed(2)} differs from expected $${attempt.amountUsd.toFixed(2)}.`,
        });
      }

      matched.push({
        bankLine: line,
        paymentAttemptId: attempt.id,
        feeLockId: feeLock?.id ?? null,
        ustn,
        confidence: bestMatch.score,
        matchedFields: bestMatch.matched,
        status: bestMatch.score >= 95 ? "MATCHED" : "PARTIAL",
      });
    } else {
      unmatched.push({
        bankLine: line,
        paymentAttemptId: null,
        feeLockId: null,
        ustn: ustnFromRef ?? ustn,
        confidence: bestMatch?.score ?? 0,
        matchedFields: bestMatch?.matched ?? [],
        status: "UNMATCHED",
      });

      // Smart Inbox alert for unmatched payment (Part 6.10.1)
      // Route to a GOV/admin tenant if one exists; skip if none (defensive)
      const admin = await db.tenant.findFirst({
        where: { OR: [{ type: "GOV" }, { type: "ADM" }] },
      });
      if (admin) {
        await db.inboxItem.create({
          data: {
            tenantGtid: admin.gtid,
            category: "SHIPMENT_ALERT",
            priority: 80,
            title: `Unmatched payment — $${line.amount.toFixed(2)} ${line.currency}`,
            description: `Bank line ref "${line.reference}" (value ${line.valueDate}) could not be auto-matched to any PaymentAttempt for USTN ${ustn}. Please review and assign manually.`,
            ctaLabel: "Review",
          },
        });
      }
    }
  }

  // Discrepancy: orphan payments (PaymentAttempt COMPLETED but no matching bank line)
  for (const attempt of attempts) {
    if (matchedAttemptIds.has(attempt.id)) continue;
    if (attempt.status === "COMPLETED") {
      // Look for any line that might be a duplicate
      const potentialDup = lines.find(l =>
        Math.abs(l.amount - attempt.amountUsd) < 0.5 &&
        !matched.some(m => m.bankLine === l)
      );
      if (potentialDup) {
        discrepancies.push({
          type: "DUPLICATE_PAYMENT",
          ustn,
          bankLine: potentialDup,
          paymentAttemptId: attempt.id,
          expected: attempt.amountUsd,
          actual: potentialDup.amount,
          description: `Possible duplicate — PaymentAttempt ${attempt.id} already COMPLETED, but bank line ref "${potentialDup.reference}" matches.`,
        });
      } else {
        discrepancies.push({
          type: "ORPHAN_PAYMENT",
          ustn,
          paymentAttemptId: attempt.id,
          expected: attempt.amountUsd,
          actual: 0,
          description: `PaymentAttempt ${attempt.id} ($${attempt.amountUsd.toFixed(2)}) marked COMPLETED but no matching bank statement line found.`,
        });
      }
    } else if (attempt.status === "PROCESSING" || attempt.status === "PENDING") {
      // Expected payment not yet received
      discrepancies.push({
        type: "MISSING_PAYMENT",
        ustn,
        paymentAttemptId: attempt.id,
        expected: attempt.amountUsd,
        actual: 0,
        description: `PaymentAttempt ${attempt.id} (${attempt.status}, $${attempt.amountUsd.toFixed(2)}) has no corresponding bank statement line yet.`,
      });
    }
  }

  const totalUsdReconciled = matched.reduce((s, m) => s + m.bankLine.amount, 0);
  const totalUsdUnreconciled = unmatched.reduce((s, m) => s + m.bankLine.amount, 0);

  return {
    ustn,
    matched,
    unmatched,
    discrepancies,
    summary: {
      totalBankLines: lines.length,
      totalMatched: matched.length,
      totalUnmatched: unmatched.length,
      totalDiscrepancies: discrepancies.length,
      totalUsdReconciled,
      totalUsdUnreconciled,
    },
  };
}

// ============ 6.10.1: generateReconciliationReport ============
// Lightweight version — uses on-disk PaymentAttempt records to produce a
// "what's expected vs what's received" snapshot without requiring bank data.
export async function generateReconciliationReport(ustn: string): Promise<{
  ustn: string;
  matched: Array<{ paymentAttemptId: string; stage: string; amount: number; pspReference: string | null; status: string }>;
  unmatched: Array<{ paymentAttemptId: string; stage: string; amount: number; status: string; reason: string }>;
  discrepancies: Array<{ paymentAttemptId: string; type: string; description: string }>;
  summary: { totalAttempts: number; completed: number; pending: number; totalUsdCompleted: number; totalUsdPending: number };
}> {
  const attempts = await db.paymentAttempt.findMany({
    where: { ustn },
    orderBy: { attemptedAt: "desc" },
  });
  const feeLocks = await db.feeLock.findMany({ where: { ustn }, orderBy: { createdAt: "desc" } });

  const matched: any[] = [];
  const unmatched: any[] = [];
  const discrepancies: any[] = [];

  for (const a of attempts) {
    if (a.status === "COMPLETED") {
      matched.push({
        paymentAttemptId: a.id,
        stage: a.stage,
        amount: a.amountUsd,
        pspReference: a.pspReference,
        status: a.status,
      });
    } else {
      unmatched.push({
        paymentAttemptId: a.id,
        stage: a.stage,
        amount: a.amountUsd,
        status: a.status,
        reason: a.status === "PROCESSING" ? "PSP webhook pending" : "Awaiting payment",
      });
      discrepancies.push({
        paymentAttemptId: a.id,
        type: "MISSING_PAYMENT",
        description: `${a.stage} attempt ${a.id} is ${a.status}; expected $${a.amountUsd.toFixed(2)}.`,
      });
    }
  }

  // Check for ACTIVE FeeLock without COMPLETED Stage 1 PaymentAttempt
  const stage1Completed = attempts.some(a => a.stage === "STAGE1" && a.status === "COMPLETED");
  const activeFeeLock = feeLocks.find(fl => fl.status === "ACTIVE");
  if (activeFeeLock && !stage1Completed) {
    discrepancies.push({
      paymentAttemptId: "—",
      type: "ORPHAN_PAYMENT",
      description: `FeeLock ${activeFeeLock.id} is ACTIVE but no Stage 1 PaymentAttempt is COMPLETED — data integrity issue.`,
    });
  }

  const totalUsdCompleted = attempts
    .filter(a => a.status === "COMPLETED")
    .reduce((s, a) => s + a.amountUsd, 0);
  const totalUsdPending = attempts
    .filter(a => a.status !== "COMPLETED" && a.status !== "FAILED" && a.status !== "REFUNDED")
    .reduce((s, a) => s + a.amountUsd, 0);

  return {
    ustn,
    matched,
    unmatched,
    discrepancies,
    summary: {
      totalAttempts: attempts.length,
      completed: matched.length,
      pending: unmatched.length,
      totalUsdCompleted,
      totalUsdPending,
    },
  };
}

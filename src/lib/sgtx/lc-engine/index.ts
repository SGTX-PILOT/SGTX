// @ts-nocheck
/**
 * SGTX Phase 6 — §3 LC (Letter of Credit) Lifecycle Engine
 * ===========================================================================
 *
 * Implements the 10-step LC lifecycle on top of the existing `LetterOfCredit`
 * model (prisma schema line 3602). The legacy `LetterOfCredit` row captures
 * the L/C data (parties, amounts, expiry, UCP 600 validation results, etc.).
 * This Phase 6 layer (`LcLifecycle` row, schema line 6486) tracks the lifecycle
 * step + history + discrepancies + payment/reimbursement amounts so the
 * SGTX platform can drive the L/C end-to-end from application to
 * reimbursement without touching the immutable `LetterOfCredit` record.
 *
 * 10 lifecycle steps (§3):
 *
 *   APPLICATION     — buyer applies for an L/C (status: PENDING)
 *   ISSUANCE        — issuing bank issues the L/C
 *   ADVISING        — advising bank advises the L/C to the beneficiary
 *   CONFIRMATION    — confirming bank adds its confirmation
 *   AMENDMENT       — an amendment is made (side-step from ISSUANCE / ADVISING /
 *                     CONFIRMATION; resumes by advancing to PRESENTATION)
 *   PRESENTATION    — beneficiary presents documents to the bank
 *   DISCREPANCY     — bank examination found discrepancies
 *   ACCEPTANCE      — discrepancies resolved / waived, documents accepted
 *   PAYMENT         — issuing bank pays the beneficiary
 *   REIMBURSEMENT   — applicant reimburses the issuing bank (status: COMPLETED)
 *
 * Sequence is enforced by `advanceLcStep` (each step may only advance to the
 * next). The AMENDMENT step is a side-step reachable via `amendLc` from
 * ISSUANCE / ADVISING / CONFIRMATION. The discrepancy sub-flow
 * (PRESENTATION → DISCREPANCY → ACCEPTANCE) is driven by
 * `recordDiscrepancies`, `waiveDiscrepancy`, and `acceptLc`.
 *
 * All DB calls are try/catch-wrapped with safe defaults so the engine never
 * throws synchronously into API routes.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ §3 Constants ============

export const LC_LIFECYCLE_STEPS = [
  "APPLICATION",
  "ISSUANCE",
  "ADVISING",
  "CONFIRMATION",
  "AMENDMENT",
  "PRESENTATION",
  "DISCREPANCY",
  "ACCEPTANCE",
  "PAYMENT",
  "REIMBURSEMENT",
] as const;

export const LC_LIFECYCLE_STATUSES = [
  "PENDING",
  "IN_PROGRESS",
  "COMPLETED",
  "REJECTED",
  "DISCREPANT",
] as const;

/** Steps from which the AMENDMENT side-step may be triggered. */
const AMENDMENT_ENTRY_STEPS = new Set([
  "ISSUANCE",
  "ADVISING",
  "CONFIRMATION",
]);

// ============ Types ============

export interface CreateLcInput {
  ustn?: string;
  tradeId?: string;
  /** Link to existing LetterOfCredit.id */
  lcId?: string;
  /** Link to existing LetterOfCredit.lcNumber */
  lcNumber?: string;
  applicantGtid?: string;
  beneficiaryGtid?: string;
  issuingBankGtid?: string;
  advisingBankGtid?: string;
  confirmingBankGtid?: string;
  presentationBankGtid?: string;
  notes?: string;
}

export interface StepData {
  actor?: string;
  notes?: string;
  /** Optional override for the next step (must still be the canonical next). */
  forceStep?: string;
  presentationDate?: Date;
  presentationBankGtid?: string;
}

export interface LcLifecycleRecord {
  id: string;
  ustn?: string | null;
  tradeId?: string | null;
  lcId?: string | null;
  lcNumber?: string | null;
  currentStep: string;
  status: string;
  stepHistory?: string | null;
  presentationDate?: Date | null;
  presentationBankGtid?: string | null;
  discrepancies?: string | null;
  discrepancyCount: number;
  paymentAmountUsd?: number | null;
  paymentDate?: Date | null;
  reimbursementAmountUsd?: number | null;
  reimbursementDate?: Date | null;
  applicantGtid?: string | null;
  beneficiaryGtid?: string | null;
  issuingBankGtid?: string | null;
  advisingBankGtid?: string | null;
  confirmingBankGtid?: string | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LcProgress {
  currentStep: string;
  completedSteps: number;
  totalSteps: number;
  progressPct: number;
  isDiscrepant: boolean;
}

// ============ §3.0 Pure helpers ============

function isValidStep(step?: string | null): step is (typeof LC_LIFECYCLE_STEPS)[number] {
  return !!step && (LC_LIFECYCLE_STEPS as readonly string[]).includes(step);
}

function isValidStatus(s?: string | null): boolean {
  return !!s && (LC_LIFECYCLE_STATUSES as readonly string[]).includes(s);
}

function stepIndex(step: string): number {
  return LC_LIFECYCLE_STEPS.indexOf(step as any);
}

function nextStepAfter(step: string): string | null {
  const idx = stepIndex(step);
  if (idx < 0) return null;
  if (idx >= LC_LIFECYCLE_STEPS.length - 1) return null;
  return LC_LIFECYCLE_STEPS[idx + 1];
}

function parseHistory(raw: unknown): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseDiscrepancies(raw: unknown): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function appendHistoryEntry(
  history: any[],
  entry: { step: string; status?: string; at: string; actor?: string; notes?: string },
): any[] {
  return [
    ...history,
    {
      step: entry.step,
      status: entry.status || null,
      at: entry.at,
      actor: entry.actor || null,
      notes: entry.notes || null,
    },
  ];
}

/**
 * Validate a transition from `currentStep` to `targetStep`. Returns
 * `{ ok: true }` if the target is the canonical next step in the 10-step
 * sequence, or `{ ok: false, error }` otherwise.
 *
 * Side-step transitions (AMENDMENT via `amendLc`, DISCREPANCY via
 * `recordDiscrepancies`, ACCEPTANCE via `acceptLc`, PAYMENT via `payLc`,
 * REIMBURSEMENT via `reimburseLc`) are validated by their own functions —
 * `advanceLcStep` only allows the canonical forward step.
 */
function validateAdvance(
  currentStep: string,
  targetStep: string,
): { ok: boolean; error?: string } {
  if (!isValidStep(currentStep)) {
    return { ok: false, error: `Invalid currentStep: ${currentStep}` };
  }
  if (!isValidStep(targetStep)) {
    return { ok: false, error: `Invalid targetStep: ${targetStep}` };
  }
  const next = nextStepAfter(currentStep);
  if (!next) {
    return {
      ok: false,
      error: `Cannot advance past terminal step ${currentStep}`,
    };
  }
  if (targetStep !== next) {
    return {
      ok: false,
      error: `Cannot advance from ${currentStep} to ${targetStep}; the canonical next step is ${next}`,
    };
  }
  return { ok: true };
}

// ============ §3.1 createLcLifecycle ============

/**
 * Create a new LcLifecycle row linked to an existing LetterOfCredit (via
 * `lcId` or `lcNumber`). The lifecycle starts at `currentStep=APPLICATION`
 * and `status=PENDING`. If `lcNumber` is provided without `lcId`, the
 * LetterOfCredit row is looked up to resolve `lcId` + populate parties
 * (applicant/beneficiary/issuing/advising/confirming bank GTIDs).
 */
export async function createLcLifecycle(
  input: CreateLcInput,
): Promise<LcLifecycleRecord> {
  if (!input) {
    throw new Error("input is required");
  }
  if (!input.lcId && !input.lcNumber) {
    throw new Error("Either lcId or lcNumber is required to link the lifecycle to a LetterOfCredit");
  }

  // Try to enrich from the existing LetterOfCredit row.
  let lc: any = null;
  if (input.lcId || input.lcNumber) {
    try {
      if (input.lcId) {
        lc = await db.letterOfCredit.findUnique({ where: { id: input.lcId } });
      }
      if (!lc && input.lcNumber) {
        lc = await db.letterOfCredit.findUnique({
          where: { lcNumber: input.lcNumber },
        });
      }
    } catch (err) {
      logger.error("[lc-engine] createLcLifecycle — LetterOfCredit lookup failed", {
        error: String(err),
        lcId: input.lcId,
        lcNumber: input.lcNumber,
      });
      // continue — caller may have provided the link fields directly
    }
  }

  const lcId = input.lcId || lc?.id || null;
  const lcNumber = input.lcNumber || lc?.lcNumber || null;
  const ustn = input.ustn || lc?.ustn || null;
  const tradeId = input.tradeId || lc?.tradeId || null;
  const applicantGtid = input.applicantGtid || lc?.applicantGtid || null;
  const beneficiaryGtid = input.beneficiaryGtid || lc?.beneficiaryGtid || null;
  const issuingBankGtid = input.issuingBankGtid || lc?.issuingBankGtid || null;
  const advisingBankGtid = input.advisingBankGtid || lc?.advisingBankGtid || null;
  const confirmingBankGtid =
    input.confirmingBankGtid || lc?.confirmingBankGtid || null;

  const now = new Date().toISOString();
  const stepHistory = appendHistoryEntry([], {
    step: "APPLICATION",
    status: "PENDING",
    at: now,
    notes: "LC lifecycle created",
  });

  const data: any = {
    ustn,
    tradeId,
    lcId,
    lcNumber,
    currentStep: "APPLICATION",
    status: "PENDING",
    stepHistory: JSON.stringify(stepHistory),
    discrepancyCount: 0,
    applicantGtid,
    beneficiaryGtid,
    issuingBankGtid,
    advisingBankGtid,
    confirmingBankGtid,
    presentationBankGtid: input.presentationBankGtid || null,
    notes: input.notes || null,
  };

  try {
    const row = await db.lcLifecycle.create({ data });
    logger.info("[lc-engine] lifecycle created", {
      id: row.id,
      lcNumber,
      ustn,
    });
    return row as LcLifecycleRecord;
  } catch (err) {
    logger.error("[lc-engine] createLcLifecycle DB error", {
      error: String(err),
      lcId,
      lcNumber,
    });
    throw err;
  }
}

// ============ §3.2 advanceLcStep ============

/**
 * Advance the lifecycle to the canonical next step in the 10-step sequence.
 * Validates the step sequence and records an entry in `stepHistory`.
 *
 * For side-step transitions, use the dedicated functions:
 *   - `amendLc`               — ISSUANCE/ADVISING/CONFIRMATION → AMENDMENT
 *   - `recordDiscrepancies`   — PRESENTATION → DISCREPANCY (or ACCEPTANCE)
 *   - `acceptLc`              — DISCREPANCY → ACCEPTANCE
 *   - `payLc`                 — ACCEPTANCE → PAYMENT
 *   - `reimburseLc`           — PAYMENT → REIMBURSEMENT
 *
 * `advanceLcStep` is the generic driver for the remaining transitions
 * (APPLICATION→ISSUANCE, ISSUANCE→ADVISING, ADVISING→CONFIRMATION,
 * CONFIRMATION/AMENDMENT→PRESENTATION, PRESENTATION→DISCREPANCY,
 * DISCREPANCY→ACCEPTANCE, ACCEPTANCE→PAYMENT, PAYMENT→REIMBURSEMENT).
 */
export async function advanceLcStep(
  lifecycleId: string,
  stepData?: StepData,
): Promise<LcLifecycleRecord> {
  if (!lifecycleId) {
    throw new Error("lifecycleId is required");
  }

  let row: any = null;
  try {
    row = await db.lcLifecycle.findUnique({ where: { id: lifecycleId } });
  } catch (err) {
    logger.error("[lc-engine] advanceLcStep lookup failed", {
      error: String(err),
      lifecycleId,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`LcLifecycle not found: ${lifecycleId}`);
  }

  const currentStep = row.currentStep;
  const targetStep =
    stepData?.forceStep || nextStepAfter(currentStep) || "";
  const v = validateAdvance(currentStep, targetStep);
  if (!v.ok) {
    throw new Error(v.error || "Invalid step transition");
  }

  const history = parseHistory(row.stepHistory);
  const updatedHistory = appendHistoryEntry(history, {
    step: targetStep,
    status: row.status,
    at: new Date().toISOString(),
    actor: stepData?.actor,
    notes: stepData?.notes,
  });

  const updateData: any = {
    currentStep: targetStep,
    stepHistory: JSON.stringify(updatedHistory),
    status: "IN_PROGRESS",
  };
  if (targetStep === "PRESENTATION") {
    if (stepData?.presentationDate) {
      updateData.presentationDate = stepData.presentationDate;
    } else {
      updateData.presentationDate = new Date();
    }
    if (stepData?.presentationBankGtid) {
      updateData.presentationBankGtid = stepData.presentationBankGtid;
    }
  }
  if (targetStep === "REIMBURSEMENT") {
    // Reaching REIMBURSEMENT means the lifecycle is COMPLETED (per spec).
    updateData.status = "COMPLETED";
  }

  try {
    const updated = await db.lcLifecycle.update({
      where: { id: lifecycleId },
      data: updateData,
    });
    logger.info("[lc-engine] step advanced", {
      id: lifecycleId,
      from: currentStep,
      to: targetStep,
    });
    return updated as LcLifecycleRecord;
  } catch (err) {
    logger.error("[lc-engine] advanceLcStep DB error", {
      error: String(err),
      id: lifecycleId,
      targetStep,
    });
    throw err;
  }
}

// ============ §3.3 getLcLifecycle ============

/** Fetch an LcLifecycle by its database id. Null-safe. */
export async function getLcLifecycle(
  id: string,
): Promise<LcLifecycleRecord | null> {
  if (!id) return null;
  try {
    const row = await db.lcLifecycle.findUnique({ where: { id } });
    return (row as LcLifecycleRecord) || null;
  } catch (err) {
    logger.error("[lc-engine] getLcLifecycle failed", {
      error: String(err),
      id,
    });
    return null;
  }
}

// ============ §3.4 getLcLifecycleByLcNumber ============

/** Fetch the most recent LcLifecycle for a given L/C number. Null-safe. */
export async function getLcLifecycleByLcNumber(
  lcNumber: string,
): Promise<LcLifecycleRecord | null> {
  if (!lcNumber) return null;
  try {
    const rows = await db.lcLifecycle.findMany({
      where: { lcNumber },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    if (!rows || rows.length === 0) return null;
    return rows[0] as LcLifecycleRecord;
  } catch (err) {
    logger.error("[lc-engine] getLcLifecycleByLcNumber failed", {
      error: String(err),
      lcNumber,
    });
    return null;
  }
}

// ============ §3.5 listLcLifecycles ============

/** List LcLifecycles with optional filters. Ordered by createdAt desc. */
export async function listLcLifecycles(
  filters?: {
    ustn?: string;
    currentStep?: string;
    status?: string;
  },
): Promise<LcLifecycleRecord[]> {
  const where: any = {};
  if (filters?.ustn) where.ustn = filters.ustn;
  if (filters?.currentStep) where.currentStep = filters.currentStep;
  if (filters?.status) where.status = filters.status;

  try {
    const rows = await db.lcLifecycle.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    return (rows as LcLifecycleRecord[]) || [];
  } catch (err) {
    logger.error("[lc-engine] listLcLifecycles failed", {
      error: String(err),
      filters,
    });
    return [];
  }
}

// ============ §3.6 recordDiscrepancies ============

/**
 * Record discrepancies found during PRESENTATION. The lifecycle moves to
 * the DISCREPANCY step. If any discrepancies are present, currentStep stays
 * at DISCREPANCY and status becomes DISCREPANT. If no discrepancies are
 * present, the lifecycle advances to ACCEPTANCE (clean presentation).
 */
export async function recordDiscrepancies(
  lifecycleId: string,
  discrepancies: any[],
): Promise<LcLifecycleRecord> {
  if (!lifecycleId) {
    throw new Error("lifecycleId is required");
  }
  const discs = Array.isArray(discrepancies) ? discrepancies : [];

  let row: any = null;
  try {
    row = await db.lcLifecycle.findUnique({ where: { id: lifecycleId } });
  } catch (err) {
    logger.error("[lc-engine] recordDiscrepancies lookup failed", {
      error: String(err),
      lifecycleId,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`LcLifecycle not found: ${lifecycleId}`);
  }

  const history = parseHistory(row.stepHistory);
  const nowIso = new Date().toISOString();

  // No discrepancies → clean presentation → advance to ACCEPTANCE.
  if (discs.length === 0) {
    const updatedHistory = appendHistoryEntry(history, {
      step: "ACCEPTANCE",
      status: "IN_PROGRESS",
      at: nowIso,
      notes: "Clean presentation — no discrepancies found",
    });
    try {
      const updated = await db.lcLifecycle.update({
        where: { id: lifecycleId },
        data: {
          currentStep: "ACCEPTANCE",
          status: "IN_PROGRESS",
          discrepancies: JSON.stringify([]),
          discrepancyCount: 0,
          stepHistory: JSON.stringify(updatedHistory),
        },
      });
      logger.info("[lc-engine] clean presentation → ACCEPTANCE", {
        id: lifecycleId,
      });
      return updated as LcLifecycleRecord;
    } catch (err) {
      logger.error("[lc-engine] recordDiscrepancies (clean) DB error", {
        error: String(err),
        id: lifecycleId,
      });
      throw err;
    }
  }

  // Discrepancies present → move to DISCREPANCY step, status DISCREPANT.
  const stampedDiscs = discs.map((d, i) => ({
    index: i,
    type: d?.type || "UNKNOWN",
    description: d?.description || "",
    severity: d?.severity || "MAJOR",
    status: "OPEN",
    raisedAt: nowIso,
    valueA: d?.valueA ?? null,
    valueB: d?.valueB ?? null,
  }));

  const updatedHistory = appendHistoryEntry(history, {
    step: "DISCREPANCY",
    status: "DISCREPANT",
    at: nowIso,
    notes: `${stampedDiscs.length} discrepancy(ies) recorded during presentation`,
  });

  try {
    const updated = await db.lcLifecycle.update({
      where: { id: lifecycleId },
      data: {
        currentStep: "DISCREPANCY",
        status: "DISCREPANT",
        discrepancies: JSON.stringify(stampedDiscs),
        discrepancyCount: stampedDiscs.length,
        stepHistory: JSON.stringify(updatedHistory),
      },
    });
    logger.info("[lc-engine] discrepancies recorded", {
      id: lifecycleId,
      count: stampedDiscs.length,
    });
    return updated as LcLifecycleRecord;
  } catch (err) {
    logger.error("[lc-engine] recordDiscrepancies DB error", {
      error: String(err),
      id: lifecycleId,
    });
    throw err;
  }
}

// ============ §3.7 waiveDiscrepancy ============

/**
 * Waive a discrepancy (the applicant accepts the discrepancy). The
 * discrepancy at the given index is marked `status: WAIVED` with `waivedBy`.
 * The currentStep stays at DISCREPANCY until the caller explicitly invokes
 * `acceptLc`.
 */
export async function waiveDiscrepancy(
  lifecycleId: string,
  discrepancyIndex: number,
  waivedBy: string,
): Promise<LcLifecycleRecord> {
  if (!lifecycleId) {
    throw new Error("lifecycleId is required");
  }
  if (discrepancyIndex == null || isNaN(Number(discrepancyIndex))) {
    throw new Error("discrepancyIndex is required and must be a number");
  }
  if (!waivedBy) {
    throw new Error("waivedBy is required");
  }

  let row: any = null;
  try {
    row = await db.lcLifecycle.findUnique({ where: { id: lifecycleId } });
  } catch (err) {
    logger.error("[lc-engine] waiveDiscrepancy lookup failed", {
      error: String(err),
      lifecycleId,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`LcLifecycle not found: ${lifecycleId}`);
  }

  const discs = parseDiscrepancies(row.discrepancies);
  if (discrepancyIndex < 0 || discrepancyIndex >= discs.length) {
    throw new Error(
      `discrepancyIndex ${discrepancyIndex} out of range (0..${discs.length - 1})`,
    );
  }

  const nowIso = new Date().toISOString();
  discs[discrepancyIndex] = {
    ...discs[discrepancyIndex],
    status: "WAIVED",
    waivedBy,
    waivedAt: nowIso,
  };

  const history = parseHistory(row.stepHistory);
  const updatedHistory = appendHistoryEntry(history, {
    step: "DISCREPANCY",
    status: "DISCREPANT",
    at: nowIso,
    actor: waivedBy,
    notes: `Discrepancy #${discrepancyIndex} waived`,
  });

  try {
    const updated = await db.lcLifecycle.update({
      where: { id: lifecycleId },
      data: {
        discrepancies: JSON.stringify(discs),
        stepHistory: JSON.stringify(updatedHistory),
      },
    });
    logger.info("[lc-engine] discrepancy waived", {
      id: lifecycleId,
      index: discrepancyIndex,
      waivedBy,
    });
    return updated as LcLifecycleRecord;
  } catch (err) {
    logger.error("[lc-engine] waiveDiscrepancy DB error", {
      error: String(err),
      id: lifecycleId,
    });
    throw err;
  }
}

// ============ §3.8 acceptLc ============

/**
 * Move from DISCREPANCY → ACCEPTANCE. All discrepancies must be resolved
 * (status `WAIVED` or `RESOLVED`); any remaining `OPEN` discrepancies
 * block acceptance.
 */
export async function acceptLc(
  lifecycleId: string,
): Promise<LcLifecycleRecord> {
  if (!lifecycleId) {
    throw new Error("lifecycleId is required");
  }

  let row: any = null;
  try {
    row = await db.lcLifecycle.findUnique({ where: { id: lifecycleId } });
  } catch (err) {
    logger.error("[lc-engine] acceptLc lookup failed", {
      error: String(err),
      lifecycleId,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`LcLifecycle not found: ${lifecycleId}`);
  }
  if (row.currentStep !== "DISCREPANCY") {
    throw new Error(
      `acceptLc requires currentStep=DISCREPANCY (current: ${row.currentStep})`,
    );
  }

  const discs = parseDiscrepancies(row.discrepancies);
  const openDiscs = discs.filter(
    (d) => !d?.status || d.status === "OPEN",
  );
  if (openDiscs.length > 0) {
    throw new Error(
      `Cannot accept LC: ${openDiscs.length} open discrepancy(ies) remain. Waive or resolve them first.`,
    );
  }

  const history = parseHistory(row.stepHistory);
  const updatedHistory = appendHistoryEntry(history, {
    step: "ACCEPTANCE",
    status: "IN_PROGRESS",
    at: new Date().toISOString(),
    notes: "All discrepancies resolved/waived — documents accepted",
  });

  try {
    const updated = await db.lcLifecycle.update({
      where: { id: lifecycleId },
      data: {
        currentStep: "ACCEPTANCE",
        status: "IN_PROGRESS",
        stepHistory: JSON.stringify(updatedHistory),
      },
    });
    logger.info("[lc-engine] LC accepted", { id: lifecycleId });
    return updated as LcLifecycleRecord;
  } catch (err) {
    logger.error("[lc-engine] acceptLc DB error", {
      error: String(err),
      id: lifecycleId,
    });
    throw err;
  }
}

// ============ §3.9 payLc ============

/**
 * Move from ACCEPTANCE → PAYMENT. Sets `paymentAmountUsd` + `paymentDate`.
 * The lifecycle status becomes `IN_PROGRESS` (final COMPLETED is reached at
 * REIMBURSEMENT).
 */
export async function payLc(
  lifecycleId: string,
  amountUsd: number,
): Promise<LcLifecycleRecord> {
  if (!lifecycleId) {
    throw new Error("lifecycleId is required");
  }
  const amt = Number(amountUsd);
  if (isNaN(amt) || amt <= 0) {
    throw new Error("amountUsd must be > 0");
  }

  let row: any = null;
  try {
    row = await db.lcLifecycle.findUnique({ where: { id: lifecycleId } });
  } catch (err) {
    logger.error("[lc-engine] payLc lookup failed", {
      error: String(err),
      lifecycleId,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`LcLifecycle not found: ${lifecycleId}`);
  }
  if (row.currentStep !== "ACCEPTANCE") {
    throw new Error(
      `payLc requires currentStep=ACCEPTANCE (current: ${row.currentStep})`,
    );
  }

  const history = parseHistory(row.stepHistory);
  const now = new Date();
  const updatedHistory = appendHistoryEntry(history, {
    step: "PAYMENT",
    status: "IN_PROGRESS",
    at: now.toISOString(),
    notes: `Payment of $${amt.toFixed(2)} released by issuing bank`,
  });

  try {
    const updated = await db.lcLifecycle.update({
      where: { id: lifecycleId },
      data: {
        currentStep: "PAYMENT",
        status: "IN_PROGRESS",
        paymentAmountUsd: +amt.toFixed(2),
        paymentDate: now,
        stepHistory: JSON.stringify(updatedHistory),
      },
    });
    logger.info("[lc-engine] LC paid", { id: lifecycleId, amountUsd: amt });
    return updated as LcLifecycleRecord;
  } catch (err) {
    logger.error("[lc-engine] payLc DB error", {
      error: String(err),
      id: lifecycleId,
    });
    throw err;
  }
}

// ============ §3.10 reimburseLc ============

/**
 * Move from PAYMENT → REIMBURSEMENT. Sets `reimbursementAmountUsd` +
 * `reimbursementDate`. The lifecycle status becomes `COMPLETED`.
 */
export async function reimburseLc(
  lifecycleId: string,
  amountUsd: number,
): Promise<LcLifecycleRecord> {
  if (!lifecycleId) {
    throw new Error("lifecycleId is required");
  }
  const amt = Number(amountUsd);
  if (isNaN(amt) || amt <= 0) {
    throw new Error("amountUsd must be > 0");
  }

  let row: any = null;
  try {
    row = await db.lcLifecycle.findUnique({ where: { id: lifecycleId } });
  } catch (err) {
    logger.error("[lc-engine] reimburseLc lookup failed", {
      error: String(err),
      lifecycleId,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`LcLifecycle not found: ${lifecycleId}`);
  }
  if (row.currentStep !== "PAYMENT") {
    throw new Error(
      `reimburseLc requires currentStep=PAYMENT (current: ${row.currentStep})`,
    );
  }

  const history = parseHistory(row.stepHistory);
  const now = new Date();
  const updatedHistory = appendHistoryEntry(history, {
    step: "REIMBURSEMENT",
    status: "COMPLETED",
    at: now.toISOString(),
    notes: `Reimbursement of $${amt.toFixed(2)} received from applicant`,
  });

  try {
    const updated = await db.lcLifecycle.update({
      where: { id: lifecycleId },
      data: {
        currentStep: "REIMBURSEMENT",
        status: "COMPLETED",
        reimbursementAmountUsd: +amt.toFixed(2),
        reimbursementDate: now,
        stepHistory: JSON.stringify(updatedHistory),
      },
    });
    logger.info("[lc-engine] LC reimbursed — lifecycle COMPLETED", {
      id: lifecycleId,
      amountUsd: amt,
    });
    return updated as LcLifecycleRecord;
  } catch (err) {
    logger.error("[lc-engine] reimburseLc DB error", {
      error: String(err),
      id: lifecycleId,
    });
    throw err;
  }
}

// ============ §3.11 amendLc ============

/**
 * Trigger the AMENDMENT side-step. Allowed from ISSUANCE, ADVISING, or
 * CONFIRMATION. The lifecycle's `currentStep` is set to `AMENDMENT`, the
 * amendments are recorded in the step history (and in `notes` if a notes
 * field is provided), and the lifecycle remains `IN_PROGRESS`. The caller
 * subsequently invokes `advanceLcStep` to move AMENDMENT → PRESENTATION.
 *
 * The amendments object is stored verbatim in the history entry for audit
 * purposes (the underlying `LetterOfCredit` row is NOT modified — that is
 * the responsibility of the existing LC admin workflow).
 */
export async function amendLc(
  lifecycleId: string,
  amendments: any,
): Promise<LcLifecycleRecord> {
  if (!lifecycleId) {
    throw new Error("lifecycleId is required");
  }

  let row: any = null;
  try {
    row = await db.lcLifecycle.findUnique({ where: { id: lifecycleId } });
  } catch (err) {
    logger.error("[lc-engine] amendLc lookup failed", {
      error: String(err),
      lifecycleId,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`LcLifecycle not found: ${lifecycleId}`);
  }

  if (!AMENDMENT_ENTRY_STEPS.has(row.currentStep)) {
    throw new Error(
      `amendLc can only be triggered from ISSUANCE / ADVISING / CONFIRMATION (current: ${row.currentStep})`,
    );
  }

  const history = parseHistory(row.stepHistory);
  const nowIso = new Date().toISOString();
  const amendmentSummary = amendments?.summary || `Amendment recorded at ${nowIso}`;
  const updatedHistory = appendHistoryEntry(history, {
    step: "AMENDMENT",
    status: "IN_PROGRESS",
    at: nowIso,
    notes: amendmentSummary,
    amendments: amendments || null,
  });

  const updateData: any = {
    currentStep: "AMENDMENT",
    status: "IN_PROGRESS",
    stepHistory: JSON.stringify(updatedHistory),
  };
  if (amendments?.notes) {
    updateData.notes = amendments.notes;
  }

  try {
    const updated = await db.lcLifecycle.update({
      where: { id: lifecycleId },
      data: updateData,
    });
    logger.info("[lc-engine] LC amended", {
      id: lifecycleId,
      from: row.currentStep,
    });
    return updated as LcLifecycleRecord;
  } catch (err) {
    logger.error("[lc-engine] amendLc DB error", {
      error: String(err),
      id: lifecycleId,
    });
    throw err;
  }
}

// ============ §3.12 getLcProgress ============

/**
 * Progress summary for an LC lifecycle.
 *   totalSteps    = 10
 *   completedSteps = stepIndex(currentStep)  (REIMBURSEMENT = 9 → 9/10 = 90%,
 *                   because at that point the lifecycle is COMPLETED; the
 *                   terminal step counts as completed)
 *   progressPct   = completedSteps / totalSteps * 100, clamped to [0, 100]
 *   isDiscrepant  = true if status === DISCREPANT OR any OPEN discrepancy
 */
export async function getLcProgress(
  lifecycleId: string,
): Promise<LcProgress> {
  const empty: LcProgress = {
    currentStep: "APPLICATION",
    completedSteps: 0,
    totalSteps: LC_LIFECYCLE_STEPS.length,
    progressPct: 0,
    isDiscrepant: false,
  };
  if (!lifecycleId) return empty;

  let row: any = null;
  try {
    row = await db.lcLifecycle.findUnique({ where: { id: lifecycleId } });
  } catch (err) {
    logger.error("[lc-engine] getLcProgress lookup failed", {
      error: String(err),
      lifecycleId,
    });
    return empty;
  }
  if (!row) return empty;

  const idx = stepIndex(row.currentStep);
  const totalSteps = LC_LIFECYCLE_STEPS.length;
  // If at REIMBURSEMENT (last step) and COMPLETED, count all 10 steps as done.
  let completedSteps = idx < 0 ? 0 : idx;
  if (
    row.currentStep === "REIMBURSEMENT" &&
    row.status === "COMPLETED"
  ) {
    completedSteps = totalSteps;
  }
  const progressPct =
    totalSteps > 0
      ? Math.round((completedSteps / totalSteps) * 1000) / 10
      : 0;

  const discs = parseDiscrepancies(row.discrepancies);
  const hasOpen = discs.some((d) => !d?.status || d.status === "OPEN");

  return {
    currentStep: row.currentStep,
    completedSteps,
    totalSteps,
    progressPct: Math.min(100, Math.max(0, progressPct)),
    isDiscrepant: row.status === "DISCREPANT" || hasOpen,
  };
}

// ============ Module exports ============
// All exports are named — no default export (matches existing SGTX lib
// convention, avoids `import/no-anonymous-default-export` warning).

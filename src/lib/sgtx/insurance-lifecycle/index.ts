// @ts-nocheck
/**
 * SGTX Phase 6 — §6 Insurance Lifecycle Engine
 * ===========================================================================
 *
 * Implements the 10-step insurance lifecycle on top of the existing
 * `InsurancePolicy` (prisma schema line 4974) and `InsuranceClaim` (line
 * 2865) models. The new `InsuranceLifecycle` row (line 6609) is the lifecycle
 * tracker; it links to the legacy models via `policyId` + `claimId`.
 *
 * 10 lifecycle steps (§6):
 *
 *   QUOTE         — initial quote request (status: DRAFT)
 *   BIND          — policy bound to the insured (status: ACTIVE)
 *   CERTIFICATE   — insurance certificate issued
 *   ENDORSEMENT   — endorsement(s) added (can repeat)
 *   INCIDENT      — loss / incident reported (status: INCIDENT)
 *   CLAIM         — formal claim filed (status: CLAIMED)
 *   SURVEY        — surveyor assigned + survey conducted
 *   SETTLEMENT    — claim settled (status: SETTLED)
 *   RECOVERY      — subrogation / recovery action (status: RECOVERED)
 *   CLOSE         — lifecycle closed (status: CLOSED)
 *
 * Sequence is enforced by `advanceInsuranceStep`. Side-step transitions
 * (BIND via `bindPolicy`, CERTIFICATE via `issueCertificate`, INCIDENT via
 * `reportIncident`, CLAIM via `fileClaim`, SURVEY via `scheduleSurvey`,
 * SETTLEMENT via `settleClaim`, RECOVERY via `recordRecovery`, CLOSE via
 * `closeLifecycle`) are validated by their own functions. ENDORSEMENT is
 * reachable via `addEndorsement` from CERTIFICATE (and can repeat).
 *
 * All DB calls are try/catch-wrapped with safe defaults so the engine
 * never throws synchronously into API routes.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ §6 Constants ============

export const INSURANCE_LIFECYCLE_STEPS = [
  "QUOTE",
  "BIND",
  "CERTIFICATE",
  "ENDORSEMENT",
  "INCIDENT",
  "CLAIM",
  "SURVEY",
  "SETTLEMENT",
  "RECOVERY",
  "CLOSE",
] as const;

export const INSURANCE_LIFECYCLE_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "INCIDENT",
  "CLAIMED",
  "SETTLED",
  "RECOVERED",
  "CLOSED",
  "REJECTED",
] as const;

export const INSURANCE_TYPES = [
  "CARGO",
  "MARINE",
  "LIABILITY",
  "PRODUCT",
  "TRADE_CREDIT",
] as const;

// ============ Types ============

export interface CreateInsuranceInput {
  ustn?: string;
  tradeId?: string;
  insuranceType: string;
  insurerGtid?: string;
  insuredGtid: string;
  coverageAmountUsd: number;
  premiumUsd: number;
  currency?: string;
  policyId?: string; // link to existing InsurancePolicy
  claimId?: string; // link to existing InsuranceClaim
  policyNumber?: string;
  certificateNumber?: string;
  notes?: string;
}

export interface InsuranceLifecycleRecord {
  id: string;
  ustn?: string | null;
  tradeId?: string | null;
  policyId?: string | null;
  claimId?: string | null;
  insuranceType: string;
  insurerGtid?: string | null;
  insuredGtid: string;
  coverageAmountUsd: number;
  premiumUsd: number;
  currency: string;
  currentStep: string;
  status: string;
  stepHistory?: string | null;
  incidentDate?: Date | null;
  incidentDescription?: string | null;
  claimAmountUsd?: number | null;
  claimDate?: Date | null;
  surveyorGtid?: string | null;
  surveyDate?: Date | null;
  surveyResult?: string | null;
  settlementAmountUsd?: number | null;
  settlementDate?: Date | null;
  recoveryAmountUsd?: number | null;
  recoveryDate?: Date | null;
  policyNumber?: string | null;
  certificateNumber?: string | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsuranceProgress {
  currentStep: string;
  completedSteps: number;
  totalSteps: number;
  progressPct: number;
}

// ============ §6.0 Pure helpers ============

function isValidStep(step?: string | null): boolean {
  return !!step && (INSURANCE_LIFECYCLE_STEPS as readonly string[]).includes(step);
}

function isValidStatus(s?: string | null): boolean {
  return !!s && (INSURANCE_LIFECYCLE_STATUSES as readonly string[]).includes(s);
}

function isValidInsuranceType(t?: string | null): boolean {
  return !!t && (INSURANCE_TYPES as readonly string[]).includes(t);
}

function stepIndex(step: string): number {
  return INSURANCE_LIFECYCLE_STEPS.indexOf(step as any);
}

function nextStepAfter(step: string): string | null {
  const idx = stepIndex(step);
  if (idx < 0) return null;
  if (idx >= INSURANCE_LIFECYCLE_STEPS.length - 1) return null;
  return INSURANCE_LIFECYCLE_STEPS[idx + 1];
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

function appendHistoryEntry(
  history: any[],
  entry: { step: string; status?: string; at: string; actor?: string; notes?: string; extra?: any },
): any[] {
  const e: any = {
    step: entry.step,
    status: entry.status || null,
    at: entry.at,
    actor: entry.actor || null,
    notes: entry.notes || null,
  };
  if (entry.extra) e.extra = entry.extra;
  return [...history, e];
}

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

// ============ §6.1 createInsuranceLifecycle ============

/**
 * Create a new InsuranceLifecycle. Starts at `currentStep=QUOTE` and
 * `status=DRAFT`. Optionally links to an existing InsurancePolicy (via
 * `policyId`) and/or InsuranceClaim (via `claimId`).
 */
export async function createInsuranceLifecycle(
  input: CreateInsuranceInput,
): Promise<InsuranceLifecycleRecord> {
  if (!input) {
    throw new Error("input is required");
  }
  if (!isValidInsuranceType(input.insuranceType)) {
    throw new Error(`Invalid insuranceType: ${input.insuranceType}`);
  }
  if (!input.insuredGtid) {
    throw new Error("insuredGtid is required");
  }
  const coverage = Number(input.coverageAmountUsd);
  if (isNaN(coverage) || coverage <= 0) {
    throw new Error("coverageAmountUsd must be > 0");
  }
  const premium = Number(input.premiumUsd);
  if (isNaN(premium) || premium < 0) {
    throw new Error("premiumUsd must be >= 0");
  }

  // Try to enrich from the linked InsurancePolicy if policyId provided.
  let policy: any = null;
  if (input.policyId) {
    try {
      policy = await db.insurancePolicy.findUnique({
        where: { id: input.policyId },
      });
    } catch (err) {
      logger.error("[insurance-lifecycle] InsurancePolicy lookup failed", {
        error: String(err),
        policyId: input.policyId,
      });
    }
  }

  const data: any = {
    ustn: input.ustn || policy?.ustn || null,
    tradeId: input.tradeId || null,
    policyId: input.policyId || null,
    claimId: input.claimId || null,
    insuranceType: input.insuranceType,
    insurerGtid:
      input.insurerGtid || policy?.providerId || null,
    insuredGtid: input.insuredGtid,
    coverageAmountUsd: +coverage.toFixed(2),
    premiumUsd: +premium.toFixed(2),
    currency: input.currency || policy?.currency || "USD",
    currentStep: "QUOTE",
    status: "DRAFT",
    stepHistory: JSON.stringify(
      appendHistoryEntry([], {
        step: "QUOTE",
        status: "DRAFT",
        at: new Date().toISOString(),
        notes: "Insurance lifecycle created",
      }),
    ),
    policyNumber: input.policyNumber || policy?.policyNumber || null,
    certificateNumber: input.certificateNumber || null,
    notes: input.notes || null,
  };

  try {
    const row = await db.insuranceLifecycle.create({ data });
    logger.info("[insurance-lifecycle] lifecycle created (QUOTE/DRAFT)", {
      id: row.id,
      insuranceType: input.insuranceType,
      insuredGtid: input.insuredGtid,
      coverageAmountUsd: coverage,
    });
    return row as InsuranceLifecycleRecord;
  } catch (err) {
    logger.error("[insurance-lifecycle] createInsuranceLifecycle DB error", {
      error: String(err),
      insuranceType: input.insuranceType,
    });
    throw err;
  }
}

// ============ §6.2 advanceInsuranceStep ============

/**
 * Advance the lifecycle to the canonical next step in the 10-step sequence.
 * Validates the step sequence and records an entry in `stepHistory`.
 *
 * For side-step transitions, use the dedicated functions:
 *   - `bindPolicy`           — QUOTE → BIND
 *   - `issueCertificate`     — BIND → CERTIFICATE
 *   - `addEndorsement`       — CERTIFICATE → ENDORSEMENT (repeatable)
 *   - `reportIncident`       — ENDORSEMENT → INCIDENT
 *   - `fileClaim`            — INCIDENT → CLAIM
 *   - `scheduleSurvey`       — CLAIM → SURVEY
 *   - `settleClaim`          — SURVEY → SETTLEMENT
 *   - `recordRecovery`       — SETTLEMENT → RECOVERY
 *   - `closeLifecycle`       — RECOVERY → CLOSE
 *
 * `advanceInsuranceStep` is the generic driver for the remaining canonical
 * transitions.
 */
export async function advanceInsuranceStep(
  lifecycleId: string,
  stepData?: any,
): Promise<InsuranceLifecycleRecord> {
  if (!lifecycleId) {
    throw new Error("lifecycleId is required");
  }

  let row: any = null;
  try {
    row = await db.insuranceLifecycle.findUnique({
      where: { id: lifecycleId },
    });
  } catch (err) {
    logger.error("[insurance-lifecycle] advanceInsuranceStep lookup failed", {
      error: String(err),
      lifecycleId,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`InsuranceLifecycle not found: ${lifecycleId}`);
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
  };
  if (targetStep === "CLOSE") {
    updateData.status = "CLOSED";
  }

  try {
    const updated = await db.insuranceLifecycle.update({
      where: { id: lifecycleId },
      data: updateData,
    });
    logger.info("[insurance-lifecycle] step advanced", {
      id: lifecycleId,
      from: currentStep,
      to: targetStep,
    });
    return updated as InsuranceLifecycleRecord;
  } catch (err) {
    logger.error("[insurance-lifecycle] advanceInsuranceStep DB error", {
      error: String(err),
      id: lifecycleId,
      targetStep,
    });
    throw err;
  }
}

// ============ §6.3 getInsuranceLifecycle ============

/** Fetch an InsuranceLifecycle by its database id. Null-safe. */
export async function getInsuranceLifecycle(
  id: string,
): Promise<InsuranceLifecycleRecord | null> {
  if (!id) return null;
  try {
    const row = await db.insuranceLifecycle.findUnique({ where: { id } });
    return (row as InsuranceLifecycleRecord) || null;
  } catch (err) {
    logger.error("[insurance-lifecycle] getInsuranceLifecycle failed", {
      error: String(err),
      id,
    });
    return null;
  }
}

// ============ §6.4 listInsuranceLifecycles ============

/** List InsuranceLifecycles with optional filters. Ordered by createdAt desc. */
export async function listInsuranceLifecycles(
  filters?: {
    ustn?: string;
    insuranceType?: string;
    currentStep?: string;
    status?: string;
    insurerGtid?: string;
  },
): Promise<InsuranceLifecycleRecord[]> {
  const where: any = {};
  if (filters?.ustn) where.ustn = filters.ustn;
  if (filters?.insuranceType) where.insuranceType = filters.insuranceType;
  if (filters?.currentStep) where.currentStep = filters.currentStep;
  if (filters?.status) where.status = filters.status;
  if (filters?.insurerGtid) where.insurerGtid = filters.insurerGtid;

  try {
    const rows = await db.insuranceLifecycle.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    return (rows as InsuranceLifecycleRecord[]) || [];
  } catch (err) {
    logger.error("[insurance-lifecycle] listInsuranceLifecycles failed", {
      error: String(err),
      filters,
    });
    return [];
  }
}

// ============ §6.5 bindPolicy ============

/**
 * QUOTE → BIND. Sets `policyNumber` + `status=ACTIVE`. The lifecycle is
 * now bound — the policy is in force (subject to its own validity window
 * on the underlying InsurancePolicy row).
 */
export async function bindPolicy(
  lifecycleId: string,
  policyNumber: string,
): Promise<InsuranceLifecycleRecord> {
  if (!lifecycleId) {
    throw new Error("lifecycleId is required");
  }
  if (!policyNumber) {
    throw new Error("policyNumber is required");
  }

  let row: any = null;
  try {
    row = await db.insuranceLifecycle.findUnique({
      where: { id: lifecycleId },
    });
  } catch (err) {
    logger.error("[insurance-lifecycle] bindPolicy lookup failed", {
      error: String(err),
      lifecycleId,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`InsuranceLifecycle not found: ${lifecycleId}`);
  }
  if (row.currentStep !== "QUOTE") {
    throw new Error(
      `bindPolicy requires currentStep=QUOTE (current: ${row.currentStep})`,
    );
  }

  const history = parseHistory(row.stepHistory);
  const updatedHistory = appendHistoryEntry(history, {
    step: "BIND",
    status: "ACTIVE",
    at: new Date().toISOString(),
    notes: `Policy bound — policyNumber ${policyNumber}`,
  });

  try {
    const updated = await db.insuranceLifecycle.update({
      where: { id: lifecycleId },
      data: {
        currentStep: "BIND",
        status: "ACTIVE",
        policyNumber,
        stepHistory: JSON.stringify(updatedHistory),
      },
    });
    logger.info("[insurance-lifecycle] policy bound", {
      id: lifecycleId,
      policyNumber,
    });
    return updated as InsuranceLifecycleRecord;
  } catch (err) {
    logger.error("[insurance-lifecycle] bindPolicy DB error", {
      error: String(err),
      id: lifecycleId,
    });
    throw err;
  }
}

// ============ §6.6 issueCertificate ============

/** BIND → CERTIFICATE. Sets `certificateNumber`. */
export async function issueCertificate(
  lifecycleId: string,
  certificateNumber: string,
): Promise<InsuranceLifecycleRecord> {
  if (!lifecycleId) {
    throw new Error("lifecycleId is required");
  }
  if (!certificateNumber) {
    throw new Error("certificateNumber is required");
  }

  let row: any = null;
  try {
    row = await db.insuranceLifecycle.findUnique({
      where: { id: lifecycleId },
    });
  } catch (err) {
    logger.error("[insurance-lifecycle] issueCertificate lookup failed", {
      error: String(err),
      lifecycleId,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`InsuranceLifecycle not found: ${lifecycleId}`);
  }
  if (row.currentStep !== "BIND") {
    throw new Error(
      `issueCertificate requires currentStep=BIND (current: ${row.currentStep})`,
    );
  }

  const history = parseHistory(row.stepHistory);
  const updatedHistory = appendHistoryEntry(history, {
    step: "CERTIFICATE",
    status: row.status,
    at: new Date().toISOString(),
    notes: `Certificate issued — ${certificateNumber}`,
  });

  try {
    const updated = await db.insuranceLifecycle.update({
      where: { id: lifecycleId },
      data: {
        currentStep: "CERTIFICATE",
        certificateNumber,
        stepHistory: JSON.stringify(updatedHistory),
      },
    });
    logger.info("[insurance-lifecycle] certificate issued", {
      id: lifecycleId,
      certificateNumber,
    });
    return updated as InsuranceLifecycleRecord;
  } catch (err) {
    logger.error("[insurance-lifecycle] issueCertificate DB error", {
      error: String(err),
      id: lifecycleId,
    });
    throw err;
  }
}

// ============ §6.7 addEndorsement ============

/**
 * CERTIFICATE → ENDORSEMENT. Records the endorsement in step history (with
 * the full endorsement object preserved for audit). This step is repeatable
 * — multiple endorsements can be added by re-invoking this function from
 * ENDORSEMENT.
 */
export async function addEndorsement(
  lifecycleId: string,
  endorsement: any,
): Promise<InsuranceLifecycleRecord> {
  if (!lifecycleId) {
    throw new Error("lifecycleId is required");
  }
  if (!endorsement) {
    throw new Error("endorsement is required");
  }

  let row: any = null;
  try {
    row = await db.insuranceLifecycle.findUnique({
      where: { id: lifecycleId },
    });
  } catch (err) {
    logger.error("[insurance-lifecycle] addEndorsement lookup failed", {
      error: String(err),
      lifecycleId,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`InsuranceLifecycle not found: ${lifecycleId}`);
  }
  if (
    row.currentStep !== "CERTIFICATE" &&
    row.currentStep !== "ENDORSEMENT"
  ) {
    throw new Error(
      `addEndorsement requires currentStep=CERTIFICATE or ENDORSEMENT (current: ${row.currentStep})`,
    );
  }

  const history = parseHistory(row.stepHistory);
  const nowIso = new Date().toISOString();
  const endorsementId =
    endorsement.id || `END-${nowIso}-${Math.floor(Math.random() * 100000)}`;
  const updatedHistory = appendHistoryEntry(history, {
    step: "ENDORSEMENT",
    status: row.status,
    at: nowIso,
    notes:
      endorsement.description ||
      endorsement.type ||
      "Endorsement added",
    extra: { endorsementId, endorsement },
  });

  try {
    const updated = await db.insuranceLifecycle.update({
      where: { id: lifecycleId },
      data: {
        currentStep: "ENDORSEMENT",
        stepHistory: JSON.stringify(updatedHistory),
      },
    });
    logger.info("[insurance-lifecycle] endorsement added", {
      id: lifecycleId,
      endorsementId,
    });
    return updated as InsuranceLifecycleRecord;
  } catch (err) {
    logger.error("[insurance-lifecycle] addEndorsement DB error", {
      error: String(err),
      id: lifecycleId,
    });
    throw err;
  }
}

// ============ §6.8 reportIncident ============

/**
 * ENDORSEMENT → INCIDENT. Sets `incidentDate` + `incidentDescription` +
 * `status=INCIDENT`. The lifecycle is now in incident mode — the next step
 * is `fileClaim`.
 */
export async function reportIncident(
  lifecycleId: string,
  incidentDate: Date,
  description: string,
): Promise<InsuranceLifecycleRecord> {
  if (!lifecycleId) {
    throw new Error("lifecycleId is required");
  }
  if (!incidentDate) {
    throw new Error("incidentDate is required");
  }
  if (!description) {
    throw new Error("description is required");
  }

  let row: any = null;
  try {
    row = await db.insuranceLifecycle.findUnique({
      where: { id: lifecycleId },
    });
  } catch (err) {
    logger.error("[insurance-lifecycle] reportIncident lookup failed", {
      error: String(err),
      lifecycleId,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`InsuranceLifecycle not found: ${lifecycleId}`);
  }
  if (row.currentStep !== "ENDORSEMENT") {
    throw new Error(
      `reportIncident requires currentStep=ENDORSEMENT (current: ${row.currentStep})`,
    );
  }

  const history = parseHistory(row.stepHistory);
  const updatedHistory = appendHistoryEntry(history, {
    step: "INCIDENT",
    status: "INCIDENT",
    at: new Date().toISOString(),
    notes: `Incident reported: ${description}`,
  });

  try {
    const updated = await db.insuranceLifecycle.update({
      where: { id: lifecycleId },
      data: {
        currentStep: "INCIDENT",
        status: "INCIDENT",
        incidentDate,
        incidentDescription: description,
        stepHistory: JSON.stringify(updatedHistory),
      },
    });
    logger.info("[insurance-lifecycle] incident reported", {
      id: lifecycleId,
      incidentDate,
    });
    return updated as InsuranceLifecycleRecord;
  } catch (err) {
    logger.error("[insurance-lifecycle] reportIncident DB error", {
      error: String(err),
      id: lifecycleId,
    });
    throw err;
  }
}

// ============ §6.9 fileClaim ============

/**
 * INCIDENT → CLAIM. Sets `claimAmountUsd` + `claimDate` + `status=CLAIMED`.
 */
export async function fileClaim(
  lifecycleId: string,
  claimAmountUsd: number,
): Promise<InsuranceLifecycleRecord> {
  if (!lifecycleId) {
    throw new Error("lifecycleId is required");
  }
  const amt = Number(claimAmountUsd);
  if (isNaN(amt) || amt <= 0) {
    throw new Error("claimAmountUsd must be > 0");
  }

  let row: any = null;
  try {
    row = await db.insuranceLifecycle.findUnique({
      where: { id: lifecycleId },
    });
  } catch (err) {
    logger.error("[insurance-lifecycle] fileClaim lookup failed", {
      error: String(err),
      lifecycleId,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`InsuranceLifecycle not found: ${lifecycleId}`);
  }
  if (row.currentStep !== "INCIDENT") {
    throw new Error(
      `fileClaim requires currentStep=INCIDENT (current: ${row.currentStep})`,
    );
  }
  if (amt > row.coverageAmountUsd + 0.01) {
    throw new Error(
      `claimAmountUsd ${amt} exceeds coverage ${row.coverageAmountUsd}`,
    );
  }

  const history = parseHistory(row.stepHistory);
  const now = new Date();
  const updatedHistory = appendHistoryEntry(history, {
    step: "CLAIM",
    status: "CLAIMED",
    at: now.toISOString(),
    notes: `Claim filed — $${amt.toFixed(2)}`,
  });

  try {
    const updated = await db.insuranceLifecycle.update({
      where: { id: lifecycleId },
      data: {
        currentStep: "CLAIM",
        status: "CLAIMED",
        claimAmountUsd: +amt.toFixed(2),
        claimDate: now,
        stepHistory: JSON.stringify(updatedHistory),
      },
    });
    logger.info("[insurance-lifecycle] claim filed", {
      id: lifecycleId,
      claimAmountUsd: amt,
    });
    return updated as InsuranceLifecycleRecord;
  } catch (err) {
    logger.error("[insurance-lifecycle] fileClaim DB error", {
      error: String(err),
      id: lifecycleId,
    });
    throw err;
  }
}

// ============ §6.10 scheduleSurvey ============

/**
 * CLAIM → SURVEY. Sets `surveyorGtid` + `surveyDate`. The actual survey
 * result is recorded separately via `recordSurveyResult`.
 */
export async function scheduleSurvey(
  lifecycleId: string,
  surveyorGtid: string,
  surveyDate: Date,
): Promise<InsuranceLifecycleRecord> {
  if (!lifecycleId) {
    throw new Error("lifecycleId is required");
  }
  if (!surveyorGtid) {
    throw new Error("surveyorGtid is required");
  }
  if (!surveyDate) {
    throw new Error("surveyDate is required");
  }

  let row: any = null;
  try {
    row = await db.insuranceLifecycle.findUnique({
      where: { id: lifecycleId },
    });
  } catch (err) {
    logger.error("[insurance-lifecycle] scheduleSurvey lookup failed", {
      error: String(err),
      lifecycleId,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`InsuranceLifecycle not found: ${lifecycleId}`);
  }
  if (row.currentStep !== "CLAIM") {
    throw new Error(
      `scheduleSurvey requires currentStep=CLAIM (current: ${row.currentStep})`,
    );
  }

  const history = parseHistory(row.stepHistory);
  const updatedHistory = appendHistoryEntry(history, {
    step: "SURVEY",
    status: row.status,
    at: new Date().toISOString(),
    notes: `Survey scheduled — surveyor ${surveyorGtid}, date ${new Date(surveyDate).toISOString().slice(0, 10)}`,
  });

  try {
    const updated = await db.insuranceLifecycle.update({
      where: { id: lifecycleId },
      data: {
        currentStep: "SURVEY",
        surveyorGtid,
        surveyDate,
        stepHistory: JSON.stringify(updatedHistory),
      },
    });
    logger.info("[insurance-lifecycle] survey scheduled", {
      id: lifecycleId,
      surveyorGtid,
    });
    return updated as InsuranceLifecycleRecord;
  } catch (err) {
    logger.error("[insurance-lifecycle] scheduleSurvey DB error", {
      error: String(err),
      id: lifecycleId,
    });
    throw err;
  }
}

// ============ §6.11 recordSurveyResult ============

/**
 * Record the surveyor's result. Does NOT advance the step — the lifecycle
 * stays at SURVEY until `settleClaim` is invoked. Sets `surveyResult` +
 * appends a step-history entry recording the survey outcome.
 */
export async function recordSurveyResult(
  lifecycleId: string,
  result: string,
): Promise<InsuranceLifecycleRecord> {
  if (!lifecycleId) {
    throw new Error("lifecycleId is required");
  }
  if (!result) {
    throw new Error("result is required");
  }

  let row: any = null;
  try {
    row = await db.insuranceLifecycle.findUnique({
      where: { id: lifecycleId },
    });
  } catch (err) {
    logger.error("[insurance-lifecycle] recordSurveyResult lookup failed", {
      error: String(err),
      lifecycleId,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`InsuranceLifecycle not found: ${lifecycleId}`);
  }
  if (row.currentStep !== "SURVEY") {
    throw new Error(
      `recordSurveyResult requires currentStep=SURVEY (current: ${row.currentStep})`,
    );
  }

  const history = parseHistory(row.stepHistory);
  const updatedHistory = appendHistoryEntry(history, {
    step: "SURVEY",
    status: row.status,
    at: new Date().toISOString(),
    notes: `Survey result recorded: ${result}`,
  });

  try {
    const updated = await db.insuranceLifecycle.update({
      where: { id: lifecycleId },
      data: {
        surveyResult: result,
        stepHistory: JSON.stringify(updatedHistory),
      },
    });
    logger.info("[insurance-lifecycle] survey result recorded", {
      id: lifecycleId,
    });
    return updated as InsuranceLifecycleRecord;
  } catch (err) {
    logger.error("[insurance-lifecycle] recordSurveyResult DB error", {
      error: String(err),
      id: lifecycleId,
    });
    throw err;
  }
}

// ============ §6.12 settleClaim ============

/**
 * SURVEY → SETTLEMENT. Sets `settlementAmountUsd` + `settlementDate` +
 * `status=SETTLED`.
 */
export async function settleClaim(
  lifecycleId: string,
  settlementAmountUsd: number,
): Promise<InsuranceLifecycleRecord> {
  if (!lifecycleId) {
    throw new Error("lifecycleId is required");
  }
  const amt = Number(settlementAmountUsd);
  if (isNaN(amt) || amt <= 0) {
    throw new Error("settlementAmountUsd must be > 0");
  }

  let row: any = null;
  try {
    row = await db.insuranceLifecycle.findUnique({
      where: { id: lifecycleId },
    });
  } catch (err) {
    logger.error("[insurance-lifecycle] settleClaim lookup failed", {
      error: String(err),
      lifecycleId,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`InsuranceLifecycle not found: ${lifecycleId}`);
  }
  if (row.currentStep !== "SURVEY") {
    throw new Error(
      `settleClaim requires currentStep=SURVEY (current: ${row.currentStep})`,
    );
  }

  const history = parseHistory(row.stepHistory);
  const now = new Date();
  const updatedHistory = appendHistoryEntry(history, {
    step: "SETTLEMENT",
    status: "SETTLED",
    at: now.toISOString(),
    notes: `Claim settled — $${amt.toFixed(2)}`,
  });

  try {
    const updated = await db.insuranceLifecycle.update({
      where: { id: lifecycleId },
      data: {
        currentStep: "SETTLEMENT",
        status: "SETTLED",
        settlementAmountUsd: +amt.toFixed(2),
        settlementDate: now,
        stepHistory: JSON.stringify(updatedHistory),
      },
    });
    logger.info("[insurance-lifecycle] claim settled", {
      id: lifecycleId,
      settlementAmountUsd: amt,
    });
    return updated as InsuranceLifecycleRecord;
  } catch (err) {
    logger.error("[insurance-lifecycle] settleClaim DB error", {
      error: String(err),
      id: lifecycleId,
    });
    throw err;
  }
}

// ============ §6.13 recordRecovery ============

/**
 * SETTLEMENT → RECOVERY. Sets `recoveryAmountUsd` + `recoveryDate` +
 * `status=RECOVERED` (subrogation against a third party).
 */
export async function recordRecovery(
  lifecycleId: string,
  recoveryAmountUsd: number,
): Promise<InsuranceLifecycleRecord> {
  if (!lifecycleId) {
    throw new Error("lifecycleId is required");
  }
  const amt = Number(recoveryAmountUsd);
  if (isNaN(amt) || amt < 0) {
    throw new Error("recoveryAmountUsd must be >= 0");
  }

  let row: any = null;
  try {
    row = await db.insuranceLifecycle.findUnique({
      where: { id: lifecycleId },
    });
  } catch (err) {
    logger.error("[insurance-lifecycle] recordRecovery lookup failed", {
      error: String(err),
      lifecycleId,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`InsuranceLifecycle not found: ${lifecycleId}`);
  }
  if (row.currentStep !== "SETTLEMENT") {
    throw new Error(
      `recordRecovery requires currentStep=SETTLEMENT (current: ${row.currentStep})`,
    );
  }

  const history = parseHistory(row.stepHistory);
  const now = new Date();
  const updatedHistory = appendHistoryEntry(history, {
    step: "RECOVERY",
    status: "RECOVERED",
    at: now.toISOString(),
    notes:
      amt > 0
        ? `Recovery of $${amt.toFixed(2)} recorded (subrogation)`
        : "No recovery recorded (subrogation attempt closed with $0)",
  });

  try {
    const updated = await db.insuranceLifecycle.update({
      where: { id: lifecycleId },
      data: {
        currentStep: "RECOVERY",
        status: "RECOVERED",
        recoveryAmountUsd: +amt.toFixed(2),
        recoveryDate: now,
        stepHistory: JSON.stringify(updatedHistory),
      },
    });
    logger.info("[insurance-lifecycle] recovery recorded", {
      id: lifecycleId,
      recoveryAmountUsd: amt,
    });
    return updated as InsuranceLifecycleRecord;
  } catch (err) {
    logger.error("[insurance-lifecycle] recordRecovery DB error", {
      error: String(err),
      id: lifecycleId,
    });
    throw err;
  }
}

// ============ §6.14 closeLifecycle ============

/** RECOVERY → CLOSE. Status=CLOSED. Terminal — no further transitions. */
export async function closeLifecycle(
  lifecycleId: string,
): Promise<InsuranceLifecycleRecord> {
  if (!lifecycleId) {
    throw new Error("lifecycleId is required");
  }

  let row: any = null;
  try {
    row = await db.insuranceLifecycle.findUnique({
      where: { id: lifecycleId },
    });
  } catch (err) {
    logger.error("[insurance-lifecycle] closeLifecycle lookup failed", {
      error: String(err),
      lifecycleId,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`InsuranceLifecycle not found: ${lifecycleId}`);
  }
  if (row.currentStep !== "RECOVERY") {
    throw new Error(
      `closeLifecycle requires currentStep=RECOVERY (current: ${row.currentStep})`,
    );
  }

  const history = parseHistory(row.stepHistory);
  const updatedHistory = appendHistoryEntry(history, {
    step: "CLOSE",
    status: "CLOSED",
    at: new Date().toISOString(),
    notes: "Lifecycle closed",
  });

  try {
    const updated = await db.insuranceLifecycle.update({
      where: { id: lifecycleId },
      data: {
        currentStep: "CLOSE",
        status: "CLOSED",
        stepHistory: JSON.stringify(updatedHistory),
      },
    });
    logger.info("[insurance-lifecycle] lifecycle CLOSED", {
      id: lifecycleId,
    });
    return updated as InsuranceLifecycleRecord;
  } catch (err) {
    logger.error("[insurance-lifecycle] closeLifecycle DB error", {
      error: String(err),
      id: lifecycleId,
    });
    throw err;
  }
}

// ============ §6.15 getInsuranceProgress ============

/**
 * Progress summary for an insurance lifecycle.
 *   totalSteps    = 10
 *   completedSteps = stepIndex(currentStep)  (CLOSE = 9 → 9/10 = 90%, but
 *                   because at CLOSE the lifecycle is terminal/CLOSED, the
 *                   full 10 steps count as completed)
 *   progressPct   = completedSteps / totalSteps * 100, clamped to [0, 100]
 */
export async function getInsuranceProgress(
  lifecycleId: string,
): Promise<InsuranceProgress> {
  const empty: InsuranceProgress = {
    currentStep: "QUOTE",
    completedSteps: 0,
    totalSteps: INSURANCE_LIFECYCLE_STEPS.length,
    progressPct: 0,
  };
  if (!lifecycleId) return empty;

  let row: any = null;
  try {
    row = await db.insuranceLifecycle.findUnique({
      where: { id: lifecycleId },
    });
  } catch (err) {
    logger.error("[insurance-lifecycle] getInsuranceProgress lookup failed", {
      error: String(err),
      lifecycleId,
    });
    return empty;
  }
  if (!row) return empty;

  const idx = stepIndex(row.currentStep);
  const totalSteps = INSURANCE_LIFECYCLE_STEPS.length;
  let completedSteps = idx < 0 ? 0 : idx;
  if (row.currentStep === "CLOSE" && row.status === "CLOSED") {
    completedSteps = totalSteps;
  }
  const progressPct =
    totalSteps > 0
      ? Math.round((completedSteps / totalSteps) * 1000) / 10
      : 0;

  return {
    currentStep: row.currentStep,
    completedSteps,
    totalSteps,
    progressPct: Math.min(100, Math.max(0, progressPct)),
  };
}

// ============ §6.16 linkToExistingPolicy ============

/**
 * Link the lifecycle to an existing `InsurancePolicy` row. Idempotent —
 * returns the existing row if already linked to the same policyId.
 */
export async function linkToExistingPolicy(
  lifecycleId: string,
  policyId: string,
): Promise<InsuranceLifecycleRecord> {
  if (!lifecycleId) {
    throw new Error("lifecycleId is required");
  }
  if (!policyId) {
    throw new Error("policyId is required");
  }

  let row: any = null;
  try {
    row = await db.insuranceLifecycle.findUnique({
      where: { id: lifecycleId },
    });
  } catch (err) {
    logger.error("[insurance-lifecycle] linkToExistingPolicy lookup failed", {
      error: String(err),
      lifecycleId,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`InsuranceLifecycle not found: ${lifecycleId}`);
  }
  if (row.policyId === policyId) {
    return row as InsuranceLifecycleRecord; // idempotent
  }

  // Try to enrich policyNumber from the InsurancePolicy row.
  let policy: any = null;
  try {
    policy = await db.insurancePolicy.findUnique({ where: { id: policyId } });
  } catch (err) {
    logger.warn("[insurance-lifecycle] InsurancePolicy lookup during link failed", {
      error: String(err),
      policyId,
    });
  }

  const updateData: any = {
    policyId,
    notes: appendNote(
      row.notes || null,
      `[${new Date().toISOString()} LINK] linked to InsurancePolicy ${policyId}`,
    ),
  };
  if (policy?.policyNumber) {
    updateData.policyNumber = policy.policyNumber;
  }

  try {
    const updated = await db.insuranceLifecycle.update({
      where: { id: lifecycleId },
      data: updateData,
    });
    logger.info("[insurance-lifecycle] linked to InsurancePolicy", {
      id: lifecycleId,
      policyId,
    });
    return updated as InsuranceLifecycleRecord;
  } catch (err) {
    logger.error("[insurance-lifecycle] linkToExistingPolicy DB error", {
      error: String(err),
      id: lifecycleId,
      policyId,
    });
    throw err;
  }
}

// ============ §6.17 linkToExistingClaim ============

/**
 * Link the lifecycle to an existing `InsuranceClaim` row. Idempotent —
 * returns the existing row if already linked to the same claimId.
 */
export async function linkToExistingClaim(
  lifecycleId: string,
  claimId: string,
): Promise<InsuranceLifecycleRecord> {
  if (!lifecycleId) {
    throw new Error("lifecycleId is required");
  }
  if (!claimId) {
    throw new Error("claimId is required");
  }

  let row: any = null;
  try {
    row = await db.insuranceLifecycle.findUnique({
      where: { id: lifecycleId },
    });
  } catch (err) {
    logger.error("[insurance-lifecycle] linkToExistingClaim lookup failed", {
      error: String(err),
      lifecycleId,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`InsuranceLifecycle not found: ${lifecycleId}`);
  }
  if (row.claimId === claimId) {
    return row as InsuranceLifecycleRecord; // idempotent
  }

  // Try to enrich claimAmountUsd from the InsuranceClaim row.
  let claim: any = null;
  try {
    claim = await db.insuranceClaim.findUnique({ where: { id: claimId } });
  } catch (err) {
    logger.warn("[insurance-lifecycle] InsuranceClaim lookup during link failed", {
      error: String(err),
      claimId,
    });
  }

  const updateData: any = {
    claimId,
    notes: appendNote(
      row.notes || null,
      `[${new Date().toISOString()} LINK] linked to InsuranceClaim ${claimId}`,
    ),
  };
  if (claim?.claimAmountUsd) {
    updateData.claimAmountUsd = +Number(claim.claimAmountUsd).toFixed(2);
  }

  try {
    const updated = await db.insuranceLifecycle.update({
      where: { id: lifecycleId },
      data: updateData,
    });
    logger.info("[insurance-lifecycle] linked to InsuranceClaim", {
      id: lifecycleId,
      claimId,
    });
    return updated as InsuranceLifecycleRecord;
  } catch (err) {
    logger.error("[insurance-lifecycle] linkToExistingClaim DB error", {
      error: String(err),
      id: lifecycleId,
      claimId,
    });
    throw err;
  }
}

// ============ Module exports ============
// All exports are named — no default export (matches existing SGTX lib
// convention, avoids `import/no-anonymous-default-export` warning).

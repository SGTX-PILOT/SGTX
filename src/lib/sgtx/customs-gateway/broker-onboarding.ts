// @ts-nocheck
/**
 * SGTX Customs Gateway — Broker Onboarding Workflow
 * ===================================================
 *
 * Implements the 14-step broker onboarding workflow. A broker must complete
 * all 14 steps before they can submit live customs declarations through any
 * adapter. The workflow is Governor-supervised — the Governor must approve
 * steps 12 (CERTIFICATION_READINESS) and 13 (PRODUCTION_APPROVAL) before
 * the broker's credentials are activated (step 14: ACTIVATION).
 *
 * The 14 steps (in order):
 *
 *   1.  COMPANY_IDENTITY         — Broker's legal entity registered (GTID)
 *   2.  BROKER_LICENSING         — Government broker licence verified
 *                                    (e.g. CBP broker licence 19 CFR 111,
 *                                    Nafeza broker registration)
 *   3.  KYB_KYC                  — Know-Your-Business + Know-Your-Customer
 *   4.  JURISDICTION_SELECTION   — Broker picks jurisdictions (US, EG, ...)
 *   5.  CUSTOMS_SYSTEM_SELECTION — Broker picks customs adapters (US_ACE,
 *                                    EG_NAFEZA, ...)
 *   6.  CONNECTION_PROFILE       — Broker configures connection (mTLS cert,
 *                                    ABI parameters, Nafeza endpoint, ...)
 *   7.  CREDENTIAL_REGISTRATION  — Broker registers BYOC credentials
 *                                    (HSM references; actual secrets never
 *                                    enter SGTX)
 *   8.  CERTIFICATE_CONFIG       — Broker configures digital certificate
 *                                    (Egypt Trust e-Seal, CBP ABI cert, ...)
 *   9.  FILING_PROFILE           — Broker creates filing profile per adapter
 *  10.  CONNECTION_TEST          — End-to-end connection test against the
 *                                    adapter's sandbox
 *  11.  SANDBOX_TEST             — Full sandbox submission cycle
 *                                    (submit → status → amend → cancel)
 *  12.  CERTIFICATION_READINESS  — Internal SGTX review + Governor approval
 *  13.  PRODUCTION_APPROVAL      — Governor approves production activation
 *  14.  ACTIVATION               — Credentials + filing profile activated;
 *                                    broker can submit live declarations
 *
 * State transitions:
 *   PENDING → IN_PROGRESS → COMPLETED  (happy path)
 *   PENDING → IN_PROGRESS → FAILED     (broker can retry by re-completing
 *                                        the step; FAILED is not terminal)
 *
 * Storage: in-memory Map (process-scoped) + DB audit log via
 * IntegrationConnectorLog. A production deployment would persist the
 * onboarding state in a dedicated Prisma model.
 *
 * References:
 *   • CBP Broker Licence (19 CFR 111)
 *   • Nafeza Single Window broker registration
 *   • SGTX L0 Constitution — broker onboarding gates
 */

import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";

// ── Types ───────────────────────────────────────────────────────────────

export const ONBOARDING_STEPS = [
  "COMPANY_IDENTITY",
  "BROKER_LICENSING",
  "KYB_KYC",
  "JURISDICTION_SELECTION",
  "CUSTOMS_SYSTEM_SELECTION",
  "CONNECTION_PROFILE",
  "CREDENTIAL_REGISTRATION",
  "CERTIFICATE_CONFIG",
  "FILING_PROFILE",
  "CONNECTION_TEST",
  "SANDBOX_TEST",
  "CERTIFICATION_READINESS",
  "PRODUCTION_APPROVAL",
  "ACTIVATION",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
export type StepStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";

export interface OnboardingStepRecord {
  step: OnboardingStep;
  status: StepStatus;
  completedAt: Date | null;
  notes: string;
  attempts: number;
}

export interface BrokerOnboarding {
  id: string;
  brokerGtid: string;
  currentStep: OnboardingStep;
  steps: OnboardingStepRecord[];
  startedAt: Date;
  completedAt: Date | null;
}

export interface OnboardingProgress {
  brokerGtid: string;
  currentStep: OnboardingStep;
  completedSteps: number;
  totalSteps: number;
  percentage: number;
  isComplete: boolean;
}

// ── In-memory store ─────────────────────────────────────────────────────

const onboardingStore = new Map<string, BrokerOnboarding>(); // keyed on brokerGtid

// ── Helpers ─────────────────────────────────────────────────────────────

function now(): Date {
  return new Date();
}

function generateId(): string {
  return `ONB-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

function freshSteps(): OnboardingStepRecord[] {
  return ONBOARDING_STEPS.map((step) => ({
    step,
    status: "PENDING" as StepStatus,
    completedAt: null,
    notes: "",
    attempts: 0,
  }));
}

function firstPendingStep(steps: OnboardingStepRecord[]): OnboardingStep {
  const pending = steps.find((s) => s.status !== "COMPLETED");
  return (pending?.step ?? ONBOARDING_STEPS[ONBOARDING_STEPS.length - 1]) as OnboardingStep;
}

async function auditOnboardingEvent(input: {
  onboardingId: string;
  brokerGtid: string;
  event: string;
  step?: string;
  details: any;
}): Promise<void> {
  try {
    const logId = `ONBLOG-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
    await db.integrationConnectorLog.create({
      data: {
        logId,
        apiName: "BROKER_ONBOARDING",
        endpoint: `onboarding:${input.event}`,
        ustn: null,
        idempotencyKey: `ONB-${input.onboardingId}-${input.event}-${input.step || "all"}-${Date.now()}`,
        requestBody: JSON.stringify({
          onboardingId: input.onboardingId,
          brokerGtid: input.brokerGtid,
          event: input.event,
          step: input.step,
          details: input.details,
        }).slice(0, 2000),
        status: "SUCCESS",
      },
    });
  } catch (e: any) {
    logger.warn("[broker-onboarding] audit log failed", { error: e?.message });
  }
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Start the onboarding workflow for a broker. Idempotent — if onboarding is
 * already in progress for this brokerGtid, returns the existing record.
 */
export async function startOnboarding(brokerGtid: string): Promise<BrokerOnboarding> {
  const startedAt = now();
  try {
    if (!brokerGtid) {
      throw new Error("brokerGtid is required");
    }
    const existing = onboardingStore.get(brokerGtid);
    if (existing) {
      return existing;
    }
    const id = generateId();
    const onboarding: BrokerOnboarding = {
      id,
      brokerGtid,
      currentStep: ONBOARDING_STEPS[0],
      steps: freshSteps(),
      startedAt,
      completedAt: null,
    };
    onboardingStore.set(brokerGtid, onboarding);

    await auditOnboardingEvent({
      onboardingId: id,
      brokerGtid,
      event: "STARTED",
      details: { totalSteps: ONBOARDING_STEPS.length },
    });

    logger.info("[broker-onboarding] workflow started", {
      onboardingId: id,
      brokerGtid,
      totalSteps: ONBOARDING_STEPS.length,
    });

    return onboarding;
  } catch (e: any) {
    logger.error("[broker-onboarding] startOnboarding failed", { error: e?.message });
    // Return a minimal PENDING skeleton — never throw into the API route.
    return {
      id: "",
      brokerGtid: brokerGtid || "",
      currentStep: ONBOARDING_STEPS[0],
      steps: freshSteps(),
      startedAt,
      completedAt: null,
    };
  }
}

/**
 * Get the onboarding record for a broker. Returns null if no onboarding has
 * been started.
 */
export async function getOnboarding(brokerGtid: string): Promise<BrokerOnboarding | null> {
  try {
    if (!brokerGtid) return null;
    return onboardingStore.get(brokerGtid) ?? null;
  } catch (e: any) {
    logger.error("[broker-onboarding] getOnboarding failed", { error: e?.message });
    return null;
  }
}

/**
 * Mark a step as in-progress (e.g. when the broker starts filling out the
 * KYB form). Does NOT advance the current step.
 */
export async function startStep(
  brokerGtid: string,
  step: OnboardingStep,
): Promise<BrokerOnboarding | null> {
  try {
    const onboarding = onboardingStore.get(brokerGtid);
    if (!onboarding) return null;
    const record = onboarding.steps.find((s) => s.step === step);
    if (!record) return null;
    if (record.status === "COMPLETED") return onboarding; // idempotent
    record.status = "IN_PROGRESS";
    record.attempts += 1;

    await auditOnboardingEvent({
      onboardingId: onboarding.id,
      brokerGtid,
      event: "STEP_STARTED",
      step,
      details: { attempts: record.attempts },
    });

    return onboarding;
  } catch (e: any) {
    logger.error("[broker-onboarding] startStep failed", { error: e?.message });
    return null;
  }
}

/**
 * Complete a step. The step must be a valid onboarding step. Steps can be
 * completed out of order EXCEPT for the gating steps:
 *   - Step 12 (CERTIFICATION_READINESS) requires steps 1–11 to be COMPLETED.
 *   - Step 13 (PRODUCTION_APPROVAL) requires step 12 to be COMPLETED.
 *   - Step 14 (ACTIVATION) requires step 13 to be COMPLETED.
 *
 * On completion of step 14 (ACTIVATION), the workflow's `completedAt` is
 * set and the broker is ready to submit live declarations (subject to
 * `broker-routing.ts` authorization on each submission).
 */
export async function completeStep(
  brokerGtid: string,
  step: OnboardingStep | string,
  notes: string,
): Promise<BrokerOnboarding> {
  try {
    if (!brokerGtid) {
      throw new Error("brokerGtid is required");
    }
    const onboarding = onboardingStore.get(brokerGtid);
    if (!onboarding) {
      throw new Error("Onboarding not started — call startOnboarding first");
    }
    const stepName = String(step) as OnboardingStep;
    if (!ONBOARDING_STEPS.includes(stepName)) {
      throw new Error(`Unknown step: ${step}`);
    }
    const record = onboarding.steps.find((s) => s.step === stepName);
    if (!record) {
      throw new Error(`Step record not found: ${stepName}`);
    }

    // Gating: enforce that prerequisite steps are COMPLETED.
    const stepIndex = ONBOARDING_STEPS.indexOf(stepName);
    if (stepName === "CERTIFICATION_READINESS") {
      const prerequisites = onboarding.steps.slice(0, stepIndex);
      const incomplete = prerequisites.filter((s) => s.status !== "COMPLETED");
      if (incomplete.length > 0) {
        throw new Error(
          `Cannot complete CERTIFICATION_READINESS: prerequisites incomplete (${incomplete.map((s) => s.step).join(", ")})`,
        );
      }
    }
    if (stepName === "PRODUCTION_APPROVAL") {
      const cert = onboarding.steps.find((s) => s.step === "CERTIFICATION_READINESS");
      if (!cert || cert.status !== "COMPLETED") {
        throw new Error("Cannot complete PRODUCTION_APPROVAL: CERTIFICATION_READINESS not completed");
      }
    }
    if (stepName === "ACTIVATION") {
      const prod = onboarding.steps.find((s) => s.step === "PRODUCTION_APPROVAL");
      if (!prod || prod.status !== "COMPLETED") {
        throw new Error("Cannot complete ACTIVATION: PRODUCTION_APPROVAL not completed");
      }
    }

    record.status = "COMPLETED";
    record.completedAt = now();
    record.notes = notes || record.notes;

    // Advance currentStep to the first non-COMPLETED step.
    onboarding.currentStep = firstPendingStep(onboarding.steps);

    // If all steps are COMPLETED, mark the workflow as complete.
    if (onboarding.steps.every((s) => s.status === "COMPLETED")) {
      onboarding.completedAt = now();
    }

    await auditOnboardingEvent({
      onboardingId: onboarding.id,
      brokerGtid,
      event: "STEP_COMPLETED",
      step: stepName,
      details: { notes: notes || "" },
    });

    logger.info("[broker-onboarding] step completed", {
      brokerGtid,
      step: stepName,
      currentStep: onboarding.currentStep,
      isComplete: !!onboarding.completedAt,
    });

    return onboarding;
  } catch (e: any) {
    logger.error("[broker-onboarding] completeStep failed", { error: e?.message });
    // Return the current onboarding (or a minimal skeleton) — never throw.
    const existing = onboardingStore.get(brokerGtid);
    if (existing) return existing;
    return {
      id: "",
      brokerGtid: brokerGtid || "",
      currentStep: ONBOARDING_STEPS[0],
      steps: freshSteps(),
      startedAt: now(),
      completedAt: null,
    };
  }
}

/**
 * Mark a step as failed. The broker can retry by re-completing the step
 * (call `startStep` then `completeStep`). FAILED is NOT terminal — the
 * broker can retry indefinitely until COMPLETED.
 */
export async function failStep(
  brokerGtid: string,
  step: OnboardingStep | string,
  reason: string,
): Promise<BrokerOnboarding | null> {
  try {
    const onboarding = onboardingStore.get(brokerGtid);
    if (!onboarding) return null;
    const stepName = String(step) as OnboardingStep;
    const record = onboarding.steps.find((s) => s.step === stepName);
    if (!record) return null;
    record.status = "FAILED";
    record.notes = reason || record.notes;

    await auditOnboardingEvent({
      onboardingId: onboarding.id,
      brokerGtid,
      event: "STEP_FAILED",
      step: stepName,
      details: { reason: reason || "" },
    });

    logger.warn("[broker-onboarding] step failed", { brokerGtid, step: stepName, reason });
    return onboarding;
  } catch (e: any) {
    logger.error("[broker-onboarding] failStep failed", { error: e?.message });
    return null;
  }
}

/**
 * Get a summary of onboarding progress: current step, completed step count,
 * total steps, percentage complete, and whether the workflow is complete.
 */
export async function getOnboardingProgress(
  brokerGtid: string,
): Promise<OnboardingProgress> {
  const empty: OnboardingProgress = {
    brokerGtid: brokerGtid || "",
    currentStep: ONBOARDING_STEPS[0],
    completedSteps: 0,
    totalSteps: ONBOARDING_STEPS.length,
    percentage: 0,
    isComplete: false,
  };
  try {
    const onboarding = onboardingStore.get(brokerGtid);
    if (!onboarding) return empty;
    const completed = onboarding.steps.filter((s) => s.status === "COMPLETED").length;
    const total = onboarding.steps.length;
    const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
    return {
      brokerGtid,
      currentStep: onboarding.currentStep,
      completedSteps: completed,
      totalSteps: total,
      percentage,
      isComplete: !!onboarding.completedAt,
    };
  } catch (e: any) {
    logger.error("[broker-onboarding] getOnboardingProgress failed", { error: e?.message });
    return empty;
  }
}

/**
 * List all onboarding workflows (admin/Governor view). Returns the most
 * recently started first.
 */
export async function listOnboardings(limit: number = 100): Promise<BrokerOnboarding[]> {
  try {
    const all = Array.from(onboardingStore.values());
    all.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    return all.slice(0, Math.max(1, Math.min(limit, 500)));
  } catch (e: any) {
    logger.error("[broker-onboarding] listOnboardings failed", { error: e?.message });
    return [];
  }
}

/**
 * Reset a step back to PENDING. Used when the broker needs to redo a step
 * (e.g. after a credential rotation that requires re-running CONNECTION_TEST).
 * Cannot reset the ACTIVATION step once it's COMPLETED — that would require
 * a full re-onboarding (Governor approval).
 */
export async function resetStep(
  brokerGtid: string,
  step: OnboardingStep | string,
): Promise<BrokerOnboarding | null> {
  try {
    const onboarding = onboardingStore.get(brokerGtid);
    if (!onboarding) return null;
    const stepName = String(step) as OnboardingStep;
    if (stepName === "ACTIVATION") {
      const activation = onboarding.steps.find((s) => s.step === "ACTIVATION");
      if (activation && activation.status === "COMPLETED") {
        logger.warn("[broker-onboarding] cannot reset completed ACTIVATION step", { brokerGtid });
        return onboarding;
      }
    }
    const record = onboarding.steps.find((s) => s.step === stepName);
    if (!record) return null;
    record.status = "PENDING";
    record.completedAt = null;
    record.notes = "";
    onboarding.currentStep = firstPendingStep(onboarding.steps);
    onboarding.completedAt = null;

    await auditOnboardingEvent({
      onboardingId: onboarding.id,
      brokerGtid,
      event: "STEP_RESET",
      step: stepName,
      details: {},
    });

    return onboarding;
  } catch (e: any) {
    logger.error("[broker-onboarding] resetStep failed", { error: e?.message });
    return null;
  }
}

/**
 * Convenience: check whether a broker has completed onboarding (all 14
 * steps COMPLETED). Used as a fast gate before the deeper authorization
 * check in `broker-routing.ts`.
 */
export async function isOnboardingComplete(brokerGtid: string): Promise<boolean> {
  try {
    const onboarding = onboardingStore.get(brokerGtid);
    if (!onboarding) return false;
    return onboarding.steps.every((s) => s.status === "COMPLETED") && !!onboarding.completedAt;
  } catch (e: any) {
    logger.error("[broker-onboarding] isOnboardingComplete failed", { error: e?.message });
    return false;
  }
}

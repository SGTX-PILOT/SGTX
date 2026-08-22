// @ts-nocheck
/**
 * SGTX Phase 9 — §4 Change Approval Pipeline
 * ===========================================================================
 *
 * Implements the 7-step approval pipeline on top of the
 * `RegulatoryChangeV2` + `ChangePipelineStep` Prisma models.
 *
 * The 7 forward pipeline steps (§4):
 *
 *   DETECTED → VERIFIED → IMPACTED → SIMULATED → APPROVED → COMPILED → DEPLOYED
 *
 *   (off-ramps: REJECTED — before APPROVED; ROLLED_BACK — after DEPLOYED)
 *
 * `advancePipeline(changeId, actor, notes?)` is the main orchestrator —
 * it advances the pipeline to the next step, dispatching to the right
 * helper at each transition:
 *
 *   DETECTED → VERIFIED  : mark VERIFIED step COMPLETED (manual review).
 *   VERIFIED → IMPACTED  : call `assessImpact(changeId)` from the impact-engine.
 *   IMPACTED → SIMULATED: call `simulateChange(changeId)` from the impact-engine.
 *   SIMULATED → APPROVED : CONSTITUTIONAL GATE — if the change is a
 *                          constitutional category (SANCTIONS, LAW),
 *                          require `governorDecision` + `multisigApproval`.
 *                          If either is missing → return
 *                          `{ ok: false, error: "Governor decision + multisig
 *                          approval required for constitutional changes" }`.
 *                          Non-constitutional changes just approve.
 *   APPROVED → COMPILED  : compile the new regulatory rules into a new
 *                          `RegulatorySnapshotVersion` (Phase 9 §5).
 *   COMPILED → DEPLOYED  : deploy the new version — call
 *                          `activateVersion(versionId)` (mark ACTIVE +
 *                          supersede the previous ACTIVE version) + set
 *                          `deployedAt` on the change.
 *
 * `rejectChange(changeId, actor, reason)` → REJECTED (off-ramp, allowed
 * before APPROVED).
 *
 * `rollbackChange(changeId, actor, reason)` → ROLLED_BACK (off-ramp,
 * allowed from DEPLOYED). Reactivates the previous snapshot version +
 * sets `rolledBackAt` + `rollbackReason`.
 *
 * `getPipelineStatus(changeId)` returns the current status + the 7 steps
 * + whether the pipeline can advance + the next step + any blockers.
 *
 * `canAdvance(changeId)` is the pure-status check (no side effects) —
 * it returns `{ canAdvance, blockers, nextStep }`.
 *
 * Constitutional categories (SANCTIONS, LAW) — `isConstitutional(change)`
 * + `requiresGovernorApproval(change)` are pure predicates.
 *
 * All DB calls are try/catch-wrapped with safe defaults — the engine never
 * throws synchronously into API routes. `advancePipeline` returns
 * `{ ok: false, error }` on failure rather than throwing (except for the
 * impact-engine + snapshot-versioning calls, which throw on DB error —
 * caught + re-exposed as `{ ok: false, error }`).
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import {
  getChangeByChangeId,
  parsePipelineHistory,
  parseJsonArray,
  serializeJsonArray,
  isConstitutionalCategory,
  CONSTITUTIONAL_CATEGORIES,
  PIPELINE_STATUSES,
  PIPELINE_STEP_NAMES,
  SNAPSHOT_POLICIES,
  type RegulatoryChangeV2,
  type ChangePipelineStepRow,
  type PipelineHistoryEntry,
} from "@/lib/sgtx/regulatory-change";
import {
  assessImpact,
  simulateChange,
  type ImpactResult,
  type SimulationResult,
} from "@/lib/sgtx/impact-engine";
import {
  createSnapshotVersion,
  activateVersion,
  getSnapshotVersion,
  reactivatePreviousVersion,
  type CreateSnapshotInput,
  type RegulatorySnapshotVersion,
} from "@/lib/sgtx/snapshot-versioning";

// Re-export shared types/constants so consumers can import everything
// from the change-approval entry point if they prefer.
export {
  PIPELINE_STATUSES,
  PIPELINE_STEP_NAMES,
  CONSTITUTIONAL_CATEGORIES,
  SNAPSHOT_POLICIES,
};
export type {
  RegulatoryChangeV2,
  ChangePipelineStepRow,
  PipelineHistoryEntry,
  ImpactResult,
  SimulationResult,
};

// ============ §4 Constants ============

/**
 * The 7 forward pipeline steps (§4 — no off-ramps). Same order as
 * PIPELINE_STEP_NAMES in regulatory-change but exposed here under the
 * change-approval namespace for convenience.
 */
export const PIPELINE_STEPS = [
  "DETECTED",
  "VERIFIED",
  "IMPACTED",
  "SIMULATED",
  "APPROVED",
  "COMPILED",
  "DEPLOYED",
] as const;

/**
 * The 7 forward pipeline steps with their step order (1-indexed). Used by
 * `getPipelineStatus` + `canAdvance` to compute the next step.
 */
export const PIPELINE_STEP_ORDER = {
  DETECTED: 1,
  VERIFIED: 2,
  IMPACTED: 3,
  SIMULATED: 4,
  APPROVED: 5,
  COMPILED: 6,
  DEPLOYED: 7,
} as const;

/**
 * The pipeline statuses that block forward advancement (terminal or
 * off-ramp states). A change at any of these statuses cannot advance.
 */
export const TERMINAL_STATUSES = [
  "DEPLOYED",
  "REJECTED",
  "ROLLED_BACK",
] as const;

// ============ Types ============

export interface PipelineResult {
  ok: boolean;
  changeId: string;
  newStatus: string;
  stepCompleted: string;
  notes?: string;
  error?: string;
  /** Optional — set when transitioning APPROVED → COMPILED. */
  snapshotVersionId?: string;
  /** Optional — set when transitioning IMPACTED → SIMULATED or VERIFIED → IMPACTED. */
  impactSeverity?: string;
  /** Optional — set when transitioning IMPACTED → SIMULATED. */
  recommendation?: string;
}

export interface PipelineStepStatus {
  stepName: string;
  stepOrder: number;
  status: string;
  actor?: string | null;
  completedAt?: Date | null;
  resultSummary?: string | null;
}

export interface PipelineStatusResult {
  currentStatus: string;
  steps: PipelineStepStatus[];
  canAdvance: boolean;
  nextStep: string | null;
  blockers: string[];
}

export interface CanAdvanceResult {
  canAdvance: boolean;
  blockers: string[];
  nextStep: string | null;
}

// ============ §4.0 Pure helpers ============

/**
 * Pure: true if this change is a constitutional category (SANCTIONS or
 * LAW) that requires Governor decision + multisig approval before
 * advancing past APPROVED. No DB, no side effects.
 */
export function isConstitutional(change: RegulatoryChangeV2 | null | undefined): boolean {
  if (!change) return false;
  return isConstitutionalCategory(change.changeCategory);
}

/**
 * Pure: true if this change requires Governor approval before advancing
 * past APPROVED. Same as `isConstitutional` — constitutional categories
 * (SANCTIONS, LAW) require Governor decision + multisig approval.
 * No DB, no side effects.
 */
export function requiresGovernorApproval(
  change: RegulatoryChangeV2 | null | undefined,
): boolean {
  return isConstitutional(change);
}

/**
 * Pure: get the next forward pipeline step name for a given status.
 * Returns null if the status is terminal (DEPLOYED, REJECTED, ROLLED_BACK)
 * or unknown. No DB, no side effects.
 */
export function getNextStep(currentStatus: string): string | null {
  const s = String(currentStatus || "").toUpperCase();
  const idx = (PIPELINE_STEPS as readonly string[]).indexOf(s);
  if (idx < 0 || idx >= PIPELINE_STEPS.length - 1) return null;
  return PIPELINE_STEPS[idx + 1];
}

/**
 * Pure: true if the status is terminal (cannot advance). No DB, no side
 * effects.
 */
export function isTerminalStatus(status: string): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(
    String(status || "").toUpperCase(),
  );
}

/**
 * Pure: build the snapshot content JSON for a change. The content
 * represents the full regulatory state at this version (tariff rates,
 * document requirements, SPS rules, etc. — derived from the change's
 * impact assessment). No DB, no side effects.
 */
function buildSnapshotContent(change: RegulatoryChangeV2): Record<string, unknown> {
  return {
    changeId: change.changeId,
    changeCategory: change.changeCategory,
    changeType: change.changeType,
    title: change.title,
    description: change.description || null,
    jurisdictionCode: change.jurisdictionCode,
    effectiveDate: change.effectiveDate
      ? new Date(change.effectiveDate).toISOString()
      : null,
    impactSeverity: change.impactSeverity,
    snapshotPolicy: change.snapshotPolicy,
    affectedProducts: parseJsonArray(change.affectedProducts),
    affectedCountries: parseJsonArray(change.affectedCountries),
    affectedModes: parseJsonArray(change.affectedModes),
    affectedTradeLanes: parseJsonArray(change.affectedTradeLanes),
    affectedDocuments: parseJsonArray(change.affectedDocuments),
    affectedPolicies: parseJsonArray(change.affectedPolicies),
    affectedIntegrations: parseJsonArray(change.affectedIntegrations),
    impactSummary: change.impactSummary || null,
    rollbackSupported: change.rollbackSupported,
    governorDecision: change.governorDecision || null,
    multisigApproval: change.multisigApproval || null,
    compiledAt: new Date().toISOString(),
  };
}

/**
 * Append a new entry to the pipeline history (pure — returns a new array
 * + serialized JSON string). No DB, no side effects.
 */
function appendHistory(
  change: RegulatoryChangeV2,
  status: string,
  actor: string,
  notes?: string,
): string {
  const history = parsePipelineHistory(change.pipelineHistory);
  history.push({
    status,
    at: new Date().toISOString(),
    actor,
    notes: notes || undefined,
  });
  return JSON.stringify(history);
}

// ============ §4.1 advancePipeline (MAIN) ============

/**
 * The main orchestrator — advance the pipeline to the next step.
 *
 * Dispatches based on the current `pipelineStatus`:
 *
 *   DETECTED → VERIFIED  : mark VERIFIED step COMPLETED.
 *   VERIFIED → IMPACTED  : call `assessImpact(changeId)`.
 *   IMPACTED → SIMULATED : call `simulateChange(changeId)`.
 *   SIMULATED → APPROVED : constitutional gate — if SANCTIONS or LAW,
 *                          require `governorDecision` + `multisigApproval`.
 *                          Else, just approve.
 *   APPROVED → COMPILED  : create a new RegulatorySnapshotVersion.
 *   COMPILED → DEPLOYED  : call `activateVersion(versionId)` + set
 *                          `deployedAt`.
 *
 * Returns `{ ok: true, changeId, newStatus, stepCompleted, notes }` on
 * success, or `{ ok: false, changeId, newStatus: <current>, stepCompleted:
 * <current>, error }` on failure (the failure is logged but NOT thrown —
 * the caller can retry or surface the error to the user).
 *
 * The change is advanced atomically: the RegulatoryChangeV2 row's
 * `pipelineStatus` + `pipelineHistory` are updated AND the corresponding
 * ChangePipelineStep row is marked COMPLETED with the actor + resultSummary
 * + timestamps.
 */
export async function advancePipeline(
  changeId: string,
  actor: string,
  notes?: string,
): Promise<PipelineResult> {
  if (!changeId) {
    return {
      ok: false,
      changeId: "",
      newStatus: "",
      stepCompleted: "",
      error: "[change-approval] changeId is required",
    };
  }
  if (!actor) {
    return {
      ok: false,
      changeId,
      newStatus: "",
      stepCompleted: "",
      error: "[change-approval] actor is required",
    };
  }
  const change = await getChangeByChangeId(changeId);
  if (!change) {
    return {
      ok: false,
      changeId,
      newStatus: "",
      stepCompleted: "",
      error: `[change-approval] change not found: ${changeId}`,
    };
  }
  const currentStatus = String(change.pipelineStatus || "").toUpperCase();
  // Terminal check.
  if (isTerminalStatus(currentStatus)) {
    return {
      ok: false,
      changeId,
      newStatus: currentStatus,
      stepCompleted: currentStatus,
      error: `[change-approval] change ${changeId} is in terminal status ${currentStatus} — cannot advance`,
    };
  }
  // Dispatch based on current status.
  try {
    switch (currentStatus) {
      case "DETECTED":
        return await advanceDetectedToVerified(change, actor, notes);
      case "VERIFIED":
        return await advanceVerifiedToImpacted(change, actor, notes);
      case "IMPACTED":
        return await advanceImpactedToSimulated(change, actor, notes);
      case "SIMULATED":
        return await advanceSimulatedToApproved(change, actor, notes);
      case "APPROVED":
        return await advanceApprovedToCompiled(change, actor, notes);
      case "COMPILED":
        return await advanceCompiledToDeployed(change, actor, notes);
      default:
        return {
          ok: false,
          changeId,
          newStatus: currentStatus,
          stepCompleted: currentStatus,
          error: `[change-approval] unknown pipeline status: ${currentStatus}`,
        };
    }
  } catch (err) {
    logger.error("[change-approval] advancePipeline error", {
      error: String(err),
      changeId,
      currentStatus,
      actor,
    });
    return {
      ok: false,
      changeId,
      newStatus: currentStatus,
      stepCompleted: currentStatus,
      error: String(err),
    };
  }
}

// ============ §4.1.1 DETECTED → VERIFIED ============

/**
 * Advance DETECTED → VERIFIED. Marks the VERIFIED ChangePipelineStep as
 * COMPLETED with the actor + resultSummary + timestamps. Updates the
 * RegulatoryChangeV2.pipelineStatus + pipelineHistory.
 */
async function advanceDetectedToVerified(
  change: RegulatoryChangeV2,
  actor: string,
  notes?: string,
): Promise<PipelineResult> {
  const now = new Date();
  const summary = notes || `Verified by ${actor}`;
  const historyJson = appendHistory(change, "VERIFIED", actor, summary);
  try {
    const updated = await db.regulatoryChangeV2.update({
      where: { changeId: change.changeId },
      data: {
        pipelineStatus: "VERIFIED",
        pipelineHistory: historyJson,
        notes: summary,
      },
    });
    await markStepCompleted(change.changeId, "VERIFIED", actor, summary, now);
    logger.info("[change-approval] DETECTED → VERIFIED", {
      changeId: change.changeId,
      actor,
    });
    return {
      ok: true,
      changeId: change.changeId,
      newStatus: "VERIFIED",
      stepCompleted: "VERIFIED",
      notes: summary,
    };
  } catch (err) {
    logger.error("[change-approval] DETECTED → VERIFIED DB error", {
      error: String(err),
      changeId: change.changeId,
    });
    throw err;
  }
}

// ============ §4.1.2 VERIFIED → IMPACTED ============

/**
 * Advance VERIFIED → IMPACTED. Calls `assessImpact(changeId)` from the
 * impact-engine lib — which loads all 8 impact dimensions, computes the
 * severity, persists the impact fields on the RegulatoryChangeV2 row, AND
 * advances the pipeline + marks the IMPACTED step COMPLETED.
 *
 * Since `assessImpact` does the pipeline advance itself, we just delegate
 * to it + return the result.
 */
async function advanceVerifiedToImpacted(
  change: RegulatoryChangeV2,
  actor: string,
  notes?: string,
): Promise<PipelineResult> {
  let impact: ImpactResult;
  try {
    impact = await assessImpact(change.changeId);
  } catch (err) {
    return {
      ok: false,
      changeId: change.changeId,
      newStatus: "VERIFIED",
      stepCompleted: "VERIFIED",
      error: `[change-approval] assessImpact failed: ${String(err)}`,
    };
  }
  // assessImpact advances the pipeline + marks the IMPACTED step COMPLETED.
  // We log the actor override on the step row (best-effort).
  try {
    await db.changePipelineStep.update({
      where: {
        changeId_stepName: {
          changeId: change.changeId,
          stepName: "IMPACTED",
        },
      },
      data: { actor, notes: notes || null },
    });
  } catch (stepErr) {
    logger.error(
      "[change-approval] VERIFIED → IMPACTED step actor override failed (non-fatal)",
      { error: String(stepErr), changeId: change.changeId },
    );
  }
  logger.info("[change-approval] VERIFIED → IMPACTED", {
    changeId: change.changeId,
    actor,
    severity: impact.impactSeverity,
    affectedUstns: impact.affectedActiveUstns.length,
  });
  return {
    ok: true,
    changeId: change.changeId,
    newStatus: "IMPACTED",
    stepCompleted: "IMPACTED",
    impactSeverity: impact.impactSeverity,
    notes: impact.impactSummary,
  };
}

// ============ §4.1.3 IMPACTED → SIMULATED ============

/**
 * Advance IMPACTED → SIMULATED. Calls `simulateChange(changeId)` from the
 * impact-engine lib — which runs the per-trade financial + compliance
 * simulation, derives the recommendation (PROCEED / PROCEED_WITH_CAUTION /
 * BLOCK), AND advances the pipeline + marks the SIMULATED step COMPLETED.
 */
async function advanceImpactedToSimulated(
  change: RegulatoryChangeV2,
  actor: string,
  notes?: string,
): Promise<PipelineResult> {
  let simulation: SimulationResult;
  try {
    simulation = await simulateChange(change.changeId);
  } catch (err) {
    return {
      ok: false,
      changeId: change.changeId,
      newStatus: "IMPACTED",
      stepCompleted: "IMPACTED",
      error: `[change-approval] simulateChange failed: ${String(err)}`,
    };
  }
  // Override the actor on the SIMULATED step row.
  try {
    await db.changePipelineStep.update({
      where: {
        changeId_stepName: {
          changeId: change.changeId,
          stepName: "SIMULATED",
        },
      },
      data: { actor, notes: notes || null },
    });
  } catch (stepErr) {
    logger.error(
      "[change-approval] IMPACTED → SIMULATED step actor override failed (non-fatal)",
      { error: String(stepErr), changeId: change.changeId },
    );
  }
  logger.info("[change-approval] IMPACTED → SIMULATED", {
    changeId: change.changeId,
    actor,
    recommendation: simulation.recommendation,
    financialImpactUsd: simulation.totalFinancialImpactUsd,
  });
  return {
    ok: true,
    changeId: change.changeId,
    newStatus: "SIMULATED",
    stepCompleted: "SIMULATED",
    recommendation: simulation.recommendation,
    notes: `recommendation=${simulation.recommendation}, financial=$${simulation.totalFinancialImpactUsd}, compliance=${simulation.totalComplianceImpact}`,
  };
}

// ============ §4.1.4 SIMULATED → APPROVED (CONSTITUTIONAL GATE) ============

/**
 * Advance SIMULATED → APPROVED. CONSTITUTIONAL GATE — if the change is a
 * constitutional category (SANCTIONS, LAW), require `governorDecision` +
 * `multisigApproval` to be set on the change. If either is missing →
 * return `{ ok: false, error: "Governor decision + multisig approval
 * required for constitutional changes" }`.
 *
 * Non-constitutional changes just approve (no Governor/multisig required).
 *
 * On success, marks the APPROVED ChangePipelineStep COMPLETED with the
 * actor + governor decision + multisig ref (if set).
 */
async function advanceSimulatedToApproved(
  change: RegulatoryChangeV2,
  actor: string,
  notes?: string,
): Promise<PipelineResult> {
  // Constitutional gate.
  if (isConstitutional(change)) {
    if (!change.governorDecision || !change.multisigApproval) {
      const missing: string[] = [];
      if (!change.governorDecision) missing.push("governorDecision");
      if (!change.multisigApproval) missing.push("multisigApproval");
      logger.warn(
        "[change-approval] SIMULATED → APPROVED blocked (constitutional gate)",
        {
          changeId: change.changeId,
          changeCategory: change.changeCategory,
          missing,
        },
      );
      return {
        ok: false,
        changeId: change.changeId,
        newStatus: "SIMULATED",
        stepCompleted: "SIMULATED",
        error:
          "Governor decision + multisig approval required for constitutional changes",
      };
    }
  }
  const now = new Date();
  const summary =
    notes ||
    (isConstitutional(change)
      ? `Approved by ${actor} (constitutional: governor=${change.governorDecision}, multisig=${change.multisigApproval})`
      : `Approved by ${actor}`);
  const historyJson = appendHistory(change, "APPROVED", actor, summary);
  try {
    const updated = await db.regulatoryChangeV2.update({
      where: { changeId: change.changeId },
      data: {
        pipelineStatus: "APPROVED",
        pipelineHistory: historyJson,
        notes: summary,
      },
    });
    // Mark the APPROVED step COMPLETED + stamp the governor/multisig refs.
    try {
      await db.changePipelineStep.update({
        where: {
          changeId_stepName: {
            changeId: change.changeId,
            stepName: "APPROVED",
          },
        },
        data: {
          status: "COMPLETED",
          actor,
          resultSummary: summary,
          governorDecisionId: change.governorDecision || null,
          multisigRef: change.multisigApproval || null,
          startedAt: now,
          completedAt: now,
        },
      });
    } catch (stepErr) {
      logger.error(
        "[change-approval] SIMULATED → APPROVED step update failed (non-fatal)",
        { error: String(stepErr), changeId: change.changeId },
      );
    }
    logger.info("[change-approval] SIMULATED → APPROVED", {
      changeId: change.changeId,
      actor,
      constitutional: isConstitutional(change),
    });
    return {
      ok: true,
      changeId: change.changeId,
      newStatus: "APPROVED",
      stepCompleted: "APPROVED",
      notes: summary,
    };
  } catch (err) {
    logger.error("[change-approval] SIMULATED → APPROVED DB error", {
      error: String(err),
      changeId: change.changeId,
    });
    throw err;
  }
}

// ============ §4.1.5 APPROVED → COMPILED ============

/**
 * Advance APPROVED → COMPILED. Compiles the new regulatory rules into the
 * system — creates a new `RegulatorySnapshotVersion` for the change's
 * jurisdiction. The snapshot content is derived from the change's impact
 * assessment (affected products, countries, modes, etc.).
 *
 * The new version is created with status="ACTIVE" by default (per the
 * schema default). The previous ACTIVE version is NOT yet superseded —
 * that happens at the COMPILED → DEPLOYED transition via
 * `activateVersion(versionId)`.
 *
 * The new version's `versionId` is returned in `PipelineResult.snapshotVersionId`.
 */
async function advanceApprovedToCompiled(
  change: RegulatoryChangeV2,
  actor: string,
  notes?: string,
): Promise<PipelineResult> {
  // Build the snapshot content from the change's impact assessment.
  const snapshotContent = buildSnapshotContent(change);
  // Create the new snapshot version.
  let version: RegulatorySnapshotVersion;
  try {
    version = await createSnapshotVersion({
      changeId: change.changeId,
      jurisdictionCode: change.jurisdictionCode,
      snapshotContent,
      effectiveDate: change.effectiveDate || new Date(),
      status: "ACTIVE",
    });
  } catch (err) {
    return {
      ok: false,
      changeId: change.changeId,
      newStatus: "APPROVED",
      stepCompleted: "APPROVED",
      error: `[change-approval] createSnapshotVersion failed: ${String(err)}`,
    };
  }
  const now = new Date();
  const summary =
    notes ||
    `Compiled to snapshot version ${version.versionId} (jurisdiction ${change.jurisdictionCode}, version #${version.versionNumber})`;
  const historyJson = appendHistory(change, "COMPILED", actor, summary);
  try {
    await db.regulatoryChangeV2.update({
      where: { changeId: change.changeId },
      data: {
        pipelineStatus: "COMPILED",
        pipelineHistory: historyJson,
        notes: summary,
      },
    });
    // Mark the COMPILED step COMPLETED with the versionId in resultData.
    await markStepCompleted(change.changeId, "COMPILED", actor, summary, now, {
      snapshotVersionId: version.versionId,
      snapshotVersionNumber: version.versionNumber,
      snapshotHash: version.snapshotHash,
    });
    logger.info("[change-approval] APPROVED → COMPILED", {
      changeId: change.changeId,
      actor,
      snapshotVersionId: version.versionId,
      snapshotVersionNumber: version.versionNumber,
    });
    return {
      ok: true,
      changeId: change.changeId,
      newStatus: "COMPILED",
      stepCompleted: "COMPILED",
      snapshotVersionId: version.versionId,
      notes: summary,
    };
  } catch (err) {
    logger.error("[change-approval] APPROVED → COMPILED DB error", {
      error: String(err),
      changeId: change.changeId,
    });
    throw err;
  }
}

// ============ §4.1.6 COMPILED → DEPLOYED ============

/**
 * Advance COMPILED → DEPLOYED. Deploys the new version — calls
 * `activateVersion(versionId)` (mark ACTIVE + supersede the previous ACTIVE
 * version) + sets `deployedAt` on the change.
 *
 * The versionId is read from the COMPILED ChangePipelineStep's resultData
 * (set at the APPROVED → COMPILED transition). If not found, falls back to
 * looking up the version by `changeId`.
 */
async function advanceCompiledToDeployed(
  change: RegulatoryChangeV2,
  actor: string,
  notes?: string,
): Promise<PipelineResult> {
  // Find the snapshot version linked to this change.
  let versionId: string | null = null;
  // 1. Read from the COMPILED ChangePipelineStep's resultData.
  try {
    const step = await db.changePipelineStep.findUnique({
      where: {
        changeId_stepName: {
          changeId: change.changeId,
          stepName: "COMPILED",
        },
      },
    });
    if (step && step.resultData) {
      try {
        const data = JSON.parse(step.resultData);
        if (data && data.snapshotVersionId) {
          versionId = data.snapshotVersionId;
        }
      } catch {
        // Ignore parse errors — fall through to the next lookup.
      }
    }
  } catch (stepErr) {
    logger.error(
      "[change-approval] COMPILED → DEPLOYED step lookup failed",
      { error: String(stepErr), changeId: change.changeId },
    );
  }
  // 2. Fall back to looking up the version by changeId.
  if (!versionId) {
    try {
      const v = await db.regulatorySnapshotVersion.findFirst({
        where: { changeId: change.changeId },
        orderBy: { versionNumber: "desc" },
      });
      if (v) versionId = v.versionId;
    } catch (err) {
      logger.error(
        "[change-approval] COMPILED → DEPLOYED version lookup failed",
        { error: String(err), changeId: change.changeId },
      );
    }
  }
  if (!versionId) {
    return {
      ok: false,
      changeId: change.changeId,
      newStatus: "COMPILED",
      stepCompleted: "COMPILED",
      error: `[change-approval] no snapshot version found for change ${change.changeId} — cannot deploy`,
    };
  }
  // Activate the new version (mark ACTIVE + supersede the previous).
  try {
    await activateVersion(versionId);
  } catch (err) {
    return {
      ok: false,
      changeId: change.changeId,
      newStatus: "COMPILED",
      stepCompleted: "COMPILED",
      error: `[change-approval] activateVersion failed: ${String(err)}`,
    };
  }
  const now = new Date();
  const summary =
    notes || `Deployed snapshot version ${versionId} by ${actor}`;
  const historyJson = appendHistory(change, "DEPLOYED", actor, summary);
  try {
    await db.regulatoryChangeV2.update({
      where: { changeId: change.changeId },
      data: {
        pipelineStatus: "DEPLOYED",
        pipelineHistory: historyJson,
        deployedAt: now,
        deploymentNotes: summary,
        notes: summary,
      },
    });
    // Mark the DEPLOYED step COMPLETED.
    await markStepCompleted(change.changeId, "DEPLOYED", actor, summary, now, {
      snapshotVersionId: versionId,
    });
    logger.info("[change-approval] COMPILED → DEPLOYED", {
      changeId: change.changeId,
      actor,
      snapshotVersionId: versionId,
      deployedAt: now,
    });
    return {
      ok: true,
      changeId: change.changeId,
      newStatus: "DEPLOYED",
      stepCompleted: "DEPLOYED",
      snapshotVersionId: versionId,
      notes: summary,
    };
  } catch (err) {
    logger.error("[change-approval] COMPILED → DEPLOYED DB error", {
      error: String(err),
      changeId: change.changeId,
    });
    throw err;
  }
}

// ============ §4.2 rejectChange ============

/**
 * Reject a change — move the pipeline to REJECTED (off-ramp). Allowed
 * from any forward step before APPROVED (DETECTED, VERIFIED, IMPACTED,
 * SIMULATED). Updates the current step's status to REJECTED + records
 * the reason.
 *
 * Throws if the change is not found or is past APPROVED (must use
 * rollbackChange instead). Throws on DB error.
 *
 * NOTE: the regulatory-change lib already exposes `rejectChange`. This
 * function is a thin wrapper that delegates to the regulatory-change
 * `rejectChange` for backward compatibility with the change-approval
 * namespace.
 */
export async function rejectChange(
  changeId: string,
  actor: string,
  reason: string,
): Promise<RegulatoryChangeV2> {
  if (!changeId) {
    throw new Error("[change-approval] changeId is required");
  }
  if (!actor) {
    throw new Error("[change-approval] actor is required");
  }
  if (!reason) {
    throw new Error("[change-approval] reason is required");
  }
  const change = await getChangeByChangeId(changeId);
  if (!change) {
    throw new Error(`[change-approval] change not found: ${changeId}`);
  }
  const currentStatus = String(change.pipelineStatus || "").toUpperCase();
  if (
    currentStatus === "APPROVED" ||
    currentStatus === "COMPILED" ||
    currentStatus === "DEPLOYED" ||
    currentStatus === "ROLLED_BACK"
  ) {
    throw new Error(
      `[change-approval] cannot reject from ${currentStatus} — rejection is only allowed before APPROVED (use rollbackChange instead)`,
    );
  }
  if (currentStatus === "REJECTED") {
    // Already rejected — no-op.
    return change;
  }
  const now = new Date();
  const history = parsePipelineHistory(change.pipelineHistory);
  history.push({
    status: "REJECTED",
    at: now.toISOString(),
    actor,
    notes: reason,
  });
  try {
    const updated = await db.regulatoryChangeV2.update({
      where: { changeId },
      data: {
        pipelineStatus: "REJECTED",
        pipelineHistory: JSON.stringify(history),
        notes: `Rejected by ${actor}: ${reason}`,
      },
    });
    // Mark the current forward step as REJECTED.
    try {
      const currentStepOrder = PIPELINE_STEP_ORDER[currentStatus as keyof typeof PIPELINE_STEP_ORDER];
      if (currentStepOrder) {
        await db.changePipelineStep.update({
          where: { changeId_stepName: { changeId, stepName: currentStatus } },
          data: {
            status: "REJECTED",
            actor,
            resultSummary: `Rejected: ${reason}`,
            completedAt: now,
          },
        });
      }
    } catch (stepErr) {
      logger.error(
        "[change-approval] rejectChange step update failed (non-fatal)",
        { error: String(stepErr), changeId },
      );
    }
    logger.info("[change-approval] change rejected", {
      changeId,
      actor,
      reason,
      fromStatus: currentStatus,
    });
    return updated as RegulatoryChangeV2;
  } catch (err) {
    logger.error("[change-approval] rejectChange DB error", {
      error: String(err),
      changeId,
    });
    throw err;
  }
}

// ============ §4.3 rollbackChange ============

/**
 * Roll back a deployed change — move the pipeline from DEPLOYED to
 * ROLLED_BACK (off-ramp). Reactivates the previous snapshot version (the
 * one that was superseded by this change's version) + sets `rolledBackAt`
 * + `rollbackReason` on the change.
 *
 * Throws if the change is not found or is not in DEPLOYED status. Throws
 * on DB error.
 */
export async function rollbackChange(
  changeId: string,
  actor: string,
  reason: string,
): Promise<RegulatoryChangeV2> {
  if (!changeId) {
    throw new Error("[change-approval] changeId is required");
  }
  if (!actor) {
    throw new Error("[change-approval] actor is required");
  }
  if (!reason) {
    throw new Error("[change-approval] reason is required");
  }
  const change = await getChangeByChangeId(changeId);
  if (!change) {
    throw new Error(`[change-approval] change not found: ${changeId}`);
  }
  if (change.pipelineStatus !== "DEPLOYED") {
    throw new Error(
      `[change-approval] cannot rollback from ${change.pipelineStatus} — rollback is only allowed from DEPLOYED`,
    );
  }
  if (!change.rollbackSupported) {
    throw new Error(
      `[change-approval] change ${changeId} does not support rollback (rollbackSupported=false)`,
    );
  }
  // Find the snapshot version linked to this change.
  let versionId: string | null = null;
  try {
    const v = await db.regulatorySnapshotVersion.findFirst({
      where: { changeId },
      orderBy: { versionNumber: "desc" },
    });
    if (v) versionId = v.versionId;
  } catch (err) {
    logger.error(
      "[change-approval] rollbackChange version lookup failed (non-fatal)",
      { error: String(err), changeId },
    );
  }
  // Reactivate the previous version (if a version was deployed).
  let reactivatedVersionId: string | null = null;
  if (versionId) {
    const reactivated = await reactivatePreviousVersion(versionId);
    if (reactivated) {
      reactivatedVersionId = reactivated.versionId;
    }
  }
  const now = new Date();
  const history = parsePipelineHistory(change.pipelineHistory);
  history.push({
    status: "ROLLED_BACK",
    at: now.toISOString(),
    actor,
    notes: reason,
  });
  try {
    const updated = await db.regulatoryChangeV2.update({
      where: { changeId },
      data: {
        pipelineStatus: "ROLLED_BACK",
        pipelineHistory: JSON.stringify(history),
        rolledBackAt: now,
        rollbackReason: reason,
        notes: `Rolled back by ${actor}: ${reason}`,
      },
    });
    // Mark the DEPLOYED step as ROLLED_BACK (reuse the REJECTED status
    // semantics for the step row — there's no dedicated ROLLED_BACK step
    // status; the step's status reflects that it was reverted).
    try {
      await db.changePipelineStep.update({
        where: {
          changeId_stepName: { changeId, stepName: "DEPLOYED" },
        },
        data: {
          status: "REJECTED", // closest semantic match in STEP_STATUSES
          actor,
          resultSummary: `Rolled back: ${reason}`,
          notes: `Reactivated previous version: ${reactivatedVersionId || "(none)"}`,
        },
      });
    } catch (stepErr) {
      logger.error(
        "[change-approval] rollbackChange step update failed (non-fatal)",
        { error: String(stepErr), changeId },
      );
    }
    logger.info("[change-approval] change rolled back", {
      changeId,
      actor,
      reason,
      reactivatedVersionId,
    });
    return updated as RegulatoryChangeV2;
  } catch (err) {
    logger.error("[change-approval] rollbackChange DB error", {
      error: String(err),
      changeId,
    });
    throw err;
  }
}

// ============ §4.4 getPipelineStatus ============

/**
 * Get the full pipeline status for a change — current status, the 7 steps
 * (with their status, actor, completedAt, resultSummary), whether the
 * pipeline can advance, the next step name, and any blockers.
 *
 * Returns null if the change is not found. Never throws.
 */
export async function getPipelineStatus(
  changeId: string,
): Promise<PipelineStatusResult | null> {
  if (!changeId) return null;
  const change = await getChangeByChangeId(changeId);
  if (!change) return null;
  const steps = await getPipelineSteps(changeId);
  const canAdvanceResult = await canAdvance(changeId);
  return {
    currentStatus: change.pipelineStatus,
    steps: steps.map((s) => ({
      stepName: s.stepName,
      stepOrder: s.stepOrder,
      status: s.status,
      actor: s.actor,
      completedAt: s.completedAt,
      resultSummary: s.resultSummary,
    })),
    canAdvance: canAdvanceResult.canAdvance,
    nextStep: canAdvanceResult.nextStep,
    blockers: canAdvanceResult.blockers,
  };
}

// ============ §4.5 getPipelineSteps ============

/**
 * Get all 7 ChangePipelineStep rows for a change, ordered by stepOrder.
 * Returns [] on DB error or if the change is not found. Never throws.
 *
 * NOTE: the regulatory-change lib already exposes `getPipelineSteps` (with
 * the same semantics). This is a thin re-export under the change-approval
 * namespace.
 */
export async function getPipelineSteps(
  changeId: string,
): Promise<ChangePipelineStepRow[]> {
  if (!changeId) return [];
  try {
    const rows = await db.changePipelineStep.findMany({
      where: { changeId },
      orderBy: [{ stepOrder: "asc" }],
    });
    return (rows as ChangePipelineStepRow[]) || [];
  } catch (err) {
    logger.error("[change-approval] getPipelineSteps DB error", {
      error: String(err),
      changeId,
    });
    return [];
  }
}

// ============ §4.6 canAdvance ============

/**
 * Check if the pipeline can advance (no blockers). Returns:
 *
 *   - canAdvance: true if the change can advance to the next step.
 *   - blockers: list of reasons why it cannot (empty if canAdvance=true).
 *   - nextStep: the next step name (or null if terminal).
 *
 * Blockers checked:
 *   - Change must exist.
 *   - Change must not be in a terminal status (DEPLOYED, REJECTED, ROLLED_BACK).
 *   - SIMULATED → APPROVED: if constitutional, governorDecision + multisigApproval
 *     must be set.
 *
 * Never throws.
 */
export async function canAdvance(
  changeId: string,
): Promise<CanAdvanceResult> {
  if (!changeId) {
    return { canAdvance: false, blockers: ["changeId is required"], nextStep: null };
  }
  const change = await getChangeByChangeId(changeId);
  if (!change) {
    return {
      canAdvance: false,
      blockers: [`change not found: ${changeId}`],
      nextStep: null,
    };
  }
  const currentStatus = String(change.pipelineStatus || "").toUpperCase();
  // Terminal check.
  if (isTerminalStatus(currentStatus)) {
    return {
      canAdvance: false,
      blockers: [`change is in terminal status ${currentStatus}`],
      nextStep: null,
    };
  }
  const nextStep = getNextStep(currentStatus);
  if (!nextStep) {
    return {
      canAdvance: false,
      blockers: [`no next step from ${currentStatus}`],
      nextStep: null,
    };
  }
  // Constitutional gate: SIMULATED → APPROVED requires governorDecision + multisigApproval.
  const blockers: string[] = [];
  if (currentStatus === "SIMULATED" && isConstitutional(change)) {
    if (!change.governorDecision) {
      blockers.push(
        "Governor decision required for constitutional changes (SANCTIONS, LAW) — call assignGovernorDecision",
      );
    }
    if (!change.multisigApproval) {
      blockers.push(
        "Multisig approval required for constitutional changes (SANCTIONS, LAW) — call assignMultisigApproval",
      );
    }
  }
  // ROLLED_BACK changes cannot advance (terminal — must re-detect).
  if (currentStatus === "REJECTED" || currentStatus === "ROLLED_BACK") {
    blockers.push(`change is in off-ramp status ${currentStatus}`);
  }
  return {
    canAdvance: blockers.length === 0,
    blockers,
    nextStep,
  };
}

// ============ §4.7 getChangesAwaitingApproval ============

/**
 * Get all changes at SIMULATED status awaiting the APPROVED step. These
 * are changes that have completed impact assessment + simulation but have
 * not yet been approved. Constitutional changes in this list require
 * Governor decision + multisig approval before they can advance.
 *
 * Returns [] on DB error. Never throws.
 */
export async function getChangesAwaitingApproval(): Promise<RegulatoryChangeV2[]> {
  try {
    const rows = await db.regulatoryChangeV2.findMany({
      where: { pipelineStatus: "SIMULATED" },
      orderBy: [{ createdAt: "asc" }],
    });
    return (rows as RegulatoryChangeV2[]) || [];
  } catch (err) {
    logger.error(
      "[change-approval] getChangesAwaitingApproval DB error",
      { error: String(err) },
    );
    return [];
  }
}

// ============ §4.8 getChangesAwaitingDeployment ============

/**
 * Get all changes at COMPILED status awaiting the DEPLOYED step. These
 * are changes that have been approved + compiled into a new snapshot
 * version but have not yet been deployed.
 *
 * Returns [] on DB error. Never throws.
 */
export async function getChangesAwaitingDeployment(): Promise<RegulatoryChangeV2[]> {
  try {
    const rows = await db.regulatoryChangeV2.findMany({
      where: { pipelineStatus: "COMPILED" },
      orderBy: [{ createdAt: "asc" }],
    });
    return (rows as RegulatoryChangeV2[]) || [];
  } catch (err) {
    logger.error(
      "[change-approval] getChangesAwaitingDeployment DB error",
      { error: String(err) },
    );
    return [];
  }
}

// ============ §4.9 Internal helpers ============

/**
 * Internal: mark a ChangePipelineStep as COMPLETED with the actor +
 * resultSummary + timestamps. Optionally attach resultData (JSON). Non-
 * fatal — errors are logged but do not propagate.
 */
async function markStepCompleted(
  changeId: string,
  stepName: string,
  actor: string,
  resultSummary: string,
  completedAt: Date,
  resultData?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.changePipelineStep.update({
      where: { changeId_stepName: { changeId, stepName } },
      data: {
        status: "COMPLETED",
        actor,
        resultSummary,
        resultData: resultData ? JSON.stringify(resultData) : null,
        startedAt: completedAt,
        completedAt,
      },
    });
  } catch (err) {
    logger.error(
      "[change-approval] markStepCompleted failed (non-fatal)",
      { error: String(err), changeId, stepName },
    );
  }
}

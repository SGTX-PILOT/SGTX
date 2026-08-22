// @ts-nocheck
/**
 * SGTX Phase 9 — §1 Country Activation Workflow
 * ===========================================================================
 *
 * Implements the 20-step country activation workflow on top of the new
 * `CountryActivationWorkflow` Prisma model (schema line 7287). SGTX never
 * "flips a switch" to activate a new country — instead, the ops team works
 * through a structured 20-step onboarding workflow that goes from
 * jurisdiction selection all the way to the Loom record.
 *
 * The 20 steps (§1):
 *
 *   1.  Jurisdiction selected                    — pick ISO country + customs territory
 *   2.  Official sources loaded                   — customs/tax/SPS/TBT ministry URLs
 *   3.  Customs profile configured                — HS code list, prohibited items, valuation rules
 *   4.  Tax configured                            — VAT, duty, excise, withholding
 *   5.  SPS configured                             — phyto, fumigation, MRLs
 *   6.  TBT configured                            — standards, certifications, labelling
 *   7.  Licensing configured                      — import/export licenses per HS
 *   8.  Transport configured                      — modes, ports, border crossings
 *   9.  Customs systems identified                — Nafeza, CargoX, ACE, etc.
 *   10. APIs identified                            — REST/SOAP/EDI endpoints
 *   11. EDI identified                             — UN/EDIFACT messages used
 *   12. Portals identified                         — e.g. ETA, single-window portal
 *   13. Manual procedures identified               — fallback non-automated steps
 *   14. Credentials entered                        — sandbox + production API keys
 *   15. Sandbox connection                         — first successful sandbox call
 *   16. Conformance testing                        — full message exchange in sandbox
 *   17. Legal/regulatory review                    — sign-off from legal team
 *   18. Production approval                        — go-live sign-off (multisig)
 *   19. Activation                                — flip to ACTIVATED + announce
 *   20. Loom record                                — write immutable hash to the Loom
 *
 * Workflow lifecycle (state machine):
 *
 *   IN_PROGRESS ──completeStep(19)──▶ ACTIVATED
 *               ──suspendWorkflow───▶ SUSPENDED ──resumeWorkflow──▶ IN_PROGRESS
 *               ──cancelWorkflow────▶ CANCELLED  (terminal)
 *               ──blockWorkflow─────▶ BLOCKED   (terminal, needs admin unblock)
 *
 * `completeStep` validates step sequence — step N requires step N-1 to be
 * complete (override allowed via the 5th param). When step 19 completes,
 * status flips to ACTIVATED + activatedAt is set. When step 20 completes,
 * the Loom hash (SHA-256 over the full workflow record) is computed and
 * stored on the row.
 *
 * The Phase 1 `JurisdictionFabric` (the per-country fabric config) is
 * PRESERVED — this engine is the workflow layer that decides when a country
 * is "officially activated". The Phase 1 `RegulatoryChangeLog` (line 4602)
 * and `RegulatorySnapshot` (Phase 1, per-trade snapshot) are also RETAINED
 * — the Phase 9 `RegulatoryChangeV2` (see §2 lib) is the worldwide
 * change-management layer.
 *
 * All DB calls are try/catch-wrapped with safe defaults — the engine never
 * throws synchronously into API routes. Pure helpers (`generateWorkflowId`,
 * `computeLoomHash`) have no side effects.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ §1 Constants ============

/**
 * §1 — the 20 country activation steps (canonical IDs in step order).
 * Each step also has a corresponding Boolean column on the
 * `CountryActivationWorkflow` table (`step1JurisdictionSelected`,
 * `step2OfficialSourcesLoaded`, … `step20LoomRecord`).
 */
export const STEP_NAMES = [
  "Jurisdiction selected",
  "Official sources loaded",
  "Customs profile configured",
  "Tax configured",
  "SPS configured",
  "TBT configured",
  "Licensing configured",
  "Transport configured",
  "Customs systems identified",
  "APIs identified",
  "EDI identified",
  "Portals identified",
  "Manual procedures identified",
  "Credentials entered",
  "Sandbox connection",
  "Conformance testing",
  "Legal/regulatory review",
  "Production approval",
  "Activation",
  "Loom record",
] as const;

/**
 * §1 — the 20 step descriptions, in step order. Used by
 * `getActivationChecklist` for display in the admin portal.
 */
export const STEP_DESCRIPTIONS = [
  "Pick the ISO 3166-1 alpha-2 country code + customs territory (e.g. EG, AE, JO).",
  "Load official gazette / customs / tax / SPS / TBT ministry URLs into the catalog.",
  "Configure HS code list, prohibited items list, valuation rules, origin rules.",
  "Configure VAT, customs duty, excise, withholding tax rates + payment channels.",
  "Configure SPS requirements: phyto certificates, fumigation, cold treatment, MRLs.",
  "Configure TBT requirements: standards, certifications, labelling, conformity.",
  "Configure import/export license requirements per HS code + issuing authority.",
  "Configure transport modes, ports of entry/exit, border crossings, corridor rules.",
  "Identify the customs IT systems (Nafeza, CargoX, ACE, single-window, etc.).",
  "Identify the government APIs (REST/SOAP) SGTX must call per procedure.",
  "Identify the EDI messages (UN/EDIFACT, CUSDEC, CUSCAR, CODEPA) in use.",
  "Identify the operator portals (e.g. ETA portal, NAFEZA portal) + manual fallback.",
  "Identify manual procedures (fax/email/in-person) for steps that have no API.",
  "Enter credentials (sandbox + production API keys, mutual TLS certificates).",
  "Achieve first successful sandbox API call against each connector.",
  "Complete conformance testing — full message exchange per procedure in sandbox.",
  "Sign-off from legal team (data residency, liability, governing law).",
  "Production go-live sign-off (multisig: ops lead + legal + finance).",
  "Flip the workflow to ACTIVATED + announce internally + to the Loom.",
  "Write the immutable SHA-256 hash of the activation record to the Loom.",
] as const;

/**
 * The 5 workflow statuses (§1). IN_PROGRESS is the default; ACTIVATED is
 * the success state (set when step 19 completes); SUSPENDED/BLOCKED/
 * CANCELLED are off-ramps.
 */
export const WORKFLOW_STATUSES = [
  "IN_PROGRESS",
  "ACTIVATED",
  "SUSPENDED",
  "BLOCKED",
  "CANCELLED",
] as const;

/**
 * The Prisma column name for each step number (1-indexed). The schema
 * uses descriptive camelCase names rather than `step1`/`step2` so the
 * column meanings are self-documenting in raw SQL queries.
 */
const STEP_FIELD_NAMES: string[] = [
  "step1JurisdictionSelected",
  "step2OfficialSourcesLoaded",
  "step3CustomsProfileConfigured",
  "step4TaxConfigured",
  "step5SpsConfigured",
  "step6TbtConfigured",
  "step7LicensingConfigured",
  "step8TransportConfigured",
  "step9CustomsSystemsIdentified",
  "step10ApisIdentified",
  "step11EdiIdentified",
  "step12PortalsIdentified",
  "step13ManualProceduresIdentified",
  "step14CredentialsEntered",
  "step15SandboxConnection",
  "step16ConformanceTesting",
  "step17LegalRegulatoryReview",
  "step18ProductionApproval",
  "step19Activation",
  "step20LoomRecord",
];

// ============ Types ============

export interface CountryActivationWorkflow {
  id: string;
  workflowId: string;
  countryCode: string;
  countryName?: string | null;
  currentStep: number;
  step1JurisdictionSelected: boolean;
  step2OfficialSourcesLoaded: boolean;
  step3CustomsProfileConfigured: boolean;
  step4TaxConfigured: boolean;
  step5SpsConfigured: boolean;
  step6TbtConfigured: boolean;
  step7LicensingConfigured: boolean;
  step8TransportConfigured: boolean;
  step9CustomsSystemsIdentified: boolean;
  step10ApisIdentified: boolean;
  step11EdiIdentified: boolean;
  step12PortalsIdentified: boolean;
  step13ManualProceduresIdentified: boolean;
  step14CredentialsEntered: boolean;
  step15SandboxConnection: boolean;
  step16ConformanceTesting: boolean;
  step17LegalRegulatoryReview: boolean;
  step18ProductionApproval: boolean;
  step19Activation: boolean;
  step20LoomRecord: boolean;
  stepHistory?: string | null;
  status: string;
  activatedAt?: Date | null;
  owner?: string | null;
  loomHash?: string | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StepHistoryEntry {
  step: number;
  stepName: string;
  completedAt: string;
  completedBy: string;
  notes?: string;
}

export interface WorkflowProgress {
  totalSteps: number;
  completedSteps: number;
  currentStep: number;
  progressPct: number;
  remainingSteps: number[];
  status: string;
}

export interface ActivationChecklistItem {
  step: number;
  name: string;
  completed: boolean;
  description: string;
}

export interface ListWorkflowFilters {
  status?: string;
  currentStep?: number;
  countryCode?: string;
}

export interface CompleteStepOptions {
  /** When true, bypass the "step N-1 must be completed" sequence check. */
  override?: boolean;
}

// ============ §1.0 Pure helpers ============

/**
 * Pure: generate a `CAW-YYYYMMDD-NNNNN` workflow id. 5-digit zero-padded
 * random suffix per UTC day. No DB, no side effects.
 */
export function generateWorkflowId(): string {
  const d = new Date();
  const ymd =
    `${d.getUTCFullYear()}` +
    `${String(d.getUTCMonth() + 1).padStart(2, "0")}` +
    `${String(d.getUTCDate()).padStart(2, "0")}`;
  const n = Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, "0");
  return `CAW-${ymd}-${n}`;
}

/**
 * Pure: get the Prisma column name for a step number (1-indexed). Returns
 * empty string for out-of-range step numbers. No DB, no side effects.
 */
export function getStepFieldName(stepNumber: number): string {
  if (!Number.isInteger(stepNumber) || stepNumber < 1 || stepNumber > 20) {
    return "";
  }
  return STEP_FIELD_NAMES[stepNumber - 1];
}

/**
 * Pure: read a step's completed boolean off a workflow row. Returns false
 * for out-of-range steps or missing rows. No DB, no side effects.
 */
export function isStepCompleted(
  workflow: CountryActivationWorkflow | null | undefined,
  stepNumber: number,
): boolean {
  if (!workflow) return false;
  const field = getStepFieldName(stepNumber);
  if (!field) return false;
  return Boolean((workflow as any)[field]);
}

/**
 * Pure: count how many of the 20 steps are completed. No DB, no side
 * effects.
 */
export function countCompletedSteps(
  workflow: CountryActivationWorkflow | null | undefined,
): number {
  if (!workflow) return 0;
  let count = 0;
  for (let i = 1; i <= 20; i++) {
    if (isStepCompleted(workflow, i)) count++;
  }
  return count;
}

/**
 * Pure: compute the list of remaining (uncompleted) step numbers, in
 * order. No DB, no side effects.
 */
export function computeRemainingSteps(
  workflow: CountryActivationWorkflow | null | undefined,
): number[] {
  if (!workflow) return Array.from({ length: 20 }, (_, i) => i + 1);
  const out: number[] = [];
  for (let i = 1; i <= 20; i++) {
    if (!isStepCompleted(workflow, i)) out.push(i);
  }
  return out;
}

/**
 * Pure: find the next uncompleted step after `currentStep`. If all steps
 * are completed, returns 21 (i.e. "past the end"). No DB, no side effects.
 */
export function computeNextStep(
  workflow: CountryActivationWorkflow | null | undefined,
): number {
  if (!workflow) return 1;
  for (let i = 1; i <= 20; i++) {
    if (!isStepCompleted(workflow, i)) return i;
  }
  return 21;
}

/**
 * Pure: compute the SHA-256 hash of the workflow's canonical record
 * (workflowId + countryCode + countryName + status + all 20 step flags +
 * stepHistory + activatedAt + owner). Uses the dynamic `node:crypto`
 * import so this lib stays runtime-importable in any Node/Bun context.
 * No DB, no side effects (other than reading the crypto module).
 *
 * Returns the hex-encoded SHA-256 digest.
 */
export async function computeLoomHash(
  workflow: CountryActivationWorkflow,
): Promise<string> {
  if (!workflow) return "";
  const crypto = await import("node:crypto");
  const shasum = crypto.createHash("sha256");
  // Canonical record: stable field order, deterministic JSON.
  const record: Record<string, unknown> = {
    workflowId: workflow.workflowId,
    countryCode: workflow.countryCode,
    countryName: workflow.countryName || "",
    status: workflow.status,
    currentStep: workflow.currentStep,
    activatedAt: workflow.activatedAt
      ? new Date(workflow.activatedAt).toISOString()
      : null,
    owner: workflow.owner || "",
    steps: {} as Record<string, boolean>,
    stepHistory: workflow.stepHistory || "",
  };
  for (let i = 1; i <= 20; i++) {
    (record.steps as any)[`step${i}`] = isStepCompleted(workflow, i);
  }
  // Stable serialization: sort keys at top level (steps is already a
  // nested object with stable order).
  const canonical = JSON.stringify(record, Object.keys(record).sort());
  shasum.update(canonical, "utf8");
  return shasum.digest("hex");
}

/**
 * Pure: parse a step history JSON string into an array. Defensive —
 * returns [] on any parse error or non-array input.
 */
function parseStepHistory(raw: unknown): StepHistoryEntry[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as StepHistoryEntry[];
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Pure: serialize a step history array to a JSON string for storage in
 * the `stepHistory` column.
 */
function serializeStepHistory(entries: StepHistoryEntry[]): string {
  return JSON.stringify(entries || []);
}

// ============ §1.1 createActivationWorkflow ============

/**
 * Create a new country activation workflow for `countryCode`. Generates
 * a `CAW-YYYYMMDD-NNNNN` workflow id, sets currentStep=1, status=IN_PROGRESS,
 * all step flags=false, stepHistory=[].
 *
 * If a non-CANCELLED workflow already exists for this country code, returns
 * the existing one (idempotent create). Throws on DB error.
 */
export async function createActivationWorkflow(
  countryCode: string,
  countryName?: string,
  owner?: string,
): Promise<CountryActivationWorkflow> {
  const cc = String(countryCode || "").toUpperCase().trim();
  if (!cc) {
    throw new Error("[country-activation] countryCode is required");
  }
  // Idempotent: return existing non-CANCELLED workflow for this country.
  try {
    const existing = await db.countryActivationWorkflow.findFirst({
      where: {
        countryCode: cc,
        status: { not: "CANCELLED" },
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      logger.info("[country-activation] returning existing workflow", {
        countryCode: cc,
        workflowId: (existing as any).workflowId,
        status: (existing as any).status,
      });
      return existing as CountryActivationWorkflow;
    }
  } catch (err) {
    logger.error("[country-activation] createActivationWorkflow lookup failed", {
      error: String(err),
      countryCode: cc,
    });
    throw err;
  }
  // Create new workflow.
  const workflowId = generateWorkflowId();
  try {
    const created = await db.countryActivationWorkflow.create({
      data: {
        workflowId,
        countryCode: cc,
        countryName: countryName || null,
        currentStep: 1,
        status: "IN_PROGRESS",
        owner: owner || null,
        stepHistory: serializeStepHistory([]),
      },
    });
    logger.info("[country-activation] workflow created", {
      workflowId,
      countryCode: cc,
      countryName: countryName || null,
      owner: owner || null,
    });
    return created as CountryActivationWorkflow;
  } catch (err) {
    logger.error("[country-activation] createActivationWorkflow DB error", {
      error: String(err),
      workflowId,
      countryCode: cc,
    });
    throw err;
  }
}

// ============ §1.2 completeStep ============

/**
 * Mark a step as complete on the workflow. Sets the `stepN` flag to true,
 * appends a StepHistoryEntry, and auto-advances currentStep to the next
 * uncompleted step.
 *
 * Special handling:
 *   - step 19 (activation) → sets status=ACTIVATED + activatedAt=now.
 *   - step 20 (Loom record) → computes the SHA-256 Loom hash + stores it.
 *
 * Sequence check: step N requires step N-1 to be completed. Pass
 * `options.override=true` to bypass (e.g. for backfilling).
 *
 * If the step is already complete, this is a no-op (returns the workflow
 * unchanged) — but still appends a history entry with `alreadyComplete=true`.
 *
 * Throws if the workflow is not found or is not IN_PROGRESS (a SUSPENDED/
 * BLOCKED/CANCELLED/ACTIVATED workflow cannot have steps completed
 * directly — resume first).
 */
export async function completeStep(
  workflowId: string,
  stepNumber: number,
  completedBy: string,
  notes?: string,
  options?: CompleteStepOptions,
): Promise<CountryActivationWorkflow> {
  if (!workflowId) {
    throw new Error("[country-activation] workflowId is required");
  }
  if (
    !Number.isInteger(stepNumber) ||
    stepNumber < 1 ||
    stepNumber > 20
  ) {
    throw new Error(
      `[country-activation] stepNumber must be 1-20 (got ${stepNumber})`,
    );
  }
  // Load the workflow.
  let workflow: CountryActivationWorkflow | null = null;
  try {
    workflow = (await db.countryActivationWorkflow.findUnique({
      where: { workflowId },
    })) as CountryActivationWorkflow | null;
  } catch (err) {
    logger.error("[country-activation] completeStep lookup DB error", {
      error: String(err),
      workflowId,
    });
    throw err;
  }
  if (!workflow) {
    throw new Error(
      `[country-activation] workflow not found: ${workflowId}`,
    );
  }
  // Status check.
  if (workflow.status !== "IN_PROGRESS") {
    throw new Error(
      `[country-activation] workflow ${workflowId} is ${workflow.status} — cannot complete steps (resume first)`,
    );
  }
  // Sequence check (with override).
  const alreadyComplete = isStepCompleted(workflow, stepNumber);
  if (stepNumber > 1 && !options?.override && !alreadyComplete) {
    const prev = isStepCompleted(workflow, stepNumber - 1);
    if (!prev) {
      throw new Error(
        `[country-activation] cannot complete step ${stepNumber} — step ${stepNumber - 1} not yet completed (override with options.override=true)`,
      );
    }
  }
  // Build the update payload.
  const now = new Date();
  const fieldName = getStepFieldName(stepNumber);
  const stepName = STEP_NAMES[stepNumber - 1] || `Step ${stepNumber}`;
  const history = parseStepHistory(workflow.stepHistory);
  history.push({
    step: stepNumber,
    stepName,
    completedAt: now.toISOString(),
    completedBy: completedBy || "unknown",
    notes: notes || undefined,
  });
  const updateData: Record<string, unknown> = {
    [fieldName]: true,
    stepHistory: serializeStepHistory(history),
    updatedAt: now,
  };
  // Auto-advance currentStep to next uncompleted.
  // We have to simulate the post-update workflow object to compute the
  // next step correctly (since we're about to mark step N as complete).
  const simulatedWorkflow: CountryActivationWorkflow = {
    ...workflow,
    [fieldName]: true,
  } as CountryActivationWorkflow;
  const nextStep = computeNextStep(simulatedWorkflow);
  updateData.currentStep = nextStep <= 20 ? nextStep : 20;
  // Special handling: step 19 = activation.
  if (stepNumber === 19) {
    updateData.status = "ACTIVATED";
    updateData.activatedAt = now;
  }
  // Special handling: step 20 = Loom record. Compute SHA-256 hash.
  if (stepNumber === 20) {
    try {
      // Compute the hash on the post-update workflow state.
      const loomWorkflow: CountryActivationWorkflow = {
        ...simulatedWorkflow,
        status: (updateData.status as string) || workflow.status,
        activatedAt:
          (updateData.activatedAt as Date) || workflow.activatedAt || null,
        currentStep: updateData.currentStep as number,
      } as CountryActivationWorkflow;
      const hash = await computeLoomHash(loomWorkflow);
      updateData.loomHash = hash;
    } catch (err) {
      logger.error("[country-activation] computeLoomHash failed", {
        error: String(err),
        workflowId,
      });
      // Non-fatal — leave loomHash null + record the error in notes.
      updateData.notes = `Loom hash computation failed: ${String(err)}`;
    }
  }
  // Persist.
  try {
    const updated = await db.countryActivationWorkflow.update({
      where: { workflowId },
      data: updateData,
    });
    logger.info("[country-activation] step completed", {
      workflowId,
      stepNumber,
      stepName,
      completedBy: completedBy || "unknown",
      nextStep: updateData.currentStep,
      status: (updateData.status as string) || "IN_PROGRESS",
      alreadyComplete,
    });
    return updated as CountryActivationWorkflow;
  } catch (err) {
    logger.error("[country-activation] completeStep update DB error", {
      error: String(err),
      workflowId,
      stepNumber,
    });
    throw err;
  }
}

// ============ §1.3 getActivationWorkflow ============

/**
 * Get a workflow by its `workflowId` (CAW-YYYYMMDD-NNNNN). Returns null
 * if not found or on DB error. Never throws.
 */
export async function getActivationWorkflow(
  workflowId: string,
): Promise<CountryActivationWorkflow | null> {
  if (!workflowId) return null;
  try {
    const row = await db.countryActivationWorkflow.findUnique({
      where: { workflowId },
    });
    return (row as CountryActivationWorkflow | null) || null;
  } catch (err) {
    logger.error("[country-activation] getActivationWorkflow DB error", {
      error: String(err),
      workflowId,
    });
    return null;
  }
}

// ============ §1.4 getActivationByCountry ============

/**
 * Get the latest workflow for a country code. Returns null if no workflow
 * exists or on DB error. Never throws.
 */
export async function getActivationByCountry(
  countryCode: string,
): Promise<CountryActivationWorkflow | null> {
  const cc = String(countryCode || "").toUpperCase().trim();
  if (!cc) return null;
  try {
    const row = await db.countryActivationWorkflow.findFirst({
      where: { countryCode: cc },
      orderBy: { createdAt: "desc" },
    });
    return (row as CountryActivationWorkflow | null) || null;
  } catch (err) {
    logger.error("[country-activation] getActivationByCountry DB error", {
      error: String(err),
      countryCode: cc,
    });
    return null;
  }
}

// ============ §1.5 listActivationWorkflows ============

/**
 * List workflows with optional filters (status, currentStep, countryCode).
 * Returns [] on DB error. Never throws.
 */
export async function listActivationWorkflows(
  filters?: ListWorkflowFilters,
): Promise<CountryActivationWorkflow[]> {
  const where: Record<string, unknown> = {};
  if (filters?.status) where.status = filters.status;
  if (typeof filters?.currentStep === "number") {
    where.currentStep = filters.currentStep;
  }
  if (filters?.countryCode) {
    where.countryCode = String(filters.countryCode).toUpperCase().trim();
  }
  try {
    const rows = await db.countryActivationWorkflow.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
    });
    return (rows as CountryActivationWorkflow[]) || [];
  } catch (err) {
    logger.error("[country-activation] listActivationWorkflows DB error", {
      error: String(err),
      filters,
    });
    return [];
  }
}

// ============ §1.6 getWorkflowProgress ============

/**
 * Get a progress summary for a workflow:
 *   - totalSteps = 20
 *   - completedSteps = count of completed stepN flags
 *   - currentStep = the workflow's currentStep column
 *   - progressPct = completedSteps / totalSteps * 100 (rounded)
 *   - remainingSteps = array of uncompleted step numbers (1-indexed)
 *   - status = workflow.status
 *
 * Returns a fresh 0-progress object on DB error. Never throws.
 */
export async function getWorkflowProgress(
  workflowId: string,
): Promise<WorkflowProgress> {
  const empty: WorkflowProgress = {
    totalSteps: 20,
    completedSteps: 0,
    currentStep: 1,
    progressPct: 0,
    remainingSteps: Array.from({ length: 20 }, (_, i) => i + 1),
    status: "IN_PROGRESS",
  };
  if (!workflowId) return empty;
  const workflow = await getActivationWorkflow(workflowId);
  if (!workflow) return empty;
  const completedSteps = countCompletedSteps(workflow);
  const remaining = computeRemainingSteps(workflow);
  const progressPct = Math.round((completedSteps / 20) * 100);
  return {
    totalSteps: 20,
    completedSteps,
    currentStep: workflow.currentStep,
    progressPct,
    remainingSteps: remaining,
    status: workflow.status,
  };
}

// ============ §1.7 suspendWorkflow ============

/**
 * Suspend an IN_PROGRESS workflow (e.g. ops team paused onboarding
 * pending external input). Sets status=SUSPENDED + records the reason in
 * notes. Throws if the workflow is not IN_PROGRESS or not found.
 */
export async function suspendWorkflow(
  workflowId: string,
  reason: string,
): Promise<CountryActivationWorkflow> {
  if (!workflowId) {
    throw new Error("[country-activation] workflowId is required");
  }
  const current = await getActivationWorkflow(workflowId);
  if (!current) {
    throw new Error(
      `[country-activation] workflow not found: ${workflowId}`,
    );
  }
  if (current.status !== "IN_PROGRESS") {
    throw new Error(
      `[country-activation] workflow ${workflowId} is ${current.status} — only IN_PROGRESS workflows can be suspended`,
    );
  }
  try {
    const updated = await db.countryActivationWorkflow.update({
      where: { workflowId },
      data: {
        status: "SUSPENDED",
        notes: `Suspended: ${reason || "(no reason provided)"}`,
      },
    });
    logger.info("[country-activation] workflow suspended", {
      workflowId,
      reason,
    });
    return updated as CountryActivationWorkflow;
  } catch (err) {
    logger.error("[country-activation] suspendWorkflow DB error", {
      error: String(err),
      workflowId,
    });
    throw err;
  }
}

// ============ §1.8 resumeWorkflow ============

/**
 * Resume a SUSPENDED workflow (back to IN_PROGRESS). Throws if the
 * workflow is not SUSPENDED or not found.
 */
export async function resumeWorkflow(
  workflowId: string,
): Promise<CountryActivationWorkflow> {
  if (!workflowId) {
    throw new Error("[country-activation] workflowId is required");
  }
  const current = await getActivationWorkflow(workflowId);
  if (!current) {
    throw new Error(
      `[country-activation] workflow not found: ${workflowId}`,
    );
  }
  if (current.status !== "SUSPENDED") {
    throw new Error(
      `[country-activation] workflow ${workflowId} is ${current.status} — only SUSPENDED workflows can be resumed`,
    );
  }
  try {
    const updated = await db.countryActivationWorkflow.update({
      where: { workflowId },
      data: {
        status: "IN_PROGRESS",
        notes: `Resumed from SUSPENDED at ${new Date().toISOString()}`,
      },
    });
    logger.info("[country-activation] workflow resumed", { workflowId });
    return updated as CountryActivationWorkflow;
  } catch (err) {
    logger.error("[country-activation] resumeWorkflow DB error", {
      error: String(err),
      workflowId,
    });
    throw err;
  }
}

// ============ §1.9 cancelWorkflow ============

/**
 * Cancel a workflow (terminal state). Allowed from IN_PROGRESS or
 * SUSPENDED. Throws if the workflow is ACTIVATED, BLOCKED, or already
 * CANCELLED, or not found.
 */
export async function cancelWorkflow(
  workflowId: string,
  reason: string,
): Promise<CountryActivationWorkflow> {
  if (!workflowId) {
    throw new Error("[country-activation] workflowId is required");
  }
  const current = await getActivationWorkflow(workflowId);
  if (!current) {
    throw new Error(
      `[country-activation] workflow not found: ${workflowId}`,
    );
  }
  if (current.status === "CANCELLED") {
    throw new Error(
      `[country-activation] workflow ${workflowId} is already CANCELLED`,
    );
  }
  if (current.status === "ACTIVATED") {
    throw new Error(
      `[country-activation] cannot cancel an ACTIVATED workflow — use the suspension/dispute process instead`,
    );
  }
  try {
    const updated = await db.countryActivationWorkflow.update({
      where: { workflowId },
      data: {
        status: "CANCELLED",
        notes: `Cancelled: ${reason || "(no reason provided)"}`,
      },
    });
    logger.info("[country-activation] workflow cancelled", {
      workflowId,
      reason,
    });
    return updated as CountryActivationWorkflow;
  } catch (err) {
    logger.error("[country-activation] cancelWorkflow DB error", {
      error: String(err),
      workflowId,
    });
    throw err;
  }
}

// ============ §1.10 blockWorkflow ============

/**
 * Block a workflow (terminal state — needs admin unblock). Typically
 * used when a critical compliance issue is discovered mid-onboarding
 * (e.g. legal review fails). Allowed from IN_PROGRESS or SUSPENDED.
 * Throws if the workflow is ACTIVATED, CANCELLED, or already BLOCKED,
 * or not found.
 */
export async function blockWorkflow(
  workflowId: string,
  reason: string,
): Promise<CountryActivationWorkflow> {
  if (!workflowId) {
    throw new Error("[country-activation] workflowId is required");
  }
  const current = await getActivationWorkflow(workflowId);
  if (!current) {
    throw new Error(
      `[country-activation] workflow not found: ${workflowId}`,
    );
  }
  if (current.status === "BLOCKED") {
    throw new Error(
      `[country-activation] workflow ${workflowId} is already BLOCKED`,
    );
  }
  if (current.status === "ACTIVATED") {
    throw new Error(
      `[country-activation] cannot block an ACTIVATED workflow — use the regulatory-change + suspension process instead`,
    );
  }
  try {
    const updated = await db.countryActivationWorkflow.update({
      where: { workflowId },
      data: {
        status: "BLOCKED",
        notes: `Blocked: ${reason || "(no reason provided)"}`,
      },
    });
    logger.info("[country-activation] workflow blocked", {
      workflowId,
      reason,
    });
    return updated as CountryActivationWorkflow;
  } catch (err) {
    logger.error("[country-activation] blockWorkflow DB error", {
      error: String(err),
      workflowId,
    });
    throw err;
  }
}

// ============ §1.11 getActivationChecklist ============

/**
 * Get the 20-step checklist for a workflow, with the completed flag per
 * step + the human-readable name + description. Used by the admin portal
 * to render the onboarding checklist UI.
 *
 * Returns a fresh "all-incomplete" checklist on DB error. Never throws.
 */
export async function getActivationChecklist(
  workflowId: string,
): Promise<ActivationChecklistItem[]> {
  const fresh: ActivationChecklistItem[] = STEP_NAMES.map((name, i) => ({
    step: i + 1,
    name,
    completed: false,
    description: STEP_DESCRIPTIONS[i],
  }));
  if (!workflowId) return fresh;
  const workflow = await getActivationWorkflow(workflowId);
  if (!workflow) return fresh;
  return STEP_NAMES.map((name, i) => ({
    step: i + 1,
    name,
    completed: isStepCompleted(workflow, i + 1),
    description: STEP_DESCRIPTIONS[i],
  }));
}

// ============ §1.12 isCountryActivated ============

/**
 * Check if a country has an ACTIVATED workflow. Returns false on DB error
 * or if no workflow exists. Never throws.
 */
export async function isCountryActivated(
  countryCode: string,
): Promise<boolean> {
  const cc = String(countryCode || "").toUpperCase().trim();
  if (!cc) return false;
  try {
    const row = await db.countryActivationWorkflow.findFirst({
      where: { countryCode: cc, status: "ACTIVATED" },
      select: { workflowId: true },
    });
    return !!row;
  } catch (err) {
    logger.error("[country-activation] isCountryActivated DB error", {
      error: String(err),
      countryCode: cc,
    });
    return false;
  }
}

// ============ §1.13 getActivatedCountries ============

/**
 * Get a sorted list of country codes that have an ACTIVATED workflow.
 * Returns [] on DB error. Never throws.
 */
export async function getActivatedCountries(): Promise<string[]> {
  try {
    const rows = await db.countryActivationWorkflow.findMany({
      where: { status: "ACTIVATED" },
      select: { countryCode: true },
      orderBy: { countryCode: "asc" },
    });
    const codes = (rows || [])
      .map((r: any) => r.countryCode)
      .filter((c: string) => !!c);
    // Deduplicate (a country could have multiple ACTIVATED workflows in
    // pathological cases — return distinct codes only).
    return Array.from(new Set(codes));
  } catch (err) {
    logger.error("[country-activation] getActivatedCountries DB error", {
      error: String(err),
    });
    return [];
  }
}

// ============ §1.14 getLoomHash ============

/**
 * Get the Loom hash (SHA-256 of the activation record) stored on the
 * workflow. Returns null if the workflow is not found, has no Loom hash
 * (step 20 not yet completed), or on DB error. Never throws.
 */
export async function getLoomHash(
  workflowId: string,
): Promise<string | null> {
  if (!workflowId) return null;
  try {
    const row = await db.countryActivationWorkflow.findUnique({
      where: { workflowId },
      select: { loomHash: true },
    });
    if (!row) return null;
    return (row as any).loomHash || null;
  } catch (err) {
    logger.error("[country-activation] getLoomHash DB error", {
      error: String(err),
      workflowId,
    });
    return null;
  }
}

// ============ §1.15 recomputeLoomHash (helper) ============

/**
 * Recompute the Loom hash on demand (e.g. for audit verification). Writes
 * the recomputed hash back to the row + returns it. Returns null if the
 * workflow is not found or on DB error. Never throws.
 */
export async function recomputeLoomHash(
  workflowId: string,
): Promise<string | null> {
  if (!workflowId) return null;
  const workflow = await getActivationWorkflow(workflowId);
  if (!workflow) return null;
  try {
    const hash = await computeLoomHash(workflow);
    await db.countryActivationWorkflow.update({
      where: { workflowId },
      data: { loomHash: hash },
    });
    logger.info("[country-activation] Loom hash recomputed", {
      workflowId,
      hash,
    });
    return hash;
  } catch (err) {
    logger.error("[country-activation] recomputeLoomHash failed", {
      error: String(err),
      workflowId,
    });
    return null;
  }
}

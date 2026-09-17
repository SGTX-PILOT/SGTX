// @ts-nocheck
/**
 * SGTX Phase 9 — §2 Regulatory Change Detection + Recording
 * ===========================================================================
 *
 * Implements the regulatory change detection + recording layer on top of
 * the new `RegulatoryChangeV2` Prisma model (schema line 7337) + the
 * 7-step approval pipeline via `ChangePipelineStep` (line 7398).
 *
 * RIA (Regulatory Intelligence Agent, Phase 2) + the manual admin portal
 * detect changes in the worldwide regulatory landscape. Each detected
 * change gets recorded as a RegulatoryChangeV2 row + 7 ChangePipelineStep
 * rows (one per pipeline step). The pipeline is:
 *
 *   DETECTED → VERIFIED → IMPACTED → SIMULATED → APPROVED → COMPILED → DEPLOYED
 *
 *   (off-ramps: REJECTED, ROLLED_BACK)
 *
 * §2 — the 12 monitoring categories:
 *
 *   LAW | REGULATION | CUSTOMS_PROCEDURE | TAX | TARIFF | SANCTIONS | SPS |
 *   TBT | LICENSES | PERMITS | GOVERNMENT_APIS | DOCUMENT_REQUIREMENTS
 *
 * §2 — the 5 change types:
 *
 *   NEW | AMENDED | REPEALED | SUSPENDED | REPLACED
 *
 * §4 — Governor/multisig linking. Constitutional policy changes
 * (SANCTIONS, LAW) require a Governor decision id + multisig approval ref
 * before they can advance past APPROVED. Non-constitutional changes can
 * proceed through the standard pipeline.
 *
 * The Phase 1 `RegulatoryChangeLog` (line 4602, basic change log) is
 * RETAINED — this engine is the worldwide change-management layer that
 * supersedes it for production workflows. The Phase 1 `RegulatorySnapshot`
 * (per-trade snapshot, RETAINED) is the per-trade snapshot layer; the new
 * `RegulatorySnapshotVersion` (line 7429) is the worldwide versioning
 * layer that this engine advances when a change is deployed.
 *
 * All DB calls are try/catch-wrapped with safe defaults — the engine never
 * throws synchronously into API routes. Pure helpers (`generateChangeId`,
 * constant validators) have no side effects.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ §2 Constants ============

/**
 * §2 — the 12 monitoring categories RIA watches worldwide. Each category
 * is a distinct type of regulatory change SGTX must react to.
 */
export const CHANGE_CATEGORIES = [
  "LAW",
  "REGULATION",
  "CUSTOMS_PROCEDURE",
  "TAX",
  "TARIFF",
  "SANCTIONS",
  "SPS",
  "TBT",
  "LICENSES",
  "PERMITS",
  "GOVERNMENT_APIS",
  "DOCUMENT_REQUIREMENTS",
] as const;

/**
 * §2 — the 5 change types. `NEW` = a brand-new rule/regulation/system;
 * `AMENDED` = existing rule changed; `REPEALED` = rule removed entirely;
 * `SUSPENDED` = rule temporarily not in force; `REPLACED` = rule
 * superseded by another (often bundled in the same change record).
 */
export const CHANGE_TYPES = [
  "NEW",
  "AMENDED",
  "REPEALED",
  "SUSPENDED",
  "REPLACED",
] as const;

/**
 * §4 — the 9 pipeline statuses. The first 7 are the forward progression
 * (DETECTED → … → DEPLOYED). `REJECTED` is the off-ramp when verification
 * fails or the Governor denies approval. `ROLLED_BACK` is the post-
 * deployment off-ramp (deployed then reverted via `rollbackChange`).
 */
export const PIPELINE_STATUSES = [
  "DETECTED",
  "VERIFIED",
  "IMPACTED",
  "SIMULATED",
  "APPROVED",
  "COMPILED",
  "DEPLOYED",
  "REJECTED",
  "ROLLED_BACK",
] as const;

/**
 * The 7 forward pipeline steps (no off-ramps). Used to seed the
 * `ChangePipelineStep` rows when a new change is detected.
 */
export const PIPELINE_STEP_NAMES = [
  "DETECTED",
  "VERIFIED",
  "IMPACTED",
  "SIMULATED",
  "APPROVED",
  "COMPILED",
  "DEPLOYED",
] as const;

/**
 * §3 — the 4 impact severity levels. Computed by the impact engine from
 * the affected scope (USTN count + integration status).
 */
export const IMPACT_SEVERITIES = [
  "MINOR",
  "MODERATE",
  "MAJOR",
  "CRITICAL",
] as const;

/**
 * §5 — the 3 snapshot policies for a deployed change.
 *
 *   PRESERVE_EXISTING — existing locked trades retain their original
 *                       snapshot; future trades use the new version
 *                       (default).
 *   RETROACTIVE        — existing trades MUST be re-evaluated against the
 *                       new rules (e.g. a sanctions update — existing
 *                       trades are immediately non-compliant if they
 *                       now match a sanctions list).
 *   TRANSITIONAL      — existing trades get a grace period during which
 *                       they can be brought into compliance with the new
 *                       rule; future trades use the new version
 *                       immediately.
 */
export const SNAPSHOT_POLICIES = [
  "PRESERVE_EXISTING",
  "RETROACTIVE",
  "TRANSITIONAL",
] as const;

/**
 * Pipeline step statuses (used on ChangePipelineStep.status).
 */
export const STEP_STATUSES = [
  "PENDING",
  "IN_PROGRESS",
  "COMPLETED",
  "REJECTED",
  "SKIPPED",
] as const;

/**
 * Constitutional categories — these require Governor + multisig approval
 * before they can advance past APPROVED. (SANCTIONS + LAW changes can
 * have downstream effects on existing locked trades, so they need the
 * Governor's verdict.)
 */
export const CONSTITUTIONAL_CATEGORIES = ["SANCTIONS", "LAW"] as const;

// ============ Types ============

export interface DetectChangeInput {
  changeCategory: string;
  changeType: string;
  title: string;
  description?: string;
  sourceAuthority?: string;
  sourceUrl?: string;
  sourceReference?: string;
  detectedBy?: string;
  jurisdictionCode: string;
  announcedDate?: Date;
  effectiveDate?: Date;
  expiryDate?: Date;
  notes?: string;
}

export interface RegulatoryChangeV2 {
  id: string;
  changeId: string;
  changeCategory: string;
  changeType: string;
  title: string;
  description?: string | null;
  sourceAuthority?: string | null;
  sourceUrl?: string | null;
  sourceReference?: string | null;
  detectedBy: string;
  jurisdictionCode: string;
  announcedDate?: Date | null;
  effectiveDate?: Date | null;
  expiryDate?: Date | null;
  affectedProducts?: string | null;
  affectedCountries?: string | null;
  affectedModes?: string | null;
  affectedTradeLanes?: string | null;
  affectedActiveUstns?: string | null;
  affectedDocuments?: string | null;
  affectedPolicies?: string | null;
  affectedIntegrations?: string | null;
  impactSummary?: string | null;
  impactSeverity: string;
  snapshotPolicy: string;
  pipelineStatus: string;
  pipelineHistory?: string | null;
  governorDecision?: string | null;
  multisigApproval?: string | null;
  deployedAt?: Date | null;
  deploymentNotes?: string | null;
  rollbackSupported: boolean;
  rolledBackAt?: Date | null;
  rollbackReason?: string | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChangePipelineStepRow {
  id: string;
  changeId: string;
  stepName: string;
  stepOrder: number;
  status: string;
  actor?: string | null;
  resultSummary?: string | null;
  resultData?: string | null;
  governorDecisionId?: string | null;
  multisigRef?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PipelineHistoryEntry {
  status: string;
  at: string;
  actor: string;
  notes?: string;
}

export interface ListChangesFilters {
  changeCategory?: string;
  jurisdictionCode?: string;
  pipelineStatus?: string;
  impactSeverity?: string;
  effectiveDateFrom?: Date;
  effectiveDateTo?: Date;
}

export interface UpdateChangeInput {
  title?: string;
  description?: string;
  sourceAuthority?: string;
  sourceUrl?: string;
  sourceReference?: string;
  announcedDate?: Date;
  effectiveDate?: Date;
  expiryDate?: Date;
  snapshotPolicy?: string;
  rollbackSupported?: boolean;
  notes?: string;
}

// ============ §2.0 Pure helpers ============

/**
 * Pure: generate a `RCG-YYYYMMDD-NNNNN` change id. 5-digit zero-padded
 * random suffix per UTC day. No DB, no side effects.
 */
export function generateChangeId(): string {
  const d = new Date();
  const ymd =
    `${d.getUTCFullYear()}` +
    `${String(d.getUTCMonth() + 1).padStart(2, "0")}` +
    `${String(d.getUTCDate()).padStart(2, "0")}`;
  const n = Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, "0");
  return `RCG-${ymd}-${n}`;
}

/**
 * Pure: validate a change category. No DB, no side effects.
 */
export function isValidChangeCategory(c?: string | null): boolean {
  return !!c && (CHANGE_CATEGORIES as readonly string[]).includes(c);
}

/**
 * Pure: validate a change type. No DB, no side effects.
 */
export function isValidChangeType(t?: string | null): boolean {
  return !!t && (CHANGE_TYPES as readonly string[]).includes(t);
}

/**
 * Pure: validate a pipeline status. No DB, no side effects.
 */
export function isValidPipelineStatus(s?: string | null): boolean {
  return !!s && (PIPELINE_STATUSES as readonly string[]).includes(s);
}

/**
 * Pure: get the step order (1-7) for a forward-pipeline step name. Returns
 * 0 for off-ramp statuses (REJECTED, ROLLED_BACK) or unknown names. No DB,
 * no side effects.
 */
export function getStepOrder(stepName: string): number {
  const idx = PIPELINE_STEP_NAMES.indexOf(stepName as any);
  return idx >= 0 ? idx + 1 : 0;
}

/**
 * Pure: parse a JSON string column (pipelineHistory, affectedProducts, etc.)
 * into an array. Defensive — returns [] on any parse error or non-array
 * input. No DB, no side effects.
 */
export function parseJsonArray(raw: unknown): any[] {
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

/**
 * Pure: serialize an array to a JSON string for storage. Returns null
 * for empty arrays (so the column stays null in the DB). No DB, no side
 * effects.
 */
export function serializeJsonArray(arr?: any[] | null): string | null {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return JSON.stringify(arr);
}

/**
 * Pure: parse a pipeline history JSON string into an array of
 * PipelineHistoryEntry objects. Defensive — returns [] on any parse
 * error. No DB, no side effects.
 */
export function parsePipelineHistory(raw: unknown): PipelineHistoryEntry[] {
  return parseJsonArray(raw) as PipelineHistoryEntry[];
}

/**
 * Pure: true if this change category is "constitutional" — requires
 * Governor decision + multisig approval before it can advance past
 * APPROVED. No DB, no side effects.
 */
export function isConstitutionalCategory(category: string): boolean {
  return (CONSTITUTIONAL_CATEGORIES as readonly string[]).includes(category);
}

// ============ §2.1 detectRegulatoryChange ============

/**
 * Detect a regulatory change (called by RIA when it sees a new gazette /
 * tariff update / sanctions list diff, or by an admin via the manual
 * portal). Creates:
 *
 *   1. A `RegulatoryChangeV2` row with pipelineStatus=DETECTED + the
 *      detectedBy field set (defaults to "RIA").
 *   2. 7 `ChangePipelineStep` rows — the DETECTED step marked COMPLETED
 *      (with actor=detectedBy, completedAt=now, resultSummary), the
 *      other 6 marked PENDING.
 *
 * Throws on invalid input. Throws on DB error.
 */
export async function detectRegulatoryChange(
  input: DetectChangeInput,
): Promise<RegulatoryChangeV2> {
  if (!input) {
    throw new Error("[regulatory-change] input is required");
  }
  if (!isValidChangeCategory(input.changeCategory)) {
    throw new Error(
      `[regulatory-change] invalid changeCategory: ${input.changeCategory}`,
    );
  }
  if (!isValidChangeType(input.changeType)) {
    throw new Error(
      `[regulatory-change] invalid changeType: ${input.changeType}`,
    );
  }
  if (!input.title) {
    throw new Error("[regulatory-change] title is required");
  }
  if (!input.jurisdictionCode) {
    throw new Error("[regulatory-change] jurisdictionCode is required");
  }
  const changeId = generateChangeId();
  const detectedBy = input.detectedBy || "RIA";
  const now = new Date();
  const history: PipelineHistoryEntry[] = [
    {
      status: "DETECTED",
      at: now.toISOString(),
      actor: detectedBy,
      notes: input.notes || undefined,
    },
  ];
  try {
    const created = await db.regulatoryChangeV2.create({
      data: {
        changeId,
        changeCategory: input.changeCategory,
        changeType: input.changeType,
        title: input.title,
        description: input.description || null,
        sourceAuthority: input.sourceAuthority || null,
        sourceUrl: input.sourceUrl || null,
        sourceReference: input.sourceReference || null,
        detectedBy,
        jurisdictionCode: String(input.jurisdictionCode)
          .toUpperCase()
          .trim(),
        announcedDate: input.announcedDate || null,
        effectiveDate: input.effectiveDate || null,
        expiryDate: input.expiryDate || null,
        impactSeverity: "MINOR",
        snapshotPolicy: "PRESERVE_EXISTING",
        pipelineStatus: "DETECTED",
        pipelineHistory: JSON.stringify(history),
        rollbackSupported: true,
        notes: input.notes || null,
      },
    });
    // Seed the 7 ChangePipelineStep rows. DETECTED is COMPLETED, the
    // other 6 are PENDING.
    const stepsData = PIPELINE_STEP_NAMES.map((stepName, i) => ({
      changeId,
      stepName,
      stepOrder: i + 1,
      status: stepName === "DETECTED" ? "COMPLETED" : "PENDING",
      actor: stepName === "DETECTED" ? detectedBy : null,
      resultSummary:
        stepName === "DETECTED"
          ? `Change detected by ${detectedBy}`
          : null,
      startedAt: stepName === "DETECTED" ? now : null,
      completedAt: stepName === "DETECTED" ? now : null,
    }));
    try {
      await db.changePipelineStep.createMany({ data: stepsData });
    } catch (stepErr) {
      // Non-fatal — the change row is created; the steps can be reseeded
      // by an admin action. Log + continue.
      logger.error(
        "[regulatory-change] detectRegulatoryChange step seed failed",
        {
          error: String(stepErr),
          changeId,
        },
      );
    }
    logger.info("[regulatory-change] change detected", {
      changeId,
      changeCategory: input.changeCategory,
      changeType: input.changeType,
      jurisdictionCode: input.jurisdictionCode,
      detectedBy,
    });
    return created as RegulatoryChangeV2;
  } catch (err) {
    logger.error("[regulatory-change] detectRegulatoryChange DB error", {
      error: String(err),
      changeId,
    });
    throw err;
  }
}

// ============ §2.2 getRegulatoryChange ============

/**
 * Get a regulatory change by its Prisma `id` (cuid). Returns null if not
 * found or on DB error. Never throws.
 */
export async function getRegulatoryChange(
  id: string,
): Promise<RegulatoryChangeV2 | null> {
  if (!id) return null;
  try {
    const row = await db.regulatoryChangeV2.findUnique({ where: { id } });
    return (row as RegulatoryChangeV2 | null) || null;
  } catch (err) {
    logger.error("[regulatory-change] getRegulatoryChange DB error", {
      error: String(err),
      id,
    });
    return null;
  }
}

// ============ §2.3 getChangeByChangeId ============

/**
 * Get a regulatory change by its business `changeId` (RCG-YYYYMMDD-NNNNN).
 * Returns null if not found or on DB error. Never throws.
 */
export async function getChangeByChangeId(
  changeId: string,
): Promise<RegulatoryChangeV2 | null> {
  if (!changeId) return null;
  try {
    const row = await db.regulatoryChangeV2.findUnique({
      where: { changeId },
    });
    return (row as RegulatoryChangeV2 | null) || null;
  } catch (err) {
    logger.error("[regulatory-change] getChangeByChangeId DB error", {
      error: String(err),
      changeId,
    });
    return null;
  }
}

// ============ §2.4 listRegulatoryChanges ============

/**
 * List regulatory changes with optional filters. Returns [] on DB error.
 * Never throws.
 */
export async function listRegulatoryChanges(
  filters?: ListChangesFilters,
): Promise<RegulatoryChangeV2[]> {
  const where: Record<string, unknown> = {};
  if (filters?.changeCategory) where.changeCategory = filters.changeCategory;
  if (filters?.jurisdictionCode) {
    where.jurisdictionCode = String(filters.jurisdictionCode)
      .toUpperCase()
      .trim();
  }
  if (filters?.pipelineStatus) where.pipelineStatus = filters.pipelineStatus;
  if (filters?.impactSeverity) where.impactSeverity = filters.impactSeverity;
  if (filters?.effectiveDateFrom || filters?.effectiveDateTo) {
    const range: Record<string, Date> = {};
    if (filters?.effectiveDateFrom) range.gte = filters.effectiveDateFrom;
    if (filters?.effectiveDateTo) range.lte = filters.effectiveDateTo;
    where.effectiveDate = range;
  }
  try {
    const rows = await db.regulatoryChangeV2.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
    });
    return (rows as RegulatoryChangeV2[]) || [];
  } catch (err) {
    logger.error("[regulatory-change] listRegulatoryChanges DB error", {
      error: String(err),
      filters,
    });
    return [];
  }
}

// ============ §2.5 getChangesByJurisdiction ============

/**
 * Get all changes for a jurisdiction code, newest first. Returns [] on
 * DB error. Never throws.
 */
export async function getChangesByJurisdiction(
  jurisdictionCode: string,
): Promise<RegulatoryChangeV2[]> {
  const jc = String(jurisdictionCode || "").toUpperCase().trim();
  if (!jc) return [];
  try {
    const rows = await db.regulatoryChangeV2.findMany({
      where: { jurisdictionCode: jc },
      orderBy: [{ createdAt: "desc" }],
    });
    return (rows as RegulatoryChangeV2[]) || [];
  } catch (err) {
    logger.error("[regulatory-change] getChangesByJurisdiction DB error", {
      error: String(err),
      jurisdictionCode: jc,
    });
    return [];
  }
}

// ============ §2.6 getChangesByStatus ============

/**
 * Get all changes at a specific pipeline status (e.g. all DETECTED changes
 * awaiting verification). Returns [] on DB error. Never throws.
 */
export async function getChangesByStatus(
  pipelineStatus: string,
): Promise<RegulatoryChangeV2[]> {
  if (!pipelineStatus) return [];
  try {
    const rows = await db.regulatoryChangeV2.findMany({
      where: { pipelineStatus },
      orderBy: [{ createdAt: "asc" }],
    });
    return (rows as RegulatoryChangeV2[]) || [];
  } catch (err) {
    logger.error("[regulatory-change] getChangesByStatus DB error", {
      error: String(err),
      pipelineStatus,
    });
    return [];
  }
}

// ============ §2.7 getPendingChanges ============

/**
 * Get all changes not yet DEPLOYED (i.e. still progressing through the
 * pipeline). Excludes terminal statuses (DEPLOYED, REJECTED, ROLLED_BACK).
 * Returns [] on DB error. Never throws.
 */
export async function getPendingChanges(): Promise<RegulatoryChangeV2[]> {
  const pendingStatuses = [
    "DETECTED",
    "VERIFIED",
    "IMPACTED",
    "SIMULATED",
    "APPROVED",
    "COMPILED",
  ];
  try {
    const rows = await db.regulatoryChangeV2.findMany({
      where: { pipelineStatus: { in: pendingStatuses } },
      orderBy: [{ createdAt: "asc" }],
    });
    return (rows as RegulatoryChangeV2[]) || [];
  } catch (err) {
    logger.error("[regulatory-change] getPendingChanges DB error", {
      error: String(err),
    });
    return [];
  }
}

// ============ §2.8 getDeployedChanges ============

/**
 * Get all deployed changes (pipelineStatus=DEPLOYED), newest first.
 * Returns [] on DB error. Never throws.
 */
export async function getDeployedChanges(): Promise<RegulatoryChangeV2[]> {
  try {
    const rows = await db.regulatoryChangeV2.findMany({
      where: { pipelineStatus: "DEPLOYED" },
      orderBy: [{ deployedAt: "desc" }, { createdAt: "desc" }],
    });
    return (rows as RegulatoryChangeV2[]) || [];
  } catch (err) {
    logger.error("[regulatory-change] getDeployedChanges DB error", {
      error: String(err),
    });
    return [];
  }
}

// ============ §2.9 updateChange ============

/**
 * Update editable fields on a change record (title, description, source,
 * effective dates, snapshot policy, etc.). Does NOT change pipelineStatus
 * — use `verifyChange` / `assessImpact` / `simulateChange` / etc. for
 * pipeline transitions. Throws if the change is not found. Throws on DB
 * error.
 */
export async function updateChange(
  changeId: string,
  updates: UpdateChangeInput,
): Promise<RegulatoryChangeV2> {
  if (!changeId) {
    throw new Error("[regulatory-change] changeId is required");
  }
  if (!updates || typeof updates !== "object") {
    throw new Error("[regulatory-change] updates must be an object");
  }
  // Validate snapshotPolicy if provided.
  if (
    updates.snapshotPolicy !== undefined &&
    !(SNAPSHOT_POLICIES as readonly string[]).includes(updates.snapshotPolicy)
  ) {
    throw new Error(
      `[regulatory-change] invalid snapshotPolicy: ${updates.snapshotPolicy}`,
    );
  }
  const data: Record<string, unknown> = {};
  if (updates.title !== undefined) data.title = updates.title;
  if (updates.description !== undefined) data.description = updates.description;
  if (updates.sourceAuthority !== undefined) {
    data.sourceAuthority = updates.sourceAuthority;
  }
  if (updates.sourceUrl !== undefined) data.sourceUrl = updates.sourceUrl;
  if (updates.sourceReference !== undefined) {
    data.sourceReference = updates.sourceReference;
  }
  if (updates.announcedDate !== undefined) data.announcedDate = updates.announcedDate;
  if (updates.effectiveDate !== undefined) data.effectiveDate = updates.effectiveDate;
  if (updates.expiryDate !== undefined) data.expiryDate = updates.expiryDate;
  if (updates.snapshotPolicy !== undefined) {
    data.snapshotPolicy = updates.snapshotPolicy;
  }
  if (updates.rollbackSupported !== undefined) {
    data.rollbackSupported = updates.rollbackSupported;
  }
  if (updates.notes !== undefined) data.notes = updates.notes;
  try {
    const updated = await db.regulatoryChangeV2.update({
      where: { changeId },
      data,
    });
    logger.info("[regulatory-change] change updated", {
      changeId,
      fields: Object.keys(data),
    });
    return updated as RegulatoryChangeV2;
  } catch (err) {
    logger.error("[regulatory-change] updateChange DB error", {
      error: String(err),
      changeId,
    });
    throw err;
  }
}

// ============ §2.10 verifyChange ============

/**
 * Verify a DETECTED change — advance the pipeline DETECTED → VERIFIED.
 * Requires `verifiedBy` + `notes` (the verification summary). Updates
 * the VERIFIED ChangePipelineStep row (status=COMPLETED, actor, notes,
 * completedAt).
 *
 * Throws if the change is not in DETECTED status, or if not found, or on
 * DB error.
 */
export async function verifyChange(
  changeId: string,
  verifiedBy: string,
  notes: string,
): Promise<RegulatoryChangeV2> {
  if (!changeId) {
    throw new Error("[regulatory-change] changeId is required");
  }
  if (!verifiedBy) {
    throw new Error("[regulatory-change] verifiedBy is required");
  }
  const current = await getChangeByChangeId(changeId);
  if (!current) {
    throw new Error(
      `[regulatory-change] change not found: ${changeId}`,
    );
  }
  if (current.pipelineStatus !== "DETECTED") {
    throw new Error(
      `[regulatory-change] change ${changeId} is ${current.pipelineStatus} — only DETECTED changes can be verified`,
    );
  }
  const now = new Date();
  const history = parsePipelineHistory(current.pipelineHistory);
  history.push({
    status: "VERIFIED",
    at: now.toISOString(),
    actor: verifiedBy,
    notes,
  });
  try {
    const updated = await db.regulatoryChangeV2.update({
      where: { changeId },
      data: {
        pipelineStatus: "VERIFIED",
        pipelineHistory: JSON.stringify(history),
        notes: notes || current.notes || null,
      },
    });
    // Update the VERIFIED ChangePipelineStep.
    try {
      await db.changePipelineStep.update({
        where: { changeId_stepName: { changeId, stepName: "VERIFIED" } },
        data: {
          status: "COMPLETED",
          actor: verifiedBy,
          resultSummary: notes,
          startedAt: now,
          completedAt: now,
        },
      });
    } catch (stepErr) {
      logger.error(
        "[regulatory-change] verifyChange step update failed",
        {
          error: String(stepErr),
          changeId,
        },
      );
      // Non-fatal — main row is updated; step can be re-synced by admin.
    }
    logger.info("[regulatory-change] change verified", {
      changeId,
      verifiedBy,
    });
    return updated as RegulatoryChangeV2;
  } catch (err) {
    logger.error("[regulatory-change] verifyChange DB error", {
      error: String(err),
      changeId,
    });
    throw err;
  }
}

// ============ §2.11 assignGovernorDecision ============

/**
 * Link a Governor decision (GovernorDecision.decisionId) to a change.
 * Required for constitutional changes (SANCTIONS, LAW) before they can
 * advance past APPROVED. Throws if the change is not found. Throws on
 * DB error.
 */
export async function assignGovernorDecision(
  changeId: string,
  governorDecisionId: string,
): Promise<RegulatoryChangeV2> {
  if (!changeId) {
    throw new Error("[regulatory-change] changeId is required");
  }
  if (!governorDecisionId) {
    throw new Error("[regulatory-change] governorDecisionId is required");
  }
  const current = await getChangeByChangeId(changeId);
  if (!current) {
    throw new Error(
      `[regulatory-change] change not found: ${changeId}`,
    );
  }
  try {
    const updated = await db.regulatoryChangeV2.update({
      where: { changeId },
      data: { governorDecision: governorDecisionId },
    });
    // If the change is currently at APPROVED step, also stamp the
    // governorDecisionId on the APPROVED ChangePipelineStep row.
    try {
      await db.changePipelineStep.update({
        where: { changeId_stepName: { changeId, stepName: "APPROVED" } },
        data: { governorDecisionId },
      });
    } catch (stepErr) {
      logger.error(
        "[regulatory-change] assignGovernorDecision step update failed",
        { error: String(stepErr), changeId },
      );
    }
    logger.info("[regulatory-change] governor decision assigned", {
      changeId,
      governorDecisionId,
    });
    return updated as RegulatoryChangeV2;
  } catch (err) {
    logger.error("[regulatory-change] assignGovernorDecision DB error", {
      error: String(err),
      changeId,
    });
    throw err;
  }
}

// ============ §2.12 assignMultisigApproval ============

/**
 * Link a multisig approval reference to a change. Required for
 * constitutional changes (SANCTIONS, LAW) before they can advance past
 * APPROVED. Throws if the change is not found. Throws on DB error.
 */
export async function assignMultisigApproval(
  changeId: string,
  multisigRef: string,
): Promise<RegulatoryChangeV2> {
  if (!changeId) {
    throw new Error("[regulatory-change] changeId is required");
  }
  if (!multisigRef) {
    throw new Error("[regulatory-change] multisigRef is required");
  }
  const current = await getChangeByChangeId(changeId);
  if (!current) {
    throw new Error(
      `[regulatory-change] change not found: ${changeId}`,
    );
  }
  try {
    const updated = await db.regulatoryChangeV2.update({
      where: { changeId },
      data: { multisigApproval: multisigRef },
    });
    try {
      await db.changePipelineStep.update({
        where: { changeId_stepName: { changeId, stepName: "APPROVED" } },
        data: { multisigRef },
      });
    } catch (stepErr) {
      logger.error(
        "[regulatory-change] assignMultisigApproval step update failed",
        { error: String(stepErr), changeId },
      );
    }
    logger.info("[regulatory-change] multisig approval assigned", {
      changeId,
      multisigRef,
    });
    return updated as RegulatoryChangeV2;
  } catch (err) {
    logger.error("[regulatory-change] assignMultisigApproval DB error", {
      error: String(err),
      changeId,
    });
    throw err;
  }
}

// ============ §2.13 rejectChange (helper, off-ramp) ============

/**
 * Reject a change — move pipeline to REJECTED (off-ramp). Allowed from
 * DETECTED or VERIFIED. Updates the current forward step's status to
 * REJECTED + records the reason. Throws if the change is already past
 * IMPACTED (must use rollbackChange instead) or not found.
 */
export async function rejectChange(
  changeId: string,
  rejectedBy: string,
  reason: string,
): Promise<RegulatoryChangeV2> {
  if (!changeId) {
    throw new Error("[regulatory-change] changeId is required");
  }
  if (!rejectedBy) {
    throw new Error("[regulatory-change] rejectedBy is required");
  }
  const current = await getChangeByChangeId(changeId);
  if (!current) {
    throw new Error(
      `[regulatory-change] change not found: ${changeId}`,
    );
  }
  if (
    current.pipelineStatus !== "DETECTED" &&
    current.pipelineStatus !== "VERIFIED" &&
    current.pipelineStatus !== "IMPACTED" &&
    current.pipelineStatus !== "SIMULATED"
  ) {
    throw new Error(
      `[regulatory-change] cannot reject from ${current.pipelineStatus} — rejection is only allowed before APPROVED`,
    );
  }
  const now = new Date();
  const history = parsePipelineHistory(current.pipelineHistory);
  history.push({
    status: "REJECTED",
    at: now.toISOString(),
    actor: rejectedBy,
    notes: reason,
  });
  try {
    const updated = await db.regulatoryChangeV2.update({
      where: { changeId },
      data: {
        pipelineStatus: "REJECTED",
        pipelineHistory: JSON.stringify(history),
        notes: `Rejected: ${reason}`,
      },
    });
    // Mark the current forward step as REJECTED.
    try {
      const currentStepOrder = getStepOrder(current.pipelineStatus);
      if (currentStepOrder > 0) {
        const stepName = current.pipelineStatus;
        await db.changePipelineStep.update({
          where: { changeId_stepName: { changeId, stepName } },
          data: {
            status: "REJECTED",
            actor: rejectedBy,
            resultSummary: `Rejected: ${reason}`,
            completedAt: now,
          },
        });
      }
    } catch (stepErr) {
      logger.error(
        "[regulatory-change] rejectChange step update failed",
        { error: String(stepErr), changeId },
      );
    }
    logger.info("[regulatory-change] change rejected", {
      changeId,
      rejectedBy,
      reason,
    });
    return updated as RegulatoryChangeV2;
  } catch (err) {
    logger.error("[regulatory-change] rejectChange DB error", {
      error: String(err),
      changeId,
    });
    throw err;
  }
}

// ============ §2.14 getPipelineSteps (helper) ============

/**
 * Get all 7 ChangePipelineStep rows for a change, ordered by stepOrder.
 * Returns [] on DB error or if the change is not found. Never throws.
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
    logger.error("[regulatory-change] getPipelineSteps DB error", {
      error: String(err),
      changeId,
    });
    return [];
  }
}

// ============ §2.15 isConstitutionallyApproved (helper) ============

/**
 * Check if a constitutional change (SANCTIONS, LAW) has both a Governor
 * decision AND a multisig approval assigned. Non-constitutional changes
 * always return true (they don't require these). Returns false on DB
 * error. Never throws.
 */
export async function isConstitutionallyApproved(
  changeId: string,
): Promise<boolean> {
  if (!changeId) return false;
  const change = await getChangeByChangeId(changeId);
  if (!change) return false;
  if (!isConstitutionalCategory(change.changeCategory)) return true;
  return !!change.governorDecision && !!change.multisigApproval;
}

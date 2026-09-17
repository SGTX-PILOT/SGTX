// @ts-nocheck
// SGTX Phase 4 §5 — Multi-Agency Workflow Engine
// ---------------------------------------------------------------------------
// Orchestrates the sequential / parallel / conditional / risk-triggered /
// optional clearance workflow across the government agencies that must
// authorise a trade: CUSTOMS → AGRICULTURE → HEALTH → STANDARDS → SECURITY →
// RELEASE (the §5 canonical example), or a parallel subset where permitted.
//
// Workflow + step model:
//   • A MultiAgencyWorkflow row binds (jurisdictionCode × operationType ×
//     transportMode) to an ordered list of WorkflowStep rows.
//   • Each step is one agency clearance, with:
//       - order               sequence number (lower runs first)
//       - agency              CUSTOMS | AGRICULTURE | HEALTH | STANDARDS |
//                            SECURITY | PORT | BANK | TAX | CENTRAL_BANK
//       - executionMode       SEQUENTIAL | PARALLEL | CONDITIONAL |
//                            RISK_TRIGGERED | OPTIONAL
//       - parallelGroup      group id (steps with the same non-null group
//                            execute in parallel)
//       - condition           JSON expression for CONDITIONAL steps
//       - riskTrigger         JSON risk rule for RISK_TRIGGERED steps
//       - optional            flag for OPTIONAL steps
//
// Execution model (`executeWorkflow`):
//   1. Load the workflow + steps ordered by `order`.
//   2. Walk the steps in order; group consecutive steps by `parallelGroup`
//      (steps sharing a non-null parallelGroup execute together via
//      Promise.allSettled so a failure in one parallel step does NOT crash
//      the others).
//   3. For each step, first decide whether to RUN or SKIP based on its
//      executionMode:
//        SEQUENTIAL / PARALLEL → always run.
//        CONDITIONAL → run iff `evaluateCondition(condition, tradeContext)`
//                      returns true; else mark SKIPPED.
//        RISK_TRIGGERED → run iff `evaluateRiskTrigger(riskTrigger, tradeContext)`
//                         returns true; else mark SKIPPED.
//        OPTIONAL → run iff `tradeContext.optionalSteps` includes the step
//                   id (or its agency); else mark SKIPPED.
//   4. To RUN a step: create a CustomsOperationV2 via the customs engine
//      (createCustomsOperation) then submit it (submitCustomsOperation),
//      passing the step's connectorId. The gateway response determines the
//      step's next authoritative status (SUBMITTED → GOVERNMENT_ACCEPTED /
//      GOVERNMENT_REJECTED / GOVERNMENT_HOLD). GOVERNMENT_RELEASED is only
//      ever set by `recordRelease` (§4) — never by the workflow engine.
//   5. Compute the top-level WorkflowExecutionResult:
//        BLOCKED    if any step REJECTED.
//        ON_HOLD    if any step HOLD (and none REJECTED).
//        COMPLETED  if all steps GOVERNMENT_RELEASED (or SKIPPED).
//        IN_PROGRESS otherwise.
//
// Design rules (mandatory per SGTX convention):
//   • // @ts-nocheck at the top.
//   • Every DB call wrapped in try/catch with safe defaults (return null /
//     [] / a stub on failure; never throws).
//   • `executeWorkflow` uses Promise.allSettled for parallel steps so a
//     single failure does NOT crash the group.
//   • Uses `import { db } from "@/lib/db"` and
//     `import { logger } from "@/lib/sgtx/logger"`.
//   • Submits via `submitCustomsOperation` and creates operations via
//     `createCustomsOperation` from `@/lib/sgtx/customs-engine`.

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import {
  createCustomsOperation,
  submitCustomsOperation,
} from "@/lib/sgtx/customs-engine";

// ============ Module constants ============

/**
 * The 5 step execution modes per §5. Drives how `executeWorkflow` decides
 * whether to run, skip, or parallelise a step.
 */
export const STEP_EXECUTION_MODES = [
  "SEQUENTIAL",
  "PARALLEL",
  "CONDITIONAL",
  "RISK_TRIGGERED",
  "OPTIONAL",
] as const;

/**
 * The 8 step statuses (the workflow-level status of a step). Mirrors the
 * §4 government-authoritative lifecycle plus the workflow-only states
 * PENDING / IN_PROGRESS / SKIPPED.
 */
export const STEP_STATUSES = [
  "PENDING",
  "IN_PROGRESS",
  "SUBMITTED",
  "GOVERNMENT_ACCEPTED",
  "GOVERNMENT_REJECTED",
  "GOVERNMENT_HOLD",
  "GOVERNMENT_RELEASED",
  "SKIPPED",
] as const;

/** Steps in one of these statuses are considered "terminal-released" for
 * the purposes of `isWorkflowComplete`. */
const RELEASED_OR_SKIPPED = new Set(["GOVERNMENT_RELEASED", "SKIPPED"]);

/** Steps considered "in-flight" for the ON_HOLD / IN_PROGRESS verdict. */
const IN_FLIGHT = new Set([
  "PENDING",
  "IN_PROGRESS",
  "SUBMITTED",
  "GOVERNMENT_ACCEPTED",
  "GOVERNMENT_HOLD",
]);

// ============ Exported interfaces ============

export interface CreateWorkflowInput {
  name: string;
  description?: string;
  jurisdictionId?: string;
  jurisdictionCode: string;
  transportMode?: string;
  operationType?: string;
  triggerConditions?: any[];
  active?: boolean;
  version?: number;
}

export interface AddStepInput {
  workflowId: string;
  order: number;
  agency: string;
  authority?: string;
  systemName?: string;
  connectorId?: string;
  executionMode?: string;
  parallelGroup?: string;
  condition?: any;
  riskTrigger?: any;
  optional?: boolean;
}

export interface TradeContext {
  ustn?: string;
  tradeId?: string;
  jurisdictionCode: string;
  operationType: string;
  transportMode?: string;
  hs6?: string;
  originCountry?: string;
  destCountry?: string;
  applicantGtid?: string;
  brokerGtid?: string;
  canonicalData?: any;
  optionalSteps?: string[];
  riskFlags?: {
    highRiskOrigin?: boolean;
    sanctionedEntity?: boolean;
    controlledGoods?: boolean;
  };
}

export interface StepResult {
  stepId: string;
  agency: string;
  executionMode: string;
  status: string;
  governmentReference?: string;
  customsOperationId?: string;
  error?: string;
  skipped?: boolean;
}

export interface WorkflowExecutionResult {
  workflowId: string;
  steps: StepResult[];
  topStatus: "COMPLETED" | "IN_PROGRESS" | "BLOCKED" | "REJECTED" | "ON_HOLD";
  completedCount: number;
  pendingCount: number;
  rejectedCount: number;
  holdCount: number;
}

// ============ Internal helpers ============

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function jsonStringify(v: unknown): string | null {
  try {
    const s = JSON.stringify(v ?? null);
    if (!s) return null;
    return s;
  } catch {
    return null;
  }
}

function parseJson<T = any>(raw: unknown, fallback: T): T {
  if (raw == null) return fallback;
  if (typeof raw === "object") return raw as T;
  if (typeof raw !== "string") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * `evaluateCondition` — evaluate a JSON condition expression against a
 * trade context. Returns true if the condition holds.
 *
 * Supported shapes:
 *   • { field: "originCountry", op: "in", value: ["CN","RU"] }
 *   • { field: "hs6", op: "startsWith", value: "0703" }
 *   • { op: "and", conditions: [..] }
 *   • { op: "or",  conditions: [..] }
 *   • { op: "not", condition: {..} }
 *   • { op: "riskFlag", flag: "highRiskOrigin" }
 *
 * Supported operators on a field:
 *   eq | ne | in | not_in | gt | lt | gte | lte | contains | startsWith |
 *   endsWith | exists
 *
 * Defensive — never throws; malformed expressions return false.
 */
export function evaluateCondition(condition: any, ctx: TradeContext): boolean {
  if (condition == null) return true; // no condition → always true
  if (typeof condition === "boolean") return condition;
  if (typeof condition !== "object") return false;

  const op = str(condition.op) || "eq";

  // Boolean combiners.
  if (op === "and" || op === "all") {
    const list = Array.isArray(condition.conditions) ? condition.conditions : [];
    return list.every((c: any) => evaluateCondition(c, ctx));
  }
  if (op === "or" || op === "any") {
    const list = Array.isArray(condition.conditions) ? condition.conditions : [];
    return list.some((c: any) => evaluateCondition(c, ctx));
  }
  if (op === "not") {
    return !evaluateCondition(condition.condition, ctx);
  }
  if (op === "riskFlag") {
    const flag = str(condition.flag);
    const flags = (ctx?.riskFlags || {}) as Record<string, boolean>;
    return flags[flag] === true;
  }
  if (op === "optionalRequested") {
    const stepAgency = str(condition.agency);
    const list = Array.isArray(ctx?.optionalSteps) ? ctx.optionalSteps! : [];
    if (stepAgency && list.includes(stepAgency)) return true;
    return false;
  }

  // Field comparison.
  const fieldPath = str(condition.field);
  if (!fieldPath) return false;
  const actual = getCtxValue(ctx, fieldPath);
  const expected = condition.value;

  switch (op) {
    case "eq":
      return String(actual ?? "") === String(expected ?? "");
    case "ne":
      return String(actual ?? "") !== String(expected ?? "");
    case "in":
      return Array.isArray(expected) && expected.map((v: any) => String(v)).includes(String(actual ?? ""));
    case "not_in":
      return Array.isArray(expected) && !expected.map((v: any) => String(v)).includes(String(actual ?? ""));
    case "gt":
      return Number(actual) > Number(expected);
    case "lt":
      return Number(actual) < Number(expected);
    case "gte":
      return Number(actual) >= Number(expected);
    case "lte":
      return Number(actual) <= Number(expected);
    case "contains":
      return String(actual ?? "").includes(String(expected ?? ""));
    case "startsWith":
      return String(actual ?? "").startsWith(String(expected ?? ""));
    case "endsWith":
      return String(actual ?? "").endsWith(String(expected ?? ""));
    case "exists":
      return actual !== undefined && actual !== null && actual !== "";
    default:
      return false;
  }
}

/** Look up a (possibly dotted) field on the TradeContext. */
function getCtxValue(ctx: TradeContext, path: string): any {
  if (!ctx || typeof path !== "string" || path === "") return undefined;
  // Direct top-level property first (most common case).
  if (path.indexOf(".") === -1) {
    return (ctx as Record<string, any>)[path];
  }
  const parts = path.split(".");
  let node: any = ctx;
  for (const p of parts) {
    if (node == null) return undefined;
    node = (node as Record<string, any>)[p];
  }
  return node;
}

/**
 * `evaluateRiskTrigger` — a RISK_TRIGGERED step executes iff its risk rule
 * fires. The rule may either be:
 *   • A `condition` shape (delegated to evaluateCondition), OR
 *   • A `riskFlags` short-form `{ highRiskOrigin: true, sanctionedEntity: true }`,
 *     where ANY true flag triggers the step.
 *   • A `originIn` short-form `{ originIn: ["CN","RU","IR","KP"] }` where
 *     membership in the list triggers the step.
 *
 * Defensive — never throws; malformed rules return false.
 */
export function evaluateRiskTrigger(rule: any, ctx: TradeContext): boolean {
  if (rule == null) return false;
  if (typeof rule === "boolean") return rule;
  if (typeof rule !== "object") return false;

  // condition shape → reuse evaluateCondition.
  if (rule.op || rule.field || rule.conditions) {
    return evaluateCondition(rule, ctx);
  }

  // riskFlags short-form: any true flag fires.
  if (rule.riskFlags && typeof rule.riskFlags === "object") {
    const flags = (ctx?.riskFlags || {}) as Record<string, boolean>;
    for (const [k, v] of Object.entries(rule.riskFlags)) {
      if (v === true && flags[k] === true) return true;
    }
    return false;
  }

  // originIn short-form.
  if (Array.isArray(rule.originIn)) {
    const origin = str(ctx?.originCountry);
    if (origin && rule.originIn.map((c: any) => str(c)).includes(origin)) return true;
    return false;
  }

  // controlledGoods short-form.
  if (rule.controlledGoods === true) {
    return ctx?.riskFlags?.controlledGoods === true;
  }

  return false;
}

// ============ 1. createWorkflow ============

/**
 * `createWorkflow` — create a new MultiAgencyWorkflow row.
 */
export async function createWorkflow(input: CreateWorkflowInput): Promise<any> {
  if (!input || typeof input !== "object") {
    return { id: `tmp-invalid-${Date.now()}`, _stub: true, error: "invalid input" };
  }
  const name = str(input.name);
  const jurisdictionCode = str(input.jurisdictionCode);
  if (!name) {
    return { id: `tmp-invalid-${Date.now()}`, _stub: true, error: "name is required" };
  }
  if (!jurisdictionCode) {
    return { id: `tmp-invalid-${Date.now()}`, _stub: true, error: "jurisdictionCode is required" };
  }

  const data = {
    name,
    description: str(input.description) || null,
    jurisdictionId: str(input.jurisdictionId) || null,
    jurisdictionCode,
    transportMode: str(input.transportMode) || null,
    operationType: str(input.operationType) || null,
    triggerConditions: jsonStringify(input.triggerConditions ?? null),
    active: input.active !== false,
    version: Number(input.version) || 1,
  };

  try {
    const row = await db.multiAgencyWorkflow.create({ data });
    return row;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.error("[multi-agency] createWorkflow failed", { error: reason });
    return { ...data, id: `tmp-error-${Date.now()}`, _stub: true, error: reason };
  }
}

// ============ 2. addWorkflowStep ============

/**
 * `addWorkflowStep` — append a step to a workflow.
 */
export async function addWorkflowStep(input: AddStepInput): Promise<any> {
  if (!input || typeof input !== "object") {
    return { id: `tmp-invalid-${Date.now()}`, _stub: true, error: "invalid input" };
  }
  const workflowId = str(input.workflowId);
  if (!workflowId) {
    return { id: `tmp-invalid-${Date.now()}`, _stub: true, error: "workflowId is required" };
  }
  const agency = str(input.agency);
  if (!agency) {
    return { id: `tmp-invalid-${Date.now()}`, _stub: true, error: "agency is required" };
  }

  const data = {
    workflowId,
    order: Number(input.order) || 0,
    agency,
    authority: str(input.authority) || null,
    systemName: str(input.systemName) || null,
    connectorId: str(input.connectorId) || null,
    executionMode: str(input.executionMode) || "SEQUENTIAL",
    parallelGroup: str(input.parallelGroup) || null,
    condition: jsonStringify(input.condition ?? null),
    riskTrigger: jsonStringify(input.riskTrigger ?? null),
    optional: input.optional === true,
    status: "PENDING",
  };

  try {
    const row = await db.workflowStep.create({ data });
    return row;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.error("[multi-agency] addWorkflowStep failed", { workflowId, error: reason });
    return { ...data, id: `tmp-error-${Date.now()}`, _stub: true, error: reason };
  }
}

// ============ 3. listWorkflows ============

/**
 * `listWorkflows` — list workflows with optional filters. Returns [] on
 * DB failure.
 */
export async function listWorkflows(filters?: {
  jurisdictionCode?: string;
  operationType?: string;
  transportMode?: string;
  active?: boolean;
}): Promise<any[]> {
  try {
    const where: Record<string, unknown> = {};
    if (filters) {
      if (str(filters.jurisdictionCode)) where.jurisdictionCode = filters.jurisdictionCode;
      if (str(filters.operationType)) where.operationType = filters.operationType;
      if (str(filters.transportMode)) where.transportMode = filters.transportMode;
      if (filters.active === true) where.active = true;
      if (filters.active === false) where.active = false;
    }
    const rows = await db.multiAgencyWorkflow.findMany({
      where,
      orderBy: [{ jurisdictionCode: "asc" }, { name: "asc" }],
      take: 500,
    });
    return rows || [];
  } catch (err) {
    logger.error("[multi-agency] listWorkflows failed", {
      filters,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

// ============ 4. getWorkflow ============

/**
 * `getWorkflow` — fetch a single workflow by id, optionally including its
 * steps (sorted by `order`).
 */
export async function getWorkflow(id: string, includeSteps = true): Promise<any | null> {
  if (!str(id)) return null;
  try {
    const row = await db.multiAgencyWorkflow.findUnique({
      where: { id },
      include: includeSteps
        ? { steps: { orderBy: { order: "asc" } } }
        : undefined,
    });
    return row || null;
  } catch (err) {
    logger.error("[multi-agency] getWorkflow failed", {
      id,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ============ 5. upsertWorkflow ============

/**
 * `upsertWorkflow` — find a workflow by (name, jurisdictionCode) or create
 * it if missing. Returns the upserted row, or a stub on failure.
 */
export async function upsertWorkflow(input: CreateWorkflowInput): Promise<any> {
  if (!input || typeof input !== "object") {
    return { id: `tmp-invalid-${Date.now()}`, _stub: true, error: "invalid input" };
  }
  const name = str(input.name);
  const jurisdictionCode = str(input.jurisdictionCode);
  if (!name || !jurisdictionCode) {
    return {
      id: `tmp-invalid-${Date.now()}`,
      _stub: true,
      error: "name and jurisdictionCode are required",
    };
  }

  try {
    const existing = await db.multiAgencyWorkflow.findFirst({
      where: { name, jurisdictionCode },
    });
    if (existing) {
      return await db.multiAgencyWorkflow.update({
        where: { id: existing.id },
        data: {
          description: str(input.description) || existing.description,
          jurisdictionId: str(input.jurisdictionId) || existing.jurisdictionId,
          transportMode: str(input.transportMode) || existing.transportMode,
          operationType: str(input.operationType) || existing.operationType,
          triggerConditions: jsonStringify(input.triggerConditions ?? null),
          active: input.active !== false,
          version: Number(input.version) || existing.version,
        },
      });
    }
    return await createWorkflow(input);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.error("[multi-agency] upsertWorkflow failed", { error: reason });
    return { id: `tmp-error-${Date.now()}`, _stub: true, error: reason };
  }
}

// ============ 6. deleteWorkflow ============

/**
 * `deleteWorkflow` — delete a workflow.
 *
 * @param id   workflow id.
 * @param hard If false (default), the workflow is soft-marked inactive. If
 *             true, the workflow row (and its steps via cascade) is hard-
 *             deleted.
 */
export async function deleteWorkflow(id: string, hard = false): Promise<boolean> {
  if (!str(id)) return false;
  try {
    if (hard) {
      // Cascade deletes the workflow's steps (FK onDelete: Cascade).
      await db.multiAgencyWorkflow.delete({ where: { id } });
      return true;
    }
    await db.multiAgencyWorkflow.update({
      where: { id },
      data: { active: false },
    });
    return true;
  } catch (err) {
    logger.error("[multi-agency] deleteWorkflow failed", {
      id,
      hard,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

// ============ 7. getWorkflowForTrade ============

/**
 * `getWorkflowForTrade` — find the most-specific active workflow for a
 * trade. Selection precedence (most-specific first):
 *
 *   1. jurisdictionCode + operationType + transportMode
 *   2. jurisdictionCode + operationType
 *   3. jurisdictionCode only
 *
 * Returns null if no active workflow is found at any level.
 */
export async function getWorkflowForTrade(input: {
  jurisdictionCode: string;
  operationType: string;
  transportMode?: string;
}): Promise<any | null> {
  if (!input || !str(input.jurisdictionCode)) return null;
  const jc = input.jurisdictionCode;
  const op = str(input.operationType);
  const tm = str(input.transportMode);

  const attempts: Record<string, unknown>[] = [];
  if (op && tm) {
    attempts.push({
      jurisdictionCode: jc,
      operationType: op,
      transportMode: tm,
      active: true,
    });
  }
  if (op) {
    attempts.push({
      jurisdictionCode: jc,
      operationType: op,
      transportMode: null,
      active: true,
    });
  }
  attempts.push({
    jurisdictionCode: jc,
    operationType: null,
    transportMode: null,
    active: true,
  });

  for (const where of attempts) {
    try {
      const row = await db.multiAgencyWorkflow.findFirst({
        where,
        orderBy: [{ version: "desc" }, { createdAt: "desc" }],
        include: { steps: { orderBy: { order: "asc" } } },
      });
      if (row) {
        logger.debug("[multi-agency] getWorkflowForTrade matched", {
          jurisdictionCode: jc,
          operationType: op,
          transportMode: tm,
          matchLevel: where.operationType && where.transportMode
            ? "OP+TM"
            : where.operationType
              ? "OP"
              : "JC",
          workflowId: row.id,
        });
        return row;
      }
    } catch (err) {
      logger.warn("[multi-agency] getWorkflowForTrade query failed", {
        where,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return null;
}

// ============ 8. executeWorkflow (the core orchestrator) ============

/**
 * `executeWorkflow` — run a multi-agency workflow for a trade context.
 *
 * Algorithm:
 *   1. Load workflow + steps (sorted by `order`).
 *   2. Walk the steps; group consecutive steps with the same non-null
 *      parallelGroup together — those run via `Promise.allSettled`. All
 *      other steps run sequentially.
 *   3. For each step, decide whether to RUN or SKIP based on its
 *      executionMode (CONDITIONAL → evaluate `condition` against the
 *      tradeContext; RISK_TRIGGERED → evaluate `riskTrigger`; OPTIONAL →
 *      check `tradeContext.optionalSteps`).
 *   4. To RUN a step: create a CustomsOperationV2 then submit it via the
 *      customs engine. The gateway response drives the step's next
 *      authoritative status.
 *   5. Compute the top-level status:
 *        BLOCKED     any step GOVERNMENT_REJECTED.
 *        ON_HOLD     any step GOVERNMENT_HOLD (and none REJECTED).
 *        COMPLETED   all steps GOVERNMENT_RELEASED or SKIPPED.
 *        IN_PROGRESS otherwise.
 *
 * Never throws — on internal failure the affected step(s) surface the
 * error in their `error` field but the function returns a result.
 */
export async function executeWorkflow(
  workflowId: string,
  tradeContext: TradeContext,
): Promise<WorkflowExecutionResult> {
  const empty: WorkflowExecutionResult = {
    workflowId: str(workflowId),
    steps: [],
    topStatus: "IN_PROGRESS",
    completedCount: 0,
    pendingCount: 0,
    rejectedCount: 0,
    holdCount: 0,
  };

  if (!str(workflowId) || !tradeContext) {
    return { ...empty, steps: [{ stepId: "", agency: "", executionMode: "", status: "GOVERNMENT_REJECTED", error: "missing workflowId or tradeContext" }] };
  }

  const wf = await getWorkflow(workflowId, true);
  if (!wf) {
    return {
      ...empty,
      steps: [{
        stepId: "",
        agency: "",
        executionMode: "",
        status: "GOVERNMENT_REJECTED",
        error: `workflow ${workflowId} not found`,
      }],
    };
  }

  const steps: any[] = Array.isArray(wf.steps) ? wf.steps : [];
  if (steps.length === 0) {
    return { ...empty, topStatus: "COMPLETED" };
  }

  // Group consecutive steps by parallelGroup.
  const groups: { parallel: boolean; steps: any[] }[] = [];
  for (const step of steps) {
    const pg = str(step.parallelGroup);
    const last = groups[groups.length - 1];
    if (pg && last && last.parallel && str(last.steps[0]?.parallelGroup) === pg) {
      last.steps.push(step);
    } else {
      groups.push({ parallel: !!pg, steps: [step] });
    }
  }

  const results: StepResult[] = [];
  for (const group of groups) {
    if (group.parallel && group.steps.length > 1) {
      // Parallel execution via Promise.allSettled so a single failure
      // does NOT crash the others.
      const settled = await Promise.allSettled(
        group.steps.map((s) => runStep(s, wf, tradeContext)),
      );
      for (let i = 0; i < settled.length; i++) {
        const s = settled[i];
        if (s.status === "fulfilled") results.push(s.value as StepResult);
        else {
          results.push({
            stepId: str(group.steps[i]?.id),
            agency: str(group.steps[i]?.agency),
            executionMode: str(group.steps[i]?.executionMode),
            status: "GOVERNMENT_REJECTED",
            error: s.reason instanceof Error ? s.reason.message : String(s.reason),
          });
        }
      }
    } else {
      // Sequential (or single-step "parallel" group — treat as sequential).
      for (const step of group.steps) {
        const r = await runStep(step, wf, tradeContext);
        results.push(r);
      }
    }
  }

  // Compute top-level status.
  const rejectedCount = results.filter((r) => r.status === "GOVERNMENT_REJECTED").length;
  const holdCount = results.filter((r) => r.status === "GOVERNMENT_HOLD").length;
  const completedCount = results.filter(
    (r) => r.status === "GOVERNMENT_RELEASED" || r.skipped === true,
  ).length;
  const pendingCount = results.filter((r) => IN_FLIGHT.has(r.status)).length;

  let topStatus: WorkflowExecutionResult["topStatus"] = "IN_PROGRESS";
  if (rejectedCount > 0) topStatus = "BLOCKED";
  else if (holdCount > 0) topStatus = "ON_HOLD";
  else if (completedCount === results.length) topStatus = "COMPLETED";
  // If none rejected/hold and not all complete → IN_PROGRESS.

  logger.info("[multi-agency] executeWorkflow done", {
    workflowId,
    stepCount: results.length,
    topStatus,
    rejectedCount,
    holdCount,
    completedCount,
  });

  return {
    workflowId,
    steps: results,
    topStatus,
    completedCount,
    pendingCount,
    rejectedCount,
    holdCount,
  };
}

/**
 * `runStep` — execute one workflow step. Decides RUN vs SKIP based on the
 * step's executionMode, then (if running) creates + submits a customs
 * operation via the customs engine.
 */
async function runStep(step: any, workflow: any, ctx: TradeContext): Promise<StepResult> {
  const stepId = str(step.id);
  const agency = str(step.agency);
  const executionMode = str(step.executionMode) || "SEQUENTIAL";

  const baseResult: StepResult = {
    stepId,
    agency,
    executionMode,
    status: "PENDING",
  };

  // Mark IN_PROGRESS as soon as we touch the step.
  await safeUpdateStep(stepId, { status: "IN_PROGRESS" }).catch(() => {});

  // Evaluate RUN vs SKIP.
  let shouldRun = true;
  let skipReason = "";

  if (executionMode === "CONDITIONAL") {
    const cond = parseJson<any>(step.condition, null);
    shouldRun = evaluateCondition(cond, ctx);
    if (!shouldRun) skipReason = "condition evaluated false";
  } else if (executionMode === "RISK_TRIGGERED") {
    const rule = parseJson<any>(step.riskTrigger, null);
    shouldRun = evaluateRiskTrigger(rule, ctx);
    if (!shouldRun) skipReason = "risk trigger not fired";
  } else if (executionMode === "OPTIONAL") {
    const opt = Array.isArray(ctx?.optionalSteps) ? ctx.optionalSteps! : [];
    // Match on step id OR agency name.
    shouldRun = opt.includes(stepId) || opt.includes(agency);
    if (!shouldRun) skipReason = "optional step not requested";
  }

  if (!shouldRun) {
    await safeUpdateStep(stepId, { status: "SKIPPED" }).catch(() => {});
    logger.debug("[multi-agency] step skipped", { stepId, agency, reason: skipReason });
    return { ...baseResult, status: "SKIPPED", skipped: true };
  }

  // We're running. Validate the connector.
  const connectorId = str(step.connectorId);
  if (!connectorId) {
    const err = `step ${agency} has no connectorId — cannot submit`;
    logger.warn("[multi-agency] runStep missing connector", { stepId, agency });
    await safeUpdateStep(stepId, {
      status: "GOVERNMENT_REJECTED",
      rejectionReason: err,
      rejectedAt: new Date(),
    }).catch(() => {});
    return { ...baseResult, status: "GOVERNMENT_REJECTED", error: err };
  }

  // Create the CustomsOperationV2 row for this step.
  let operation: any;
  try {
    operation = await createCustomsOperation({
      ustn: ctx.ustn,
      tradeId: ctx.tradeId,
      operationType: str(workflow.operationType) || str(ctx.operationType) || "IMPORT",
      jurisdictionCode: str(workflow.jurisdictionCode) || str(ctx.jurisdictionCode),
      customsAuthority: str(step.authority) || agency,
      customsOffice: null,
      procedure: null,
      declaration: ctx.canonicalData ?? {},
      brokerGtid: ctx.brokerGtid,
      transportMode: str(workflow.transportMode) || str(ctx.transportMode),
      workflowId: str(workflow.id),
      workflowStepId: stepId,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.error("[multi-agency] createCustomsOperation failed", { stepId, agency, error: reason });
    await safeUpdateStep(stepId, {
      status: "GOVERNMENT_REJECTED",
      rejectionReason: `createCustomsOperation failed: ${reason}`,
      rejectedAt: new Date(),
    }).catch(() => {});
    return { ...baseResult, status: "GOVERNMENT_REJECTED", error: reason };
  }

  const operationId = str(operation?.id);
  // Link the operation back to the step (best effort).
  if (operationId) {
    await safeUpdateStep(stepId, {
      customsOperationId: operationId,
      status: "IN_PROGRESS",
    }).catch(() => {});
  }

  // Build an idempotency key so we can safely retry.
  const idempotencyKey = `wf-${str(workflow.id)}-step-${stepId}-ustn-${str(ctx.ustn) || "no-ustn"}`;

  // Mark SUBMITTED before invoking the gateway so a crash mid-flight leaves
  // the step in a recoverable state.
  await safeUpdateStep(stepId, { status: "SUBMITTED", submittedAt: new Date() }).catch(() => {});

  // Submit via the customs engine → gateway.
  let nextStatus = "GOVERNMENT_REJECTED";
  let governmentReference: string | undefined;
  let errMsg: string | undefined;
  try {
    const result = await submitCustomsOperation(operationId, connectorId, idempotencyKey);
    if (result?.operation) operation = result.operation;
    if (result?.gatewayResult?.governmentReference) {
      governmentReference = str(result.gatewayResult.governmentReference);
    }
    switch (str(result?.gatewayResult?.status)) {
      case "GOVERNMENT_ACCEPTED":
        nextStatus = "GOVERNMENT_ACCEPTED";
        break;
      case "GOVERNMENT_HOLD":
        nextStatus = "GOVERNMENT_HOLD";
        break;
      case "GOVERNMENT_REJECTED":
        nextStatus = "GOVERNMENT_REJECTED";
        errMsg = str(result?.gatewayResult?.error) || "rejected by government system";
        break;
      case "DUPLICATE":
        // Duplicate — the original submission is the authoritative one.
        // Leave the step in SUBMITTED so the operator can investigate.
        nextStatus = "SUBMITTED";
        errMsg = "duplicate submission detected — original is authoritative";
        break;
      default:
        // Unknown status — keep SUBMITTED; surface error if any.
        nextStatus = "SUBMITTED";
        if (result?.ok === false) errMsg = str(result?.error) || "gateway returned no status";
        break;
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.error("[multi-agency] submitCustomsOperation threw", { stepId, agency, error: reason });
    nextStatus = "GOVERNMENT_REJECTED";
    errMsg = `submitCustomsOperation threw: ${reason}`;
  }

  // Persist the step status.
  const update: Record<string, unknown> = { status: nextStatus };
  if (governmentReference) update.governmentReference = governmentReference;
  if (nextStatus === "GOVERNMENT_ACCEPTED") update.acceptedAt = new Date();
  if (nextStatus === "GOVERNMENT_REJECTED") {
    update.rejectedAt = new Date();
    update.rejectionReason = errMsg || "rejected by government system";
  }
  if (nextStatus === "GOVERNMENT_HOLD") {
    update.holdAt = new Date();
    update.holdReason = errMsg || "government hold";
  }
  await safeUpdateStep(stepId, update).catch(() => {});

  return {
    ...baseResult,
    status: nextStatus,
    governmentReference,
    customsOperationId: operationId,
    error: errMsg,
  };
}

/** Best-effort step update — never throws. */
async function safeUpdateStep(stepId: string, data: Record<string, unknown>): Promise<void> {
  if (!str(stepId)) return;
  try {
    await db.workflowStep.update({ where: { id: stepId }, data });
  } catch (err) {
    logger.warn("[multi-agency] safeUpdateStep failed", {
      stepId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ============ 9. getWorkflowStepStatus ============

/**
 * `getWorkflowStepStatus` — fetch a single WorkflowStep by id.
 */
export async function getWorkflowStepStatus(stepId: string): Promise<any | null> {
  if (!str(stepId)) return null;
  try {
    const row = await db.workflowStep.findUnique({ where: { id: stepId } });
    return row || null;
  } catch (err) {
    logger.error("[multi-agency] getWorkflowStepStatus failed", {
      stepId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ============ 10. transitionStepStatus ============

/**
 * `transitionStepStatus` — update a step's status (with optional
 * government reference + reason). Used by callers that poll the gateway
 * externally and need to push the result back into the step.
 *
 * NOTE: this function does NOT enforce the §4 release rule (only
 * `recordRelease` on the customs engine does that). Callers wishing to
 * mark a step as GOVERNMENT_RELEASED should go through the customs engine
 * → `recordRelease` so the releaseReference is recorded on the linked
 * CustomsOperationV2 first; the customs engine's `recordRelease` already
 * cascades the released state to the linked WorkflowStep.
 */
export async function transitionStepStatus(
  stepId: string,
  newStatus: string,
  governmentReference?: string,
  reason?: string,
): Promise<any> {
  if (!str(stepId)) {
    throw new Error("stepId is required");
  }
  const target = str(newStatus);
  if (!target) {
    throw new Error("newStatus is required");
  }

  const update: Record<string, unknown> = { status: target };
  if (str(governmentReference)) update.governmentReference = str(governmentReference);
  if (target === "SUBMITTED") update.submittedAt = new Date();
  if (target === "GOVERNMENT_ACCEPTED") update.acceptedAt = new Date();
  if (target === "GOVERNMENT_REJECTED") {
    update.rejectedAt = new Date();
    update.rejectionReason = str(reason) || "rejected by government system";
  }
  if (target === "GOVERNMENT_HOLD") {
    update.holdAt = new Date();
    update.holdReason = str(reason) || "government hold";
  }
  if (target === "GOVERNMENT_RELEASED") update.releasedAt = new Date();

  try {
    const updated = await db.workflowStep.update({
      where: { id: stepId },
      data: update,
    });
    return updated;
  } catch (err) {
    const reason2 = err instanceof Error ? err.message : String(err);
    logger.error("[multi-agency] transitionStepStatus failed", { stepId, target, error: reason2 });
    throw new Error(`transitionStepStatus failed: ${reason2}`);
  }
}

// ============ 11. isWorkflowComplete ============

/**
 * `isWorkflowComplete` — true iff every non-optional step is either
 * GOVERNMENT_RELEASED or SKIPPED (skipped because its condition was false
 * or its risk trigger was not fired). Optional steps are ignored if they
 * are PENDING (their presence is by definition optional).
 */
export async function isWorkflowComplete(workflowId: string): Promise<boolean> {
  if (!str(workflowId)) return false;
  let steps: any[] = [];
  try {
    const wf = await db.multiAgencyWorkflow.findUnique({
      where: { id: workflowId },
      include: { steps: true },
    });
    if (!wf) return false;
    steps = Array.isArray(wf.steps) ? wf.steps : [];
  } catch (err) {
    logger.error("[multi-agency] isWorkflowComplete failed", {
      workflowId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }

  if (steps.length === 0) return true;

  for (const step of steps) {
    const optional = step.optional === true;
    const status = str(step.status);
    if (RELEASED_OR_SKIPPED.has(status)) continue;
    if (optional && status === "PENDING") continue; // optional + not started → fine
    return false;
  }
  return true;
}

// ============ 12. getWorkflowProgress ============

/**
 * `getWorkflowProgress` — progress summary for a workflow.
 *
 * @returns { total, completed, pending, rejected, hold, skipped, progressPct }
 *   where progressPct = (completed + skipped) / total * 100.
 */
export async function getWorkflowProgress(workflowId: string): Promise<{
  total: number;
  completed: number;
  pending: number;
  rejected: number;
  hold: number;
  skipped: number;
  progressPct: number;
}> {
  const empty = { total: 0, completed: 0, pending: 0, rejected: 0, hold: 0, skipped: 0, progressPct: 0 };
  if (!str(workflowId)) return empty;

  let steps: any[] = [];
  try {
    const wf = await db.multiAgencyWorkflow.findUnique({
      where: { id: workflowId },
      include: { steps: true },
    });
    if (!wf) return empty;
    steps = Array.isArray(wf.steps) ? wf.steps : [];
  } catch (err) {
    logger.error("[multi-agency] getWorkflowProgress failed", {
      workflowId,
      error: err instanceof Error ? err.message : String(err),
    });
    return empty;
  }

  const total = steps.length;
  let completed = 0;
  let pending = 0;
  let rejected = 0;
  let hold = 0;
  let skipped = 0;
  for (const step of steps) {
    const status = str(step.status);
    if (status === "GOVERNMENT_RELEASED") completed++;
    else if (status === "SKIPPED") skipped++;
    else if (status === "GOVERNMENT_REJECTED") rejected++;
    else if (status === "GOVERNMENT_HOLD") hold++;
    else pending++; // PENDING / IN_PROGRESS / SUBMITTED / GOVERNMENT_ACCEPTED
  }
  const progressPct = total === 0 ? 100 : Math.round(((completed + skipped) / total) * 100);
  return { total, completed, pending, rejected, hold, skipped, progressPct };
}

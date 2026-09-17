// @ts-nocheck
// SGTX Governor Gates — Government (Phase 4) §G-G1..G-G6
// ---------------------------------------------------------------------------
// Six advisory Governor gates that validate the government-side state of a
// trade:
//
//   G-G1  gateGovernmentAuthoritativeStatus — is the customs operation in a
//                                             government-released state (or
//                                             in-flight / on-hold / rejected)?
//   G-G2  gateConnectorReadiness            — is the connector registered
//                                             + connected + production-ready?
//   G-G3  gateReleaseAuthority               — §4 CRITICAL — SGTX must NEVER
//                                             fabricate release. Returns ALLOW
//                                             ONLY when ALL THREE are true:
//                                             status=GOVERNMENT_RELEASED +
//                                             releaseReference non-empty +
//                                             releasedAt set.
//   G-G4  gateWorkflowStepStatus             — is a workflow step released /
//                                             in-flight / rejected / skipped?
//   G-G5  gateWorkflowCompletion             — is the WHOLE workflow complete
//                                             (all non-optional steps released
//                                             or skipped)?
//   G-G6  gateGatewayCallHealth              — did the last gateway call
//                                             succeed (DUPLICATE = replayed
//                                             success = ALLOW)?
//
// Each gate returns `{ verdict, conditions }` following the same convention
// as `gates-jurisdiction.ts` / `gates-regulatory.ts` / `gates-compliance.ts`:
//   • verdict: "ALLOW" | "CONDITIONAL" | "DENY"
//   • conditions: list of { id, label, status } for each contributing check
//     where status is one of "ok" | "warn" | "fail" (drives the merged
//     verdict).
//
// Verdict semantics (consistent with §6 Governor integration):
//
//   ALLOW        — the dimension under inspection is fully satisfied (the
//                  operation is released, the connector is production-
//                  connected, the workflow is complete, …). The trade may
//                  proceed on this dimension.
//
//   CONDITIONAL  — the dimension is partially satisfied (operation in-flight,
//                  connector in sandbox / degraded, workflow in-progress,
//                  gateway call retrying). The trade MAY proceed, but with
//                  a warning surfaced to the operator; the conditions array
//                  explains what to address.
//
//   DENY         — hard block on this dimension (operation rejected, connector
//                  in outage, workflow has a rejected step, release without a
//                  reference, gateway call failed). The trade must NOT
//                  proceed until the issue is resolved.
//
// §4 CRITICAL — G-G3 (gateReleaseAuthority) is the gate that enforces the
// blueprint's most important invariant: "Government release is authoritative.
// SGTX must not fabricate release." It returns DENY if ANY of (status =
// GOVERNMENT_RELEASED, releaseReference non-empty, releasedAt set) is missing.
// There is no "CONDITIONAL" path for G-G3 — a partial release is a denied
// release.
//
// These gates are advisory — the Governor orchestrator merges all six
// verdicts (DENY > CONDITIONAL > ALLOW) via `mergeGovernmentGates` into a
// final per-trade decision. They never make autonomous mutations; they only
// read + report.

import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";

// ============ Types (mirror gates-jurisdiction.ts / gates-compliance.ts) ===

export type GateVerdict = "ALLOW" | "CONDITIONAL" | "DENY";

export interface GateCondition {
  /** Stable condition ID for telemetry / dashboards. */
  id: string;
  /** Human-readable label. */
  label: string;
  /** One of: "ok" | "warn" | "fail" — drives the merged verdict. */
  status: string;
}

export interface GateResult {
  verdict: GateVerdict;
  conditions: GateCondition[];
}

// ============ Constants ============

const VERDICT_RANK: Record<GateVerdict, number> = {
  ALLOW: 0,
  CONDITIONAL: 1,
  DENY: 2,
};

/** Connector statuses considered production-ready (G-G2 ALLOW). */
const CONNECTOR_READY = new Set(["PRODUCTION_CONNECTED"]);

/** Connector statuses considered test-mode / degraded (G-G2 CONDITIONAL). */
const CONNECTER_DEGRADED = new Set([
  "SANDBOX_CONNECTED",
  "DEGRADED",
  "PORTAL_ONLY",
  "MANUAL_ONLY",
  "SANDBOX_AVAILABLE",
  "PRODUCTION_READY",
  "CERTIFICATION_PENDING",
]);

/** Connector statuses that block submission entirely (G-G2 DENY). */
const CONNECTOR_BLOCKED = new Set([
  "OUTAGE",
  "DEPRECATED",
  "NOT_DISCOVERED",
  "CONTACT_REQUIRED",
  "CREDENTIALS_REQUIRED",
  "CERTIFICATION_REQUIRED",
]);

/** Government statuses considered "in-flight" for G-G1 / G-G4. */
const IN_FLIGHT_STATUSES = new Set([
  "SUBMITTED",
  "GOVERNMENT_ACCEPTED",
  "GOVERNMENT_HOLD",
]);

/** Workflow-step statuses considered "in-flight" for G-G4. */
const STEP_IN_FLIGHT = new Set([
  "PENDING",
  "IN_PROGRESS",
  "SUBMITTED",
  "GOVERNMENT_ACCEPTED",
  "GOVERNMENT_HOLD",
]);

// ============ Helpers ============

function ok(id: string, label: string): GateCondition {
  return { id, label, status: "ok" };
}
function warn(id: string, label: string): GateCondition {
  return { id, label, status: "warn" };
}
function fail(id: string, label: string): GateCondition {
  return { id, label, status: "fail" };
}

/** Defensive string coercion. */
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
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

// ============ G-G1: Government authoritative status ============

/**
 * G-G1 — Government authoritative status gate.
 *
 * Answers: is this customs operation in a government-released state (or
 * in-flight, or rejected)?
 *
 * Verdict matrix:
 *   • operation is null                         → DENY
 *   • status = GOVERNMENT_RELEASED (with ref)   → ALLOW
 *   • status = SUBMITTED / GOVERNMENT_ACCEPTED /
 *              GOVERNMENT_HOLD                   → CONDITIONAL (in-flight
 *                                                 or on hold)
 *   • status = GOVERNMENT_REJECTED              → DENY
 *   • status = SGTX_READY                       → CONDITIONAL (not yet
 *                                                 submitted)
 *
 * NOTE: this gate is distinct from G-G3 — G-G1 only checks the status field
 * on the operation row. G-G3 is the stricter §4 gate that also requires a
 * release reference + a releasedAt timestamp.
 */
export function gateGovernmentAuthoritativeStatus(operation: any): GateResult {
  const conditions: GateCondition[] = [];

  if (!operation || typeof operation !== "object") {
    conditions.push(
      fail("G-G1-EXISTS", "Customs operation is missing — no authoritative status to check"),
    );
    return { verdict: "DENY", conditions };
  }

  conditions.push(
    ok("G-G1-EXISTS", `Operation ${str(operation.id) || "(no id)"} present`),
  );

  const status = str(operation.status);

  if (status === "GOVERNMENT_RELEASED") {
    // Surface whether a release reference is present (informational — G-G3
    // is the gate that enforces the release-reference rule).
    const release = parseJson<any>(operation.release, {});
    const ref = str(release?.releaseReference);
    if (ref) {
      conditions.push(
        ok("G-G1-RELEASED", `Operation GOVERNMENT_RELEASED with release reference ${ref.slice(0, 12)}…`),
      );
    } else {
      conditions.push(
        warn(
          "G-G1-RELEASED",
          "Operation GOVERNMENT_RELEASED but no release reference recorded — G-G3 will DENY",
        ),
      );
    }
    logger.debug("[gate/G-G1] verdict", { status, verdict: "ALLOW" });
    return { verdict: "ALLOW", conditions };
  }

  if (status === "GOVERNMENT_REJECTED") {
    conditions.push(
      fail(
        "G-G1-REJECTED",
        `Operation GOVERNMENT_REJECTED — ${str(operation.rejectionReason) || "no reason recorded"}`,
      ),
    );
    logger.debug("[gate/G-G1] verdict", { status, verdict: "DENY" });
    return { verdict: "DENY", conditions };
  }

  if (IN_FLIGHT_STATUSES.has(status)) {
    conditions.push(
      warn(
        "G-G1-INFLIGHT",
        `Operation status ${status} — in-flight / on hold with the government`,
      ),
    );
    logger.debug("[gate/G-G1] verdict", { status, verdict: "CONDITIONAL" });
    return { verdict: "CONDITIONAL", conditions };
  }

  if (status === "SGTX_READY" || status === "") {
    conditions.push(
      warn(
        "G-G1-NOT-SUBMITTED",
        "Operation has not yet been submitted to a government system",
      ),
    );
    logger.debug("[gate/G-G1] verdict", { status, verdict: "CONDITIONAL" });
    return { verdict: "CONDITIONAL", conditions };
  }

  // Unknown status — surface as warn.
  conditions.push(
    warn("G-G1-UNKNOWN", `Operation status ${status} — unexpected status value`),
  );
  logger.debug("[gate/G-G1] verdict", { status, verdict: "CONDITIONAL" });
  return { verdict: "CONDITIONAL", conditions };
}

// ============ G-G2: Connector readiness ============

/**
 * G-G2 — Connector readiness gate.
 *
 * Answers: is the connector for this trade's government agency
 * production-ready (or in a state where submission is still possible)?
 *
 * Verdict matrix:
 *   • connector is null                                  → DENY (not registered)
 *   • status = PRODUCTION_CONNECTED                     → ALLOW
 *   • status = SANDBOX_CONNECTED / DEGRADED /
 *              SANDBOX_AVAILABLE / PRODUCTION_READY /
 *              CERTIFICATION_PENDING                     → CONDITIONAL
 *   • status = PORTAL_ONLY / MANUAL_ONLY                 → CONDITIONAL
 *     (operator must submit manually)
 *   • status = OUTAGE / DEPRECATED / NOT_DISCOVERED /
 *              CONTACT_REQUIRED / CREDENTIALS_REQUIRED /
 *              CERTIFICATION_REQUIRED                    → DENY
 *
 * The PORTAL_ONLY / MANUAL_ONLY → CONDITIONAL rule is what lets SGTX keep
 * operating for jurisdictions that have no API at all — the operator
 * submits via the government's portal and records the resulting
 * declaration number back into SGTX manually.
 */
export function gateConnectorReadiness(connector: any): GateResult {
  const conditions: GateCondition[] = [];

  if (!connector || typeof connector !== "object") {
    conditions.push(
      fail("G-G2-EXISTS", "No connector registered for this agency — cannot submit"),
    );
    return { verdict: "DENY", conditions };
  }

  conditions.push(
    ok(
      "G-G2-EXISTS",
      `Connector ${str(connector.systemName) || "(unnamed)"} (${str(connector.authority) || "CUSTOMS"}) registered`,
    ),
  );

  const status = str(connector.status);

  if (CONNECTOR_READY.has(status)) {
    conditions.push(
      ok("G-G2-READY", `Connector status ${status} — production-ready`),
    );
    logger.debug("[gate/G-G2] verdict", { status, verdict: "ALLOW" });
    return { verdict: "ALLOW", conditions };
  }

  if (CONNECTER_DEGRADED.has(status)) {
    if (status === "PORTAL_ONLY" || status === "MANUAL_ONLY") {
      conditions.push(
        warn(
          "G-G2-MANUAL",
          `Connector status ${status} — operator must submit manually and record the result`,
        ),
      );
    } else {
      conditions.push(
        warn(
          "G-G2-DEGRADED",
          `Connector status ${status} — test mode / degraded; submission may be deferred`,
        ),
      );
    }
    logger.debug("[gate/G-G2] verdict", { status, verdict: "CONDITIONAL" });
    return { verdict: "CONDITIONAL", conditions };
  }

  if (CONNECTOR_BLOCKED.has(status)) {
    conditions.push(
      fail(
        "G-G2-BLOCKED",
        `Connector status ${status} — not ready to submit (fix connector first)`,
      ),
    );
    logger.debug("[gate/G-G2] verdict", { status, verdict: "DENY" });
    return { verdict: "DENY", conditions };
  }

  // Unknown status — fail closed.
  conditions.push(
    fail(
      "G-G2-UNKNOWN",
      `Connector status ${status || "(empty)"} — unknown; failing closed`,
    ),
  );
  logger.debug("[gate/G-G2] verdict", { status, verdict: "DENY" });
  return { verdict: "DENY", conditions };
}

// ============ G-G3: Release authority (§4 CRITICAL) ============

/**
 * G-G3 — Release authority gate. **§4 CRITICAL.**
 *
 * The blueprint states: "Government release is authoritative. SGTX must not
 * fabricate release." This gate enforces that invariant. It returns ALLOW
 * ONLY when ALL THREE of the following are true:
 *
 *   1. operation.status === "GOVERNMENT_RELEASED"
 *   2. operation.release.releaseReference is non-empty
 *   3. operation.release.releasedAt is set (truthy, parseable to a date)
 *
 * If ANY of the three is missing, the gate returns DENY. There is NO
 * "CONDITIONAL" path for G-G3 — a partial release is a denied release.
 *
 * This is the gate that downstream systems (cargo release, settlement,
 * dispatch) should consult before acting on a "released" trade.
 */
export function gateReleaseAuthority(operation: any): GateResult {
  const conditions: GateCondition[] = [];

  if (!operation || typeof operation !== "object") {
    conditions.push(
      fail("G-G3-EXISTS", "Operation is missing — cannot verify release authority"),
    );
    return { verdict: "DENY", conditions };
  }

  const status = str(operation.status);
  const release = parseJson<any>(operation.release, {});
  const ref = str(release?.releaseReference);
  const releasedAtRaw = release?.releasedAt ?? operation.releasedAt ?? null;

  // 1. status check.
  if (status !== "GOVERNMENT_RELEASED") {
    conditions.push(
      fail(
        "G-G3-STATUS",
        `Operation status is ${status || "(empty)"} — must be GOVERNMENT_RELEASED`,
      ),
    );
  } else {
    conditions.push(
      ok("G-G3-STATUS", "Operation status is GOVERNMENT_RELEASED"),
    );
  }

  // 2. releaseReference check.
  if (!ref) {
    conditions.push(
      fail(
        "G-G3-RELEASE-REFERENCE",
        "releaseReference is missing — release cannot be verified as government-issued",
      ),
    );
  } else {
    conditions.push(
      ok(
        "G-G3-RELEASE-REFERENCE",
        `releaseReference present (${ref.slice(0, 16)}${ref.length > 16 ? "…" : ""})`,
      ),
    );
  }

  // 3. releasedAt check.
  let releasedAtValid = false;
  if (releasedAtRaw != null) {
    const d = releasedAtRaw instanceof Date ? releasedAtRaw : new Date(releasedAtRaw as any);
    if (!isNaN(d.getTime())) releasedAtValid = true;
  }
  if (!releasedAtValid) {
    conditions.push(
      fail(
        "G-G3-RELEASED-AT",
        "releasedAt is missing or unparseable — release timestamp cannot be verified",
      ),
    );
  } else {
    const d = releasedAtRaw instanceof Date ? releasedAtRaw : new Date(releasedAtRaw as any);
    conditions.push(
      ok("G-G3-RELEASED-AT", `releasedAt set (${d.toISOString()})`),
    );
  }

  // ALL THREE must pass — DENY otherwise. No CONDITIONAL path.
  const allOk = status === "GOVERNMENT_RELEASED" && !!ref && releasedAtValid;
  const verdict: GateVerdict = allOk ? "ALLOW" : "DENY";

  if (verdict === "DENY") {
    // Promote all "warn"-style entries to "fail" — there are none here, but
    // the pattern preserves the convention that a DENY gate's conditions are
    // all "fail"-typed for clarity on the decision panel.
  }

  logger.debug("[gate/G-G3] verdict", {
    status,
    hasRef: !!ref,
    releasedAtValid,
    verdict,
  });

  return { verdict, conditions };
}

// ============ G-G4: Workflow step status ============

/**
 * G-G4 — Workflow step status gate.
 *
 * Answers: is this individual workflow step in a released state (or
 * in-flight, rejected, or skipped)?
 *
 * Verdict matrix:
 *   • step is null                                  → DENY
 *   • status = GOVERNMENT_RELEASED                 → ALLOW
 *   • status = SKIPPED                              → ALLOW (optional/conditional
 *                                                    steps that were skipped
 *                                                    do not block)
 *   • status = SUBMITTED / GOVERNMENT_ACCEPTED /
 *              GOVERNMENT_HOLD / IN_PROGRESS /
 *              PENDING                             → CONDITIONAL (in-flight)
 *   • status = GOVERNMENT_REJECTED                 → DENY
 */
export function gateWorkflowStepStatus(step: any): GateResult {
  const conditions: GateCondition[] = [];

  if (!step || typeof step !== "object") {
    conditions.push(
      fail("G-G4-EXISTS", "Workflow step is missing"),
    );
    return { verdict: "DENY", conditions };
  }

  conditions.push(
    ok(
      "G-G4-EXISTS",
      `Step ${str(step.id) || "(no id)"} (${str(step.agency) || "?"}) present`,
    ),
  );

  const status = str(step.status);

  if (status === "GOVERNMENT_RELEASED") {
    conditions.push(
      ok("G-G4-RELEASED", "Step GOVERNMENT_RELEASED"),
    );
    return { verdict: "ALLOW", conditions };
  }

  if (status === "SKIPPED") {
    conditions.push(
      ok("G-G4-SKIPPED", "Step SKIPPED (condition false / optional not requested)"),
    );
    return { verdict: "ALLOW", conditions };
  }

  if (status === "GOVERNMENT_REJECTED") {
    conditions.push(
      fail(
        "G-G4-REJECTED",
        `Step GOVERNMENT_REJECTED — ${str(step.rejectionReason) || "no reason recorded"}`,
      ),
    );
    return { verdict: "DENY", conditions };
  }

  if (STEP_IN_FLIGHT.has(status)) {
    conditions.push(
      warn("G-G4-INFLIGHT", `Step status ${status} — in-flight with the government`),
    );
    return { verdict: "CONDITIONAL", conditions };
  }

  // Unknown status — fail closed.
  conditions.push(
    fail("G-G4-UNKNOWN", `Step status ${status || "(empty)"} — unknown`),
  );
  return { verdict: "DENY", conditions };
}

// ============ G-G5: Workflow completion ============

/**
 * G-G5 — Workflow completion gate.
 *
 * Answers: is the WHOLE multi-agency workflow complete (all non-optional
 * steps released or skipped)?
 *
 * Verdict matrix:
 *   • workflow is null                              → DENY
 *   • any non-optional step is GOVERNMENT_REJECTED   → DENY (workflow blocked)
 *   • all non-optional steps are GOVERNMENT_RELEASED
 *     or SKIPPED                                    → ALLOW (workflow complete)
 *   • any non-optional step is in-flight / pending  → CONDITIONAL
 *
 * Optional steps in PENDING state are ignored (they are by definition
 * optional). Optional steps in REJECTED state DO block (a rejection is
 * a rejection regardless of optionality — the operator must explicitly
 * resolve it).
 *
 * Accepts either:
 *   • a workflow row with `steps` already loaded (preferred), OR
 *   • a workflow row without steps — the gate will fetch them from the DB
 *     (best effort; falls back to CONDITIONAL on DB failure).
 */
export async function gateWorkflowCompletion(workflow: any): Promise<GateResult> {
  const conditions: GateCondition[] = [];

  if (!workflow || typeof workflow !== "object") {
    conditions.push(
      fail("G-G5-EXISTS", "Workflow is missing"),
    );
    return { verdict: "DENY", conditions };
  }

  let steps: any[] = Array.isArray((workflow as any).steps)
    ? (workflow as any).steps
    : null;

  // If steps aren't preloaded, try to fetch them.
  if (!steps) {
    const wfId = str(workflow.id);
    if (wfId) {
      try {
        const loaded = await db.multiAgencyWorkflow.findUnique({
          where: { id: wfId },
          include: { steps: { orderBy: { order: "asc" } } },
        });
        steps = Array.isArray(loaded?.steps) ? loaded!.steps : null;
      } catch (err) {
        logger.warn("[gate/G-G5] could not load steps", {
          workflowId: wfId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    if (!steps) {
      conditions.push(
        warn("G-G5-LOAD", "Could not load workflow steps — assuming in-progress"),
      );
      return { verdict: "CONDITIONAL", conditions };
    }
  }

  if (steps.length === 0) {
    conditions.push(
      warn("G-G5-EMPTY", "Workflow has no steps — nothing to complete"),
    );
    return { verdict: "CONDITIONAL", conditions };
  }

  conditions.push(
    ok("G-G5-EXISTS", `Workflow ${str(workflow.name) || str(workflow.id)} with ${steps.length} step(s)`),
  );

  let rejectedCount = 0;
  let pendingCount = 0;
  let completedCount = 0;
  let skippedCount = 0;

  for (const step of steps) {
    const status = str(step.status);
    const optional = step.optional === true;
    if (status === "GOVERNMENT_REJECTED") {
      rejectedCount++;
      conditions.push(
        fail(
          `G-G5-STEP-${str(step.agency) || step.order}`,
          `Step "${str(step.agency) || step.id}" is GOVERNMENT_REJECTED — workflow blocked`,
        ),
      );
    } else if (status === "GOVERNMENT_RELEASED") {
      completedCount++;
    } else if (status === "SKIPPED") {
      skippedCount++;
    } else if (optional && (status === "PENDING" || status === "")) {
      // Optional + not started → ignored.
    } else if (STEP_IN_FLIGHT.has(status) || status === "PENDING" || status === "") {
      pendingCount++;
      conditions.push(
        warn(
          `G-G5-STEP-${str(step.agency) || step.order}`,
          `Step "${str(step.agency) || step.id}" is ${status || "PENDING"} — workflow in-progress`,
        ),
      );
    } else {
      // Unknown step status — surface as warn.
      pendingCount++;
      conditions.push(
        warn(
          `G-G5-STEP-${str(step.agency) || step.order}`,
          `Step "${str(step.agency) || step.id}" has unexpected status ${status}`,
        ),
      );
    }
  }

  if (rejectedCount > 0) {
    logger.debug("[gate/G-G5] verdict", { rejectedCount, verdict: "DENY" });
    return { verdict: "DENY", conditions };
  }

  if (pendingCount > 0) {
    logger.debug("[gate/G-G5] verdict", { pendingCount, verdict: "CONDITIONAL" });
    return { verdict: "CONDITIONAL", conditions };
  }

  // No rejected, no pending → all complete (released or skipped).
  conditions.push(
    ok(
      "G-G5-COMPLETE",
      `All ${steps.length} step(s) released (${completedCount}) or skipped (${skippedCount})`,
    ),
  );
  logger.debug("[gate/G-G5] verdict", {
    completedCount,
    skippedCount,
    verdict: "ALLOW",
  });
  return { verdict: "ALLOW", conditions };
}

// ============ G-G6: Gateway call health ============

/**
 * G-G6 — Gateway call health gate.
 *
 * Answers: did the last gateway call succeed?
 *
 * Verdict matrix:
 *   • call is null              → CONDITIONAL (no call recorded — operator
 *                                  should retry / poll)
 *   • call.status = SUCCESS     → ALLOW
 *   • call.status = DUPLICATE   → ALLOW (idempotency — the original call
 *                                  succeeded, this is a safe replay)
 *   • call.status = RETRY       → CONDITIONAL (in-flight / retrying)
 *   • call.status = PENDING     → CONDITIONAL (in-flight)
 *   • call.status = FAILED      → DENY
 *
 * The DUPLICATE → ALLOW rule is the §9 idempotency guarantee: replaying a
 * previously-succeeded call is safe and the response is the same.
 */
export function gateGatewayCallHealth(call: any): GateResult {
  const conditions: GateCondition[] = [];

  if (!call || typeof call !== "object") {
    conditions.push(
      warn("G-G6-EXISTS", "No gateway call recorded — cannot verify call health"),
    );
    return { verdict: "CONDITIONAL", conditions };
  }

  conditions.push(
    ok(
      "G-G6-EXISTS",
      `Gateway call ${str(call.id) || "(no id)"} (${str(call.operationType) || "?"}) recorded`,
    ),
  );

  const status = str(call.status);

  if (status === "SUCCESS") {
    conditions.push(
      ok("G-G6-SUCCESS", "Gateway call status SUCCESS"),
    );
    return { verdict: "ALLOW", conditions };
  }

  if (status === "DUPLICATE") {
    conditions.push(
      ok(
        "G-G6-DUPLICATE",
        "Gateway call status DUPLICATE — original call succeeded (§9 idempotency)",
      ),
    );
    return { verdict: "ALLOW", conditions };
  }

  if (status === "RETRY" || status === "PENDING") {
    conditions.push(
      warn(
        "G-G6-INFLIGHT",
        `Gateway call status ${status} — in-flight / retrying`,
      ),
    );
    return { verdict: "CONDITIONAL", conditions };
  }

  if (status === "FAILED") {
    conditions.push(
      fail(
        "G-G6-FAILED",
        `Gateway call FAILED — ${str(call.errorMessage) || "no error message recorded"}`,
      ),
    );
    return { verdict: "DENY", conditions };
  }

  // Unknown status — surface as warn.
  conditions.push(
    warn("G-G6-UNKNOWN", `Gateway call status ${status || "(empty)"} — unknown`),
  );
  return { verdict: "CONDITIONAL", conditions };
}

// ============ Merger ============

/**
 * `mergeGovernmentGates` — merge a list of government gate results into a
 * single verdict + flattened conditions list. Mirrors the merge semantics
 * used in `gates-jurisdiction.ts` / `gates-regulatory.ts` /
 * `gates-compliance.ts`:
 *
 *   • verdict: strictest of the inputs (DENY > CONDITIONAL > ALLOW)
 *   • conditions: flattened concatenation of every gate's conditions array
 *     (only non-ALLOW gates contribute — ALLOW-only gates carry no
 *     actionable conditions for the operator).
 *
 * Re-uses the verdict-rank approach (DENY=2, CONDITIONAL=1, ALLOW=0).
 */
export function mergeGovernmentGates(gates: GateResult[]): {
  verdict: GateVerdict;
  conditions: GateCondition[];
} {
  let merged: GateVerdict = "ALLOW";
  const conditions: GateCondition[] = [];

  const list = Array.isArray(gates) ? gates : [];
  for (const g of list) {
    if (!g || typeof g !== "object") continue;
    if (VERDICT_RANK[g.verdict] > VERDICT_RANK[merged]) {
      merged = g.verdict;
    }
    // Only surface conditions from non-ALLOW gates — an ALLOW gate carries
    // no actionable remediation steps for the operator (its `ok` signals
    // are noise on the decision panel).
    if (g.verdict !== "ALLOW" && Array.isArray(g.conditions)) {
      conditions.push(...g.conditions);
    }
  }

  logger.debug("[gate/merge-government] merged", {
    gateCount: list.length,
    verdict: merged,
    conditionCount: conditions.length,
  });
  return { verdict: merged, conditions };
}

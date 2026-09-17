// @ts-nocheck — defensive; advisory gates never throw
/**
 * SGTX Governor Phase 9 — Regulatory Change Gates (Blueprint §1-§9 G-R1..G-R6)
 * ---------------------------------------------------------------------------
 *
 * Six advisory Governor gates for Phase 9 (Country Activation, Regulatory
 * Change Pipeline, Constitutional Approval, Impact Severity, Trade Snapshot
 * Preservation, Rollback Capability). Each gate is an advisory PURE function
 * that takes a domain object and returns:
 *   { gateId, verdict, conditions: { id, label, status }[] }
 *
 * Verdict semantics (same as Phase 1/2/5/6/8 gates):
 *   • ALLOW       — the precondition is fully satisfied.
 *   • CONDITIONAL — the precondition is partially satisfied; can proceed
 *                   but the tenant must resolve the listed conditions
 *                   before contract lock / settlement.
 *   • DENY        — hard violation; the action cannot proceed.
 *
 * NON-MARKETPLACE ENFORCEMENT:
 *   • G-R1 enforces country activation (only ACTIVATED countries can
 *     support automated trade — workflows in IN_PROGRESS/BLOCKED/SUSPENDED/
 *     CANCELLED = DENY).
 *   • G-R2 enforces the change pipeline (only DEPLOYED changes are fully
 *     enforced; APPROVED/COMPILED are conditional; pre-APPROVED + REJECTED/
 *     ROLLED_BACK = DENY).
 *   • G-R3 enforces constitutional approval (SANCTIONS, LAW require
 *     Governor decision + multisig approval; missing either = DENY).
 *   • G-R4 enforces impact severity (CRITICAL = DENY — must review before
 *     proceeding; MODERATE/MAJOR = CONDITIONAL; MINOR = ALLOW).
 *   • G-R5 enforces §5 trade snapshot preservation (RETROACTIVE = DENY —
 *     applies to existing locked trades, dangerous; TRANSITIONAL =
 *     CONDITIONAL; PRESERVE_EXISTING = ALLOW).
 *   • G-R6 enforces rollback capability (rollbackSupported=false = DENY —
 *     no rollback possible; rollbackSupported=true but not yet DEPLOYED =
 *     CONDITIONAL; rollbackSupported=true + DEPLOYED = ALLOW).
 *
 * Gates never throw — they degrade gracefully to DENY (for missing input)
 * or CONDITIONAL (for ambiguous input) with descriptive reasons when their
 * input is malformed.
 *
 * Usage:
 *   import {
 *     gateCountryActivation, gateChangePipeline,
 *     gateConstitutionalApproval, gateImpactSeverity,
 *     gateTradeSnapshotPreservation, gateRollbackCapability,
 *     mergeRegulatoryChangeGates,
 *   } from "@/lib/sgtx/governor/gates-regulatory-change";
 */

// ============ Types ============

export type GateVerdict = "ALLOW" | "CONDITIONAL" | "DENY";

export interface GateCondition {
  id: string;
  label: string;
  status: "met" | "unmet" | "warning";
}

export interface GateResult {
  gateId: string;
  verdict: GateVerdict;
  conditions: GateCondition[];
}

// Loose input shapes — the gates accept either a Prisma row or a
// compatible plain object so they remain pure and unit-testable without
// a DB connection.

/** G-R1 input — a CountryActivationWorkflow (see schema.prisma line 7287). */
export interface CountryActivationWorkflowLike {
  workflowId?: string;
  countryCode?: string;
  countryName?: string | null;
  currentStep?: number;
  status?: string; // IN_PROGRESS | ACTIVATED | SUSPENDED | BLOCKED | CANCELLED
  step20LoomRecord?: boolean;
  activatedAt?: Date | string | null;
  owner?: string | null;
  loomHash?: string | null;
}

/** G-R2/G-R3/G-R4/G-R5/G-R6 input — a RegulatoryChangeV2 (see schema.prisma line 7337). */
export interface RegulatoryChangeLike {
  changeId?: string;
  changeCategory?: string; // LAW | REGULATION | CUSTOMS_PROCEDURE | TAX | TARIFF | SANCTIONS | SPS | TBT | LICENSES | PERMITS | GOVERNMENT_APIS | DOCUMENT_REQUIREMENTS
  changeType?: string;
  title?: string;
  jurisdictionCode?: string;
  impactSeverity?: string; // MINOR | MODERATE | MAJOR | CRITICAL
  snapshotPolicy?: string; // PRESERVE_EXISTING | RETROACTIVE | TRANSITIONAL
  pipelineStatus?: string; // DETECTED | VERIFIED | IMPACTED | SIMULATED | APPROVED | COMPILED | DEPLOYED | REJECTED | ROLLED_BACK
  governorDecision?: string | null;
  multisigApproval?: string | null;
  rollbackSupported?: boolean;
  deployedAt?: Date | string | null;
  rolledBackAt?: Date | string | null;
}

// ============ Constants ============

/**
 * Constitutional categories — these require Governor decision + multisig
 * approval before they can advance past APPROVED. (SANCTIONS + LAW changes
 * can have downstream effects on existing locked trades, so they need the
 * Governor's verdict.)
 */
export const CONSTITUTIONAL_CATEGORIES = ["SANCTIONS", "LAW"] as const;

/**
 * The 9 pipeline statuses (§4). Used by G-R2 to classify the change's
 * pipeline state.
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
 * The 3 snapshot policies (§5). Used by G-R5 to classify the change's
 * snapshot preservation policy.
 */
export const SNAPSHOT_POLICIES = [
  "PRESERVE_EXISTING",
  "RETROACTIVE",
  "TRANSITIONAL",
] as const;

/**
 * The 4 impact severity levels. Used by G-R4.
 */
export const IMPACT_SEVERITIES = [
  "MINOR",
  "MODERATE",
  "MAJOR",
  "CRITICAL",
] as const;

// ============ Helpers ============

function allow(gateId: string): GateResult {
  return { gateId, verdict: "ALLOW", conditions: [] };
}

function conditional(
  gateId: string,
  ...conditions: GateCondition[]
): GateResult {
  return {
    gateId,
    verdict: "CONDITIONAL",
    conditions: conditions.filter((c) => c && c.label),
  };
}

function deny(gateId: string, ...conditions: GateCondition[]): GateResult {
  return {
    gateId,
    verdict: "DENY",
    conditions: conditions.filter((c) => c && c.label),
  };
}

function cond(
  id: string,
  label: string,
  status: GateCondition["status"] = "unmet",
): GateCondition {
  return { id, label, status };
}

/**
 * Pure: true if the change category is constitutional (SANCTIONS or LAW).
 * No DB, no side effects.
 */
export function isConstitutionalCategory(category: string | null | undefined): boolean {
  if (!category) return false;
  return (CONSTITUTIONAL_CATEGORIES as readonly string[]).includes(
    String(category).toUpperCase(),
  );
}

// ============ G-R1: Country Activation ============

/**
 * G-R1 — Country Activation.
 *
 * Verifies that the country's activation workflow is ACTIVATED + step 20
 * (Loom record) is complete. SGTX is non-marketplace — only fully-activated
 * countries can support automated cross-border trade.
 *
 * • ALLOW       — workflow.status = ACTIVATED + step20LoomRecord = true.
 * • CONDITIONAL — workflow.status = IN_PROGRESS (not yet activated — the
 *                 country is being onboarded; trades cannot proceed yet but
 *                 the workflow is healthy).
 * • DENY        — workflow.status = SUSPENDED/BLOCKED/CANCELLED, or
 *                 workflow is null/undefined (the country has not started
 *                 activation — manual onboarding required).
 *
 * Pure. Idempotent.
 */
export function gateCountryActivation(
  workflow: CountryActivationWorkflowLike | null | undefined,
): GateResult {
  if (!workflow) {
    return deny(
      "G-R1",
      cond(
        "no_activation_workflow",
        "No country activation workflow provided — the country has not started activation. Run createActivationWorkflow(countryCode) before proceeding.",
        "unmet",
      ),
    );
  }
  const status = String(workflow.status || "").toUpperCase();
  const step20 = workflow.step20LoomRecord === true;
  const countryCode = workflow.countryCode || "?";
  const workflowId = workflow.workflowId || "(unidentified)";

  if (status === "ACTIVATED") {
    if (!step20) {
      return conditional(
        "G-R1",
        cond(
          "loom_record_missing",
          `Country ${countryCode} is ACTIVATED but step 20 (Loom record) is not complete — the activation is not yet cryptographically anchored to the Loom. Workflow ${workflowId}.`,
          "warning",
        ),
      );
    }
    return allow("G-R1");
  }

  if (status === "IN_PROGRESS") {
    const step = Number(workflow.currentStep) || 0;
    return conditional(
      "G-R1",
      cond(
        "country_in_progress",
        `Country ${countryCode} activation is IN_PROGRESS (step ${step}/20) — the country is being onboarded. Trades cannot proceed until the workflow reaches ACTIVATED + step 20 (Loom record) is complete.`,
        "warning",
      ),
    );
  }

  if (status === "SUSPENDED" || status === "BLOCKED") {
    return deny(
      "G-R1",
      cond(
        "country_blocked_or_suspended",
        `Country ${countryCode} activation is ${status} — the workflow is not healthy. Resume the workflow (resumeWorkflow) before proceeding.`,
        "unmet",
      ),
    );
  }

  if (status === "CANCELLED") {
    return deny(
      "G-R1",
      cond(
        "country_cancelled",
        `Country ${countryCode} activation was CANCELLED — the country is not onboarded. Re-initiate the workflow (createActivationWorkflow) before proceeding.`,
        "unmet",
      ),
    );
  }

  // Unknown status — treat as conditional (best-effort).
  return conditional(
    "G-R1",
    cond(
      "unknown_activation_status",
      `Country ${countryCode} activation workflow has unknown status "${workflow.status}" — verify the workflow state before proceeding.`,
      "warning",
    ),
  );
}

// ============ G-R2: Change Pipeline ============

/**
 * G-R2 — Change Pipeline.
 *
 * Verifies that the regulatory change has progressed through the approval
 * pipeline to DEPLOYED (the change is in effect for future trades).
 *
 * • ALLOW       — pipelineStatus = DEPLOYED.
 * • CONDITIONAL — pipelineStatus = APPROVED or COMPILED (in the final
 *                 stages — the change is approved but not yet in effect).
 * • DENY        — pipelineStatus = DETECTED/VERIFIED/IMPACTED/SIMULATED
 *                 (not yet approved — the change is still being assessed),
 *                 OR pipelineStatus = REJECTED/ROLLED_BACK (the change
 *                 was rejected or rolled back).
 *
 * Pure. Idempotent.
 */
export function gateChangePipeline(
  change: RegulatoryChangeLike | null | undefined,
): GateResult {
  if (!change) {
    return deny(
      "G-R2",
      cond(
        "no_change_provided",
        "No regulatory change provided — run detectRegulatoryChange before proceeding.",
        "unmet",
      ),
    );
  }
  const status = String(change.pipelineStatus || "").toUpperCase();
  const changeId = change.changeId || "(unidentified)";

  if (status === "DEPLOYED") {
    return allow("G-R2");
  }

  if (status === "APPROVED" || status === "COMPILED") {
    return conditional(
      "G-R2",
      cond(
        "change_in_final_stages",
        `Change ${changeId} is ${status} (in the final stages of the approval pipeline) — the change is approved but not yet in effect. Advance to DEPLOYED via advancePipeline.`,
        "warning",
      ),
    );
  }

  if (
    status === "DETECTED" ||
    status === "VERIFIED" ||
    status === "IMPACTED" ||
    status === "SIMULATED"
  ) {
    return deny(
      "G-R2",
      cond(
        "change_not_yet_approved",
        `Change ${changeId} is ${status} — not yet approved. Advance the pipeline via advancePipeline (DETECTED → VERIFIED → IMPACTED → SIMULATED → APPROVED → COMPILED → DEPLOYED).`,
        "unmet",
      ),
    );
  }

  if (status === "REJECTED" || status === "ROLLED_BACK") {
    return deny(
      "G-R2",
      cond(
        "change_off_ramp",
        `Change ${changeId} is ${status} — the change was rejected or rolled back. The change is not in effect.`,
        "unmet",
      ),
    );
  }

  // Unknown status — treat as conditional (best-effort).
  return conditional(
    "G-R2",
    cond(
      "unknown_pipeline_status",
      `Change ${changeId} has unknown pipeline status "${change.pipelineStatus}" — verify the change state before proceeding.`,
      "warning",
    ),
  );
}

// ============ G-R3: Constitutional Approval (THE CONSTITUTIONAL GATE) ============

/**
 * G-R3 — Constitutional Approval (THE CONSTITUTIONAL GATE).
 *
 * For constitutional changes (SANCTIONS, LAW):
 *   • ALLOW       — governorDecision is set AND multisigApproval is set
 *                   (the Governor has approved + multisig has approved).
 *   • DENY        — either governorDecision OR multisigApproval is missing
 *                   (constitutional changes REQUIRE both — no exceptions).
 *
 * For non-constitutional changes:
 *   • ALLOW       — no Governor/multisig required (always allowed).
 *
 * Pure. Idempotent.
 */
export function gateConstitutionalApproval(
  change: RegulatoryChangeLike | null | undefined,
): GateResult {
  if (!change) {
    return deny(
      "G-R3",
      cond(
        "no_change_provided",
        "No regulatory change provided — cannot evaluate constitutional approval.",
        "unmet",
      ),
    );
  }
  const category = String(change.changeCategory || "").toUpperCase();
  const changeId = change.changeId || "(unidentified)";

  // Non-constitutional — always allowed.
  if (!isConstitutionalCategory(category)) {
    return allow("G-R3");
  }

  // Constitutional — require BOTH governorDecision AND multisigApproval.
  const hasGovernor = !!change.governorDecision;
  const hasMultisig = !!change.multisigApproval;
  if (hasGovernor && hasMultisig) {
    return allow("G-R3");
  }

  // Missing one or both — DENY.
  const missing: string[] = [];
  if (!hasGovernor) {
    missing.push("governorDecision (call assignGovernorDecision)");
  }
  if (!hasMultisig) {
    missing.push("multisigApproval (call assignMultisigApproval)");
  }
  return deny(
    "G-R3",
    cond(
      "constitutional_approval_missing",
      `Change ${changeId} is a constitutional change (${category}) — Governor decision + multisig approval are required. Missing: ${missing.join(", ")}.`,
      "unmet",
    ),
  );
}

// ============ G-R4: Impact Severity ============

/**
 * G-R4 — Impact Severity.
 *
 * Verifies that the change's impact severity is acceptable for proceeding.
 *
 * • ALLOW       — impactSeverity = MINOR.
 * • CONDITIONAL — impactSeverity = MODERATE or MAJOR (proceed with caution
 *                 — the change has a meaningful impact on existing trades
 *                 or integrations; review before deploying).
 * • DENY        — impactSeverity = CRITICAL (must review before proceeding
 *                 — the change affects >10 active trades OR a connected
 *                 integration; the Governor must approve).
 *
 * Pure. Idempotent.
 */
export function gateImpactSeverity(
  change: RegulatoryChangeLike | null | undefined,
): GateResult {
  if (!change) {
    return deny(
      "G-R4",
      cond(
        "no_change_provided",
        "No regulatory change provided — cannot evaluate impact severity.",
        "unmet",
      ),
    );
  }
  const severity = String(change.impactSeverity || "").toUpperCase();
  const changeId = change.changeId || "(unidentified)";

  if (severity === "MINOR") {
    return allow("G-R4");
  }

  if (severity === "MODERATE" || severity === "MAJOR") {
    return conditional(
      "G-R4",
      cond(
        "impact_severity_elevated",
        `Change ${changeId} impactSeverity=${severity} — the change has a meaningful impact on existing trades or integrations. Review the impact assessment + simulation results before deploying.`,
        "warning",
      ),
    );
  }

  if (severity === "CRITICAL") {
    return deny(
      "G-R4",
      cond(
        "impact_severity_critical",
        `Change ${changeId} impactSeverity=CRITICAL — the change affects >10 active trades OR a connected integration. The Governor must review and approve before this change can be deployed.`,
        "unmet",
      ),
    );
  }

  // Unknown severity — treat as conditional (best-effort).
  return conditional(
    "G-R4",
    cond(
      "unknown_severity",
      `Change ${changeId} has unknown impactSeverity "${change.impactSeverity}" — run assessImpact to compute the severity before proceeding.`,
      "warning",
    ),
  );
}

// ============ G-R5: Trade Snapshot Preservation (§5 ENFORCEMENT) ============

/**
 * G-R5 — Trade Snapshot Preservation (§5 ENFORCEMENT).
 *
 * Verifies that the change's snapshot policy preserves existing locked
 * trades (§5 — existing locked trades retain their original regulatory
 * snapshot; future trades use the new version).
 *
 * • ALLOW       — snapshotPolicy = PRESERVE_EXISTING (existing locked
 *                 trades retain their snapshot; future trades use the new
 *                 version — the default + safest policy).
 * • CONDITIONAL — snapshotPolicy = TRANSITIONAL (existing trades get a
 *                 grace period during which they can be brought into
 *                 compliance; some trades may be affected during the
 *                 transition).
 * • DENY        — snapshotPolicy = RETROACTIVE (existing trades MUST be
 *                 re-evaluated against the new rules — DANGEROUS, requires
 *                 explicit Governor approval before the change can be
 *                 deployed).
 *
 * Pure. Idempotent.
 */
export function gateTradeSnapshotPreservation(
  change: RegulatoryChangeLike | null | undefined,
): GateResult {
  if (!change) {
    return deny(
      "G-R5",
      cond(
        "no_change_provided",
        "No regulatory change provided — cannot evaluate snapshot preservation policy.",
        "unmet",
      ),
    );
  }
  const policy = String(change.snapshotPolicy || "").toUpperCase();
  const changeId = change.changeId || "(unidentified)";

  if (policy === "PRESERVE_EXISTING") {
    return allow("G-R5");
  }

  if (policy === "TRANSITIONAL") {
    return conditional(
      "G-R5",
      cond(
        "snapshot_policy_transitional",
        `Change ${changeId} snapshotPolicy=TRANSITIONAL — existing trades get a grace period during which they must be brought into compliance with the new rule. Some trades may be affected during the transition. Ensure the grace period is well-defined + communicated.`,
        "warning",
      ),
    );
  }

  if (policy === "RETROACTIVE") {
    return deny(
      "G-R5",
      cond(
        "snapshot_policy_retroactive",
        `Change ${changeId} snapshotPolicy=RETROACTIVE — existing trades MUST be re-evaluated against the new rules. This is DANGEROUS (existing locked trades may be immediately non-compliant). Requires explicit Governor approval before the change can be deployed. Re-evaluate whether the policy can be downgraded to TRANSITIONAL or PRESERVE_EXISTING.`,
        "unmet",
      ),
    );
  }

  // Unknown policy — treat as conditional (best-effort).
  return conditional(
    "G-R5",
    cond(
      "unknown_snapshot_policy",
      `Change ${changeId} has unknown snapshotPolicy "${change.snapshotPolicy}" — set the policy to PRESERVE_EXISTING, TRANSITIONAL, or RETROACTIVE before proceeding.`,
      "warning",
    ),
  );
}

// ============ G-R6: Rollback Capability ============

/**
 * G-R6 — Rollback Capability.
 *
 * Verifies that the change supports rollback (if deployed, it can be
 * reverted via rollbackChange). High-risk changes (rollbackSupported=false)
 * are DENY — once deployed, they cannot be reverted.
 *
 * • ALLOW       — rollbackSupported = true AND pipelineStatus = DEPLOYED
 *                 (the change is deployed AND can be rolled back if needed).
 * • CONDITIONAL — rollbackSupported = true but pipelineStatus != DEPLOYED
 *                 (rollback capability is available but not yet relevant
 *                 — the change is not yet deployed).
 * • DENY        — rollbackSupported = false (no rollback possible —
 *                 high-risk change; the Governor must explicitly approve
 *                 the deployment of an irreversible change).
 *
 * Pure. Idempotent.
 */
export function gateRollbackCapability(
  change: RegulatoryChangeLike | null | undefined,
): GateResult {
  if (!change) {
    return deny(
      "G-R6",
      cond(
        "no_change_provided",
        "No regulatory change provided — cannot evaluate rollback capability.",
        "unmet",
      ),
    );
  }
  const rollbackSupported = change.rollbackSupported === true;
  const status = String(change.pipelineStatus || "").toUpperCase();
  const changeId = change.changeId || "(unidentified)";

  if (!rollbackSupported) {
    return deny(
      "G-R6",
      cond(
        "rollback_not_supported",
        `Change ${changeId} has rollbackSupported=false — no rollback is possible after deployment. This is a high-risk change; the Governor must explicitly approve the deployment of an irreversible change. Set rollbackSupported=true if rollback should be supported.`,
        "unmet",
      ),
    );
  }

  if (status === "DEPLOYED") {
    return allow("G-R6");
  }

  // rollbackSupported=true but not yet DEPLOYED — rollback capability is
  // available but not yet relevant.
  return conditional(
    "G-R6",
    cond(
      "rollback_not_yet_relevant",
      `Change ${changeId} has rollbackSupported=true but pipelineStatus=${status} — rollback capability is available but not yet relevant (rollback is only applicable after DEPLOYED).`,
      "warning",
    ),
  );
}

// ============ Merger ============

const VERDICT_RANK: Record<GateVerdict, number> = {
  ALLOW: 0,
  CONDITIONAL: 1,
  DENY: 2,
};

/**
 * Merges an array of gate results into a single verdict. Strictest wins
 * (DENY > CONDITIONAL > ALLOW). Conditions from every non-ALLOW gate
 * are accumulated (in gate order).
 */
export function mergeRegulatoryChangeGates(
  gates: GateResult[],
): GateResult {
  if (!Array.isArray(gates) || gates.length === 0) {
    return {
      gateId: "G-R-MERGED",
      verdict: "ALLOW",
      conditions: [],
    };
  }
  let merged: GateVerdict = "ALLOW";
  const conditions: GateCondition[] = [];
  for (const g of gates) {
    if (!g) continue;
    if (VERDICT_RANK[g.verdict] > VERDICT_RANK[merged]) {
      merged = g.verdict;
    }
    if (g.verdict !== "ALLOW" && Array.isArray(g.conditions)) {
      conditions.push(...g.conditions);
    }
  }
  return {
    gateId: "G-R-MERGED",
    verdict: merged,
    conditions,
  };
}

// ============ Convenience: run all 6 regulatory-change gates ============

export interface RegulatoryChangeGateInput {
  workflow?: CountryActivationWorkflowLike | null;
  change?: RegulatoryChangeLike | null;
}

/**
 * Convenience: runs all 6 regulatory-change gates and returns the merged
 * verdict. Each gate receives only the input it needs (null-safe). Useful
 * for a single "regulatory change readiness" panel before deploying a
 * change or before a trade can proceed against a new regulatory version.
 *
 * G-R1 (country activation) uses `workflow`.
 * G-R2..G-R6 use `change`.
 */
export function validateRegulatoryChangeGates(
  input: RegulatoryChangeGateInput,
): {
  verdict: GateVerdict;
  conditions: GateCondition[];
  gates: GateResult[];
} {
  const gates: GateResult[] = [
    gateCountryActivation(input.workflow),
    gateChangePipeline(input.change),
    gateConstitutionalApproval(input.change),
    gateImpactSeverity(input.change),
    gateTradeSnapshotPreservation(input.change),
    gateRollbackCapability(input.change),
  ];
  const merged = mergeRegulatoryChangeGates(gates);
  return { verdict: merged.verdict, conditions: merged.conditions, gates };
}

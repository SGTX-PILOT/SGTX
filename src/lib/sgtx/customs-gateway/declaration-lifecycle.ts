// @ts-nocheck
/**
 * SGTX Customs Gateway — Declaration Lifecycle State Machine
 * ===========================================================================
 *
 * The declaration lifecycle is the canonical state machine every customs
 * declaration passes through, regardless of jurisdiction. Country adapters
 * (US-CBP-ACE, EG-NAFEZA, …) operate BELOW this layer — they receive a
 * declaration that is already in the SIGNED state and produce a
 * government-status that flows back into PROCESSING / ACCEPTED / etc.
 *
 * States (per customs-gateway spec):
 *
 *   ┌─ Pre-broker ─────────────────────────────────────────────────────────┐
 *   │  DRAFT              Declaration is being filled in                   │
 *   │  VALIDATING        Engine is validating against rules + OPA          │
 *   │  READY             Validation passed, awaiting broker assignment     │
 *   │  CONDITIONAL       Validation passed with conditions (bond, etc.)    │
 *   │  CORRECTION_REQUIRED  Validation / broker flagged corrections       │
 *   └──────────────────────────────────────────────────────────────────────┘
 *   ┌─ Broker phase (NON-DELEGATED — broker certifies, SGTX never auto) ───┐
 *   │  BROKER_REVIEW     Broker is reviewing the pre-filled envelope       │
 *   │  BROKER_CERTIFIED  Broker has certified + applied digital seal       │
 *   │  BROKER_REJECTED   Broker refused to certify → back to DRAFT         │
 *   └──────────────────────────────────────────────────────────────────────┘
 *   ┌─ Governor phase (G1 — execution gated) ──────────────────────────────┐
 *   │  GOVERNOR_APPROVED  Governor ALLOW verdict recorded                  │
 *   │  GOVERNOR_DENIED    Governor DENY verdict → back to DRAFT            │
 *   └──────────────────────────────────────────────────────────────────────┘
 *   ┌─ Signature + Submission ─────────────────────────────────────────────┐
 *   │  SIGNED            Declaration signed with platform + broker keys    │
 *   │  SUBMITTED         Filed to the country adapter; awaiting ACK        │
 *   │  ACKNOWLEDGED      Government returned an ack / receipt number       │
 *   │  EXTERNAL_SYSTEM_ERROR  Adapter or government returned transient err │
 *   └──────────────────────────────────────────────────────────────────────┘
 *   ┌─ Government processing ──────────────────────────────────────────────┐
 *   │  PROCESSING        Government is processing the declaration          │
 *   │  ACCEPTED          Goods released (TERMINAL — happy path)            │
 *   │  REJECTED          Government rejected (TERMINAL)                    │
 *   │  CUSTOMS_HOLD      Customs placed a hold (inspection, query)         │
 *   │  PGA_HOLD          Partner Government Agency hold                    │
 *   └──────────────────────────────────────────────────────────────────────┘
 *   ┌─ Terminal ───────────────────────────────────────────────────────────┐
 *   │  CANCELLED         Operator cancelled before submission              │
 *   │  EXPIRED           Time-limit expired (e.g.ATA carnet, ISF deadline) │
 *   └──────────────────────────────────────────────────────────────────────┘
 *
 * CRITICAL: SGTX NEVER auto-advances a declaration past BROKER_REVIEW
 * without broker certification (L0 — broker authorization required). The
 * Governor G1 gate runs AFTER broker certification and BEFORE signature.
 *
 * try/catch with safe defaults on every public function.
 */

import { logger } from "@/lib/sgtx/logger";

// ============ §LIFECYCLE — State table ============

export const DECLARATION_STATES_LIST: string[] = [
  "DRAFT",
  "VALIDATING",
  "READY",
  "CONDITIONAL",
  "BROKER_REVIEW",
  "BROKER_CERTIFIED",
  "GOVERNOR_APPROVED",
  "SIGNED",
  "SUBMITTED",
  "ACKNOWLEDGED",
  "PROCESSING",
  "ACCEPTED",
  // Alternative / branch states
  "BROKER_REJECTED",
  "REJECTED",
  "CORRECTION_REQUIRED",
  "CUSTOMS_HOLD",
  "PGA_HOLD",
  "GOVERNOR_DENIED",
  "EXTERNAL_SYSTEM_ERROR",
  "CANCELLED",
  "EXPIRED",
];

export const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["VALIDATING", "CANCELLED"],
  VALIDATING: ["READY", "CONDITIONAL", "CORRECTION_REQUIRED"],
  READY: ["BROKER_REVIEW", "CANCELLED"],
  CONDITIONAL: ["BROKER_REVIEW", "CORRECTION_REQUIRED"],
  BROKER_REVIEW: ["BROKER_CERTIFIED", "BROKER_REJECTED"],
  BROKER_CERTIFIED: ["GOVERNOR_APPROVED", "BROKER_REJECTED"],
  GOVERNOR_APPROVED: ["SIGNED", "GOVERNOR_DENIED"],
  SIGNED: ["SUBMITTED"],
  SUBMITTED: ["ACKNOWLEDGED", "EXTERNAL_SYSTEM_ERROR"],
  ACKNOWLEDGED: ["PROCESSING"],
  PROCESSING: ["ACCEPTED", "CUSTOMS_HOLD", "PGA_HOLD", "REJECTED", "CORRECTION_REQUIRED"],
  ACCEPTED: [], // terminal
  CUSTOMS_HOLD: ["PROCESSING", "REJECTED"],
  PGA_HOLD: ["PROCESSING", "REJECTED"],
  CORRECTION_REQUIRED: ["DRAFT"], // back to draft for correction
  BROKER_REJECTED: ["DRAFT"],
  REJECTED: [], // terminal
  GOVERNOR_DENIED: ["DRAFT"],
  EXTERNAL_SYSTEM_ERROR: ["SUBMITTED"], // retry allowed
  CANCELLED: [], // terminal
  EXPIRED: [], // terminal
};

// ============ Terminal + Governor-required transitions ============

const TERMINAL_STATES: Set<string> = new Set([
  "ACCEPTED",
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
]);

/**
 * Transitions that REQUIRE a Governor G1 ALLOW verdict before they can be
 * applied. Per L0 + customs-gateway G1:
 *
 *   • Governor mandatory BEFORE submission (SIGNED → SUBMITTED)
 *   • Governor mandatory BEFORE broker certification is overridden
 *     (BROKER_REVIEW → BROKER_CERTIFIED in jurisdictions where the broker
 *      is also a delegated governor actor)
 *
 * The Governor gate is checked in customs-gateway/index.ts:submitDeclaration.
 */
const GOVERNOR_REQUIRED_TRANSITIONS: Array<{ from: string; to: string }> = [
  { from: "BROKER_CERTIFIED", to: "GOVERNOR_APPROVED" },
  { from: "BROKER_CERTIFIED", to: "BROKER_REJECTED" },
  { from: "GOVERNOR_APPROVED", to: "SIGNED" },
  { from: "GOVERNOR_APPROVED", to: "GOVERNOR_DENIED" },
  { from: "SIGNED", to: "SUBMITTED" }, // G1 execution-gated
];

// ============ Public API ============

/**
 * Returns true iff `from → to` is a valid transition per VALID_TRANSITIONS.
 *
 * Defensive: unknown states return false (NEVER auto-creates a transition).
 */
export function isValidTransition(from: string, to: string): boolean {
  try {
    if (!from || !to) return false;
    const allowed = VALID_TRANSITIONS[from];
    if (!allowed || !Array.isArray(allowed)) return false;
    return allowed.includes(to);
  } catch {
    return false;
  }
}

/**
 * Returns the list of states the declaration may transition INTO from `state`.
 * Empty array for terminal or unknown states.
 */
export function getValidTransitions(state: string): string[] {
  try {
    if (!state) return [];
    return VALID_TRANSITIONS[state] || [];
  } catch {
    return [];
  }
}

/**
 * Returns true iff `state` is terminal (no further transitions allowed).
 */
export function isTerminalState(state: string): boolean {
  try {
    return TERMINAL_STATES.has(state);
  } catch {
    return false;
  }
}

/**
 * Returns true iff transitioning `state → newState` requires a Governor G1
 * ALLOW verdict. Used by customs-gateway/index.ts:transitionDeclaration to
 * decide whether to call governorDecide before applying the transition.
 */
export function requiresGovernorApproval(state: string, newState: string): boolean {
  try {
    return GOVERNOR_REQUIRED_TRANSITIONS.some(
      (t) => t.from === state && t.to === newState,
    );
  } catch {
    return false;
  }
}

// ============ Lifecycle metadata ============

export interface LifecycleMeta {
  state: string;
  phase:
    | "PRE_BROKER"
    | "BROKER"
    | "GOVERNOR"
    | "SIGNATURE"
    | "SUBMISSION"
    | "PROCESSING"
    | "TERMINAL";
  terminal: boolean;
  /** True iff the broker has certified (state >= BROKER_CERTIFIED). */
  brokerCertified: boolean;
  /** True iff the Governor has approved (state >= GOVERNOR_APPROVED). */
  governorApproved: boolean;
  /** True iff the declaration has been filed to the government (>= SUBMITTED). */
  submitted: boolean;
  /** Human-readable label for the UI. */
  label: string;
  /** UI colour hint (Tailwind class name). */
  color: string;
}

const STATE_META: Record<string, Omit<LifecycleMeta, "state">> = {
  DRAFT:                 { phase: "PRE_BROKER",  terminal: false, brokerCertified: false, governorApproved: false, submitted: false, label: "Draft",                 color: "bg-muted text-muted-foreground" },
  VALIDATING:            { phase: "PRE_BROKER",  terminal: false, brokerCertified: false, governorApproved: false, submitted: false, label: "Validating",            color: "bg-blue-100 text-blue-800" },
  READY:                 { phase: "PRE_BROKER",  terminal: false, brokerCertified: false, governorApproved: false, submitted: false, label: "Ready",                 color: "bg-emerald-100 text-emerald-800" },
  CONDITIONAL:           { phase: "PRE_BROKER",  terminal: false, brokerCertified: false, governorApproved: false, submitted: false, label: "Conditional",           color: "bg-amber-100 text-amber-800" },
  BROKER_REVIEW:         { phase: "BROKER",      terminal: false, brokerCertified: false, governorApproved: false, submitted: false, label: "Broker Review",         color: "bg-cyan-100 text-cyan-800" },
  BROKER_CERTIFIED:      { phase: "BROKER",      terminal: false, brokerCertified: true,  governorApproved: false, submitted: false, label: "Broker Certified",      color: "bg-teal-100 text-teal-800" },
  GOVERNOR_APPROVED:     { phase: "GOVERNOR",    terminal: false, brokerCertified: true,  governorApproved: true,  submitted: false, label: "Governor Approved",     color: "bg-violet-100 text-violet-800" },
  GOVERNOR_DENIED:       { phase: "GOVERNOR",    terminal: false, brokerCertified: true,  governorApproved: false, submitted: false, label: "Governor Denied",       color: "bg-rose-100 text-rose-800" },
  SIGNED:                { phase: "SIGNATURE",   terminal: false, brokerCertified: true,  governorApproved: true,  submitted: false, label: "Signed",                color: "bg-indigo-100 text-indigo-800" },
  SUBMITTED:             { phase: "SUBMISSION",  terminal: false, brokerCertified: true,  governorApproved: true,  submitted: true,  label: "Submitted",             color: "bg-purple-100 text-purple-800" },
  ACKNOWLEDGED:          { phase: "SUBMISSION",  terminal: false, brokerCertified: true,  governorApproved: true,  submitted: true,  label: "Acknowledged",          color: "bg-fuchsia-100 text-fuchsia-800" },
  EXTERNAL_SYSTEM_ERROR: { phase: "SUBMISSION",  terminal: false, brokerCertified: true,  governorApproved: true,  submitted: true,  label: "External System Error", color: "bg-orange-100 text-orange-800" },
  PROCESSING:            { phase: "PROCESSING",  terminal: false, brokerCertified: true,  governorApproved: true,  submitted: true,  label: "Processing",            color: "bg-yellow-100 text-yellow-800" },
  ACCEPTED:              { phase: "TERMINAL",    terminal: true,  brokerCertified: true,  governorApproved: true,  submitted: true,  label: "Accepted",              color: "bg-green-200 text-green-900" },
  REJECTED:              { phase: "TERMINAL",    terminal: true,  brokerCertified: true,  governorApproved: true,  submitted: true,  label: "Rejected",              color: "bg-red-200 text-red-900" },
  CUSTOMS_HOLD:          { phase: "PROCESSING",  terminal: false, brokerCertified: true,  governorApproved: true,  submitted: true,  label: "Customs Hold",          color: "bg-amber-200 text-amber-900" },
  PGA_HOLD:              { phase: "PROCESSING",  terminal: false, brokerCertified: true,  governorApproved: true,  submitted: true,  label: "PGA Hold",              color: "bg-orange-200 text-orange-900" },
  CORRECTION_REQUIRED:   { phase: "PRE_BROKER",  terminal: false, brokerCertified: false, governorApproved: false, submitted: false, label: "Correction Required",   color: "bg-yellow-100 text-yellow-800" },
  BROKER_REJECTED:       { phase: "BROKER",      terminal: false, brokerCertified: false, governorApproved: false, submitted: false, label: "Broker Rejected",       color: "bg-red-100 text-red-800" },
  CANCELLED:             { phase: "TERMINAL",    terminal: true,  brokerCertified: false, governorApproved: false, submitted: false, label: "Cancelled",             color: "bg-gray-200 text-gray-800" },
  EXPIRED:               { phase: "TERMINAL",    terminal: true,  brokerCertified: false, governorApproved: false, submitted: false, label: "Expired",               color: "bg-gray-300 text-gray-900" },
};

export function getLifecycleMeta(state: string): LifecycleMeta {
  try {
    const meta = STATE_META[state];
    if (!meta) {
      // Unknown state — return a safe default (NEVER throws).
      return {
        state,
        phase: "PRE_BROKER",
        terminal: false,
        brokerCertified: false,
        governorApproved: false,
        submitted: false,
        label: state || "Unknown",
        color: "bg-muted text-muted-foreground",
      };
    }
    return { state, ...meta };
  } catch {
    return {
      state: state || "",
      phase: "PRE_BROKER",
      terminal: false,
      brokerCertified: false,
      governorApproved: false,
      submitted: false,
      label: state || "Unknown",
      color: "bg-muted text-muted-foreground",
    };
  }
}

// ============ Pre-submit gate (used by submitDeclaration) ============

/**
 * Returns true iff the declaration is in a state that may be SUBMITTED.
 * Per L0 + customs-gateway G1 + G7:
 *   - NEVER submit before broker certification.
 *   - NEVER submit before Governor approval.
 *   - NEVER submit before signature.
 *
 * The ONLY state from which submitDeclaration is allowed is SIGNED.
 * (EXTERNAL_SYSTEM_ERROR → SUBMITTED is allowed as a retry, but the
 *  submitDeclaration function re-runs the full G1 + adapter chain.)
 */
export function canSubmit(state: string): boolean {
  try {
    return state === "SIGNED" || state === "EXTERNAL_SYSTEM_ERROR";
  } catch {
    return false;
  }
}

/**
 * Returns a human-readable list of preconditions that must be satisfied
 * before the declaration can be submitted. Used by the API route to give
 * the broker actionable feedback when submission is rejected.
 */
export function preconditionsForSubmit(state: string): string[] {
  try {
    const unmet: string[] = [];
    const meta = getLifecycleMeta(state);
    if (!meta.brokerCertified) unmet.push("Broker certification required (state must reach BROKER_CERTIFIED).");
    if (!meta.governorApproved) unmet.push("Governor G1 ALLOW verdict required (state must reach GOVERNOR_APPROVED).");
    if (state !== "SIGNED" && state !== "EXTERNAL_SYSTEM_ERROR") {
      unmet.push("Declaration must be SIGNED (or in EXTERNAL_SYSTEM_ERROR for retry) before submission.");
    }
    if (unmet.length === 0) {
      unmet.push("All preconditions satisfied — submission is allowed.");
    }
    return unmet;
  } catch {
    return ["Unable to evaluate preconditions — see logs."];
  }
}

// ============ Audit: list all states + transitions (for /adapters route) ============

export function listAllStates(): LifecycleMeta[] {
  try {
    return DECLARATION_STATES_LIST.map((s) => getLifecycleMeta(s));
  } catch {
    return [];
  }
}

export function listAllTransitions(): Array<{ from: string; to: string[] }> {
  try {
    return Object.entries(VALID_TRANSITIONS).map(([from, to]) => ({ from, to }));
  } catch {
    return [];
  }
}

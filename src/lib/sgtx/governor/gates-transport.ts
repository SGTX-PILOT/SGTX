// @ts-nocheck — defensive; advisory gates never throw
/**
 * SGTX Governor Phase 5 — Transport Gates (Blueprint §5-§6 G-T1..G-T6)
 * ------------------------------------------------------------
 * Six advisory Governor gates for Phase 5 (Transport, Provider Validation,
 * Logistics Quote V2). Each gate is an advisory PURE function that takes
 * a domain object and returns:
 *   { gateId, verdict, conditions: { id, label, status }[] }
 *
 * Verdict semantics (same as Phase 1/2 gates):
 *   • ALLOW       — the precondition is fully satisfied.
 *   • CONDITIONAL — the precondition is partially satisfied; can proceed
 *                   but the tenant must resolve the listed conditions
 *                   before contract lock / USTN mint.
 *   • DENY        — hard violation; the action cannot proceed.
 *
 * NON-MARKETPLACE ENFORCEMENT:
 *   • G-T2 enforces provider visibility (no relationship = DENY).
 *   • G-T3 enforces provider validation status (INVALID = DENY).
 *   • G-T4 enforces landed-cost confidence (below 0.6 = DENY).
 *   • G-T6 enforces explicit quote selection (no auto-select).
 *
 * Gates never throw — they degrade gracefully to CONDITIONAL with
 * descriptive reasons when their input is malformed.
 *
 * Usage:
 *   import {
 *     gateTransportGraphContinuity, gateProviderVisibility,
 *     gateProviderValidation, gateLandedCostConfidence,
 *     gateTransportDocumentStatus, gateQuoteSelection,
 *     mergeTransportGates,
 *   } from "@/lib/sgtx/governor/gates-transport";
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

export interface TransportGraphLike {
  id?: string;
  ustn?: string;
  legs?: Array<{
    legNumber?: number;
    mode?: string;
    originLocation?: string;
    destinationLocation?: string;
    handoffLocation?: string;
    status?: string;
  }>;
  status?: string;
  isMultimodal?: boolean;
}

/** Continuity report produced by `validateGraphContinuity` (transport-graph lib). */
export interface ContinuityReportLike {
  valid?: boolean;
  breaks?: Array<{ legNumber: number; issue: string }>;
}

export interface ProviderRelationshipLike {
  id?: string;
  providerGtid?: string;
  traderGtid?: string;
  providerType?: string;
  relationshipType?: string;
  relationshipStatus?: string; // ACTIVE | INACTIVE | SUSPENDED | EXPIRED
  visibilityScope?: string;
  authorizedUntil?: string | Date;
}

export interface ProviderValidationResultLike {
  providerGtid?: string;
  providerType?: string;
  overallVerdict?: "VALIDATED" | "CONDITIONAL" | "INVALID";
  validChecks?: number;
  pendingChecks?: number;
  expiredChecks?: number;
  invalidChecks?: number;
  checks?: Array<{ validationType: string; status: string; reason?: string }>;
}

export interface LandedCostBreakdownLike {
  id?: string;
  confidence?: number;
  totalLandedCost?: number;
  freight?: number;
  customs?: number;
  insurance?: number;
}

export interface TransportDocumentLike {
  id?: string;
  documentType?: string;
  documentNumber?: string;
  status?: string; // DRAFT | ISSUED | SURRENDERED | RELEASED | AMENDED | CANCELLED | VOID
  verificationHash?: string;
}

export interface LogisticsQuoteV2Like {
  id?: string;
  quoteId?: string;
  status?: string; // DRAFT | REQUESTED | QUOTED | SELECTED | EXPIRED | CANCELLED | SUPERSEDED
  providerGtid?: string;
  selectedByGtid?: string;
  validUntil?: string | Date;
}

// ============ Thresholds ============

const LC_CONF_ALLOW = 0.85;
const LC_CONF_CONDITIONAL = 0.6;

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

// ============ G-T1: Transport Graph Continuity ============

/**
 * G-T1 — Transport Graph Continuity.
 *
 * Verifies that a transport graph has at least one leg AND that all
 * adjacent legs have matching handoff points (no breaks in the chain).
 *
 * • ALLOW       — graph has legs + continuity is valid.
 * • CONDITIONAL — graph has legs but continuity has breaks (handoff
 *                 mismatch) — tenant must reconcile the breaks.
 * • DENY        — graph is null or has 0 legs.
 *
 * Pure: takes a pre-computed `continuity` report (produced by
 * `validateGraphContinuity` from the transport-graph lib) plus the
 * graph itself. If `continuity` is omitted, the gate degrades to
 * evaluating based on leg presence only.
 */
export function gateTransportGraphContinuity(
  graph: TransportGraphLike | null | undefined,
  continuity?: ContinuityReportLike | null,
): GateResult {
  if (!graph) {
    return deny(
      "G-T1",
      cond(
        "graph_missing",
        "Transport graph not provided — cannot evaluate continuity.",
        "unmet",
      ),
    );
  }
  const legs = Array.isArray(graph.legs) ? graph.legs : [];
  if (legs.length === 0) {
    return deny(
      "G-T1",
      cond(
        "no_legs",
        `Transport graph ${graph.id || "(unsaved)"} has 0 legs — add at least one leg before proceeding.`,
        "unmet",
      ),
    );
  }

  // If a continuity report is provided, surface any breaks.
  if (continuity && continuity.valid === false) {
    const breaks = Array.isArray(continuity.breaks) ? continuity.breaks : [];
    if (breaks.length > 0) {
      const breakLabels = breaks.slice(0, 5).map((b) => `Leg ${b.legNumber}: ${b.issue}`).join(" | ");
      return conditional(
        "G-T1",
        cond(
          "continuity_break",
          `Transport graph has ${breaks.length} continuity break(s): ${breakLabels}${breaks.length > 5 ? " …" : ""}`,
          "warning",
        ),
      );
    }
  }

  return allow("G-T1");
}

// ============ G-T2: Provider Visibility (NON-MARKETPLACE) ============

/**
 * G-T2 — Provider Visibility (NON-MARKETPLACE enforcement).
 *
 * Verifies that the trader has an ACTIVE relationship with the provider.
 * SGTX never publishes a public provider directory; a trader can only
 * transact with providers they have an explicit relationship with.
 *
 * • ALLOW       — relationship exists and is ACTIVE.
 * • CONDITIONAL — relationship exists but is SUSPENDED or EXPIRED —
 *                 trader can view but new transactions should be paused.
 * • DENY        — no relationship at all (provider not visible to this
 *                 trader; non-marketplace enforcement).
 *
 * Pure: takes a single ProviderRelationship row (or null).
 */
export function gateProviderVisibility(
  relationship: ProviderRelationshipLike | null | undefined,
  traderGtid?: string,
): GateResult {
  if (!relationship) {
    return deny(
      "G-T2",
      cond(
        "no_relationship",
        `No provider relationship found for trader ${traderGtid || "(unknown)"} — SGTX is non-marketplace; an active relationship is required to transact.`,
        "unmet",
      ),
    );
  }

  // Trader mismatch — relationship exists but for a different trader.
  // (Platform-wide relationships have traderGtid === null and are allowed.)
  if (
    traderGtid &&
    relationship.traderGtid &&
    String(relationship.traderGtid) !== String(traderGtid)
  ) {
    return deny(
      "G-T2",
      cond(
        "relationship_mismatch",
        `Provider relationship belongs to trader ${relationship.traderGtid}, not the requesting trader ${traderGtid}.`,
        "unmet",
      ),
    );
  }

  const status = (relationship.relationshipStatus || "ACTIVE").toUpperCase();

  if (status === "ACTIVE") {
    // Check authorization window
    if (relationship.authorizedUntil) {
      const until = new Date(relationship.authorizedUntil);
      if (!Number.isNaN(until.getTime()) && until < new Date()) {
        return conditional(
          "G-T2",
          cond(
            "authorization_expired",
            `Provider relationship authorization expired on ${until.toISOString().slice(0, 10)} — renew before transacting.`,
            "warning",
          ),
        );
      }
    }
    return allow("G-T2");
  }

  if (status === "SUSPENDED") {
    return conditional(
      "G-T2",
      cond(
        "relationship_suspended",
        `Provider relationship is SUSPENDED — visibility is read-only; no new transactions until reinstated.`,
        "warning",
      ),
    );
  }

  if (status === "EXPIRED") {
    return conditional(
      "G-T2",
      cond(
        "relationship_expired",
        `Provider relationship has EXPIRED — re-establish the relationship before transacting.`,
        "warning",
      ),
    );
  }

  if (status === "INACTIVE") {
    return deny(
      "G-T2",
      cond(
        "relationship_inactive",
        `Provider relationship is INACTIVE — reactivate before transacting.`,
        "unmet",
      ),
    );
  }

  // Unknown status — default to CONDITIONAL with a note.
  return conditional(
    "G-T2",
    cond(
      "unknown_relationship_status",
      `Provider relationship has unrecognized status "${relationship.relationshipStatus}" — verify before transacting.`,
      "warning",
    ),
  );
}

// ============ G-T3: Provider Validation ============

/**
 * G-T3 — Provider Validation.
 *
 * Verifies that the provider is fully validated for the relevant service.
 *
 * • ALLOW       — overallVerdict = VALIDATED (all applicable checks pass).
 * • CONDITIONAL — overallVerdict = CONDITIONAL (some checks pending or
 *                 expired, but none INVALID) — can proceed with caution.
 * • DENY        — overallVerdict = INVALID or validationResult is null.
 *
 * Pure: takes the result of `validateProvider()` from the provider-validation lib.
 */
export function gateProviderValidation(
  validationResult: ProviderValidationResultLike | null | undefined,
): GateResult {
  if (!validationResult) {
    return deny(
      "G-T3",
      cond(
        "no_validation",
        "No provider validation result provided — run validateProvider() before transacting.",
        "unmet",
      ),
    );
  }

  const verdict = validationResult.overallVerdict;

  if (verdict === "VALIDATED") {
    return allow("G-T3");
  }

  if (verdict === "CONDITIONAL") {
    const failed = (validationResult.checks || []).filter((c) =>
      ["PENDING", "EXPIRED"].includes((c.status || "").toUpperCase()),
    );
    const labels = failed
      .slice(0, 5)
      .map((c) => `${c.validationType}=${c.status}${c.reason ? ` (${c.reason})` : ""}`)
      .join(", ");
    return conditional(
      "G-T3",
      cond(
        "validation_partial",
        `Provider validation is CONDITIONAL — ${failed.length} check(s) need attention: ${labels || "(none detailed)"}${failed.length > 5 ? " …" : ""}`,
        "warning",
      ),
    );
  }

  if (verdict === "INVALID") {
    const invalid = (validationResult.checks || []).filter(
      (c) => (c.status || "").toUpperCase() === "INVALID",
    );
    const labels = invalid
      .slice(0, 5)
      .map((c) => `${c.validationType}${c.reason ? ` (${c.reason})` : ""}`)
      .join(", ");
    return deny(
      "G-T3",
      cond(
        "validation_invalid",
        `Provider validation is INVALID — ${invalid.length} check(s) failed: ${labels || "(none detailed)"}. Trade cannot proceed with this provider.`,
        "unmet",
      ),
    );
  }

  // Unknown verdict — default to DENY (safer).
  return deny(
    "G-T3",
    cond(
      "validation_unknown",
      `Provider validation returned unrecognized verdict "${verdict}" — verify validation result.`,
      "unmet",
    ),
  );
}

// ============ G-T4: Landed Cost Confidence ============

/**
 * G-T4 — Landed Cost Confidence.
 *
 * Verifies that the landed-cost breakdown has sufficient confidence to
 * proceed. Confidence is computed by the landed-cost lib based on
 * how many of the 20 cost components have non-zero / non-estimated values.
 *
 * • ALLOW       — confidence >= 0.85 (most components known).
 * • CONDITIONAL — 0.6 <= confidence < 0.85 (some components missing —
 *                 proceed with caution; tenant should resolve the gaps).
 * • DENY        — confidence < 0.6 (too many unknown costs — risk of
 *                 hidden charges is too high).
 *
 * Pure.
 */
export function gateLandedCostConfidence(
  breakdown: LandedCostBreakdownLike | null | undefined,
): GateResult {
  if (!breakdown) {
    return deny(
      "G-T4",
      cond(
        "no_breakdown",
        "No landed-cost breakdown provided — compute landed cost before proceeding.",
        "unmet",
      ),
    );
  }

  const confidence = Number(breakdown.confidence);
  if (Number.isNaN(confidence)) {
    return conditional(
      "G-T4",
      cond(
        "confidence_invalid",
        `Landed-cost breakdown has invalid confidence value ("${breakdown.confidence}") — re-compute.`,
        "warning",
      ),
    );
  }

  if (confidence >= LC_CONF_ALLOW) {
    return allow("G-T4");
  }

  if (confidence >= LC_CONF_CONDITIONAL) {
    return conditional(
      "G-T4",
      cond(
        "confidence_low",
        `Landed-cost confidence ${(confidence * 100).toFixed(0)}% is below the 85% threshold — some cost components are missing or estimated. Resolve before contract lock.`,
        "warning",
      ),
    );
  }

  return deny(
    "G-T4",
    cond(
      "confidence_too_low",
      `Landed-cost confidence ${(confidence * 100).toFixed(0)}% is below the 60% minimum — too many unknown costs to proceed safely.`,
      "unmet",
    ),
  );
}

// ============ G-T5: Transport Document Status ============

/**
 * G-T5 — Transport Document Status.
 *
 * Verifies that a transport document is in a state appropriate for
 * the action being gated (e.g. cargo release).
 *
 * • ALLOW       — document.status = ISSUED or RELEASED.
 * • CONDITIONAL — document.status = DRAFT or SURRENDERED (in-flight —
 *                 action can be queued but not finalized).
 * • DENY        — document.status = CANCELLED or VOID, or document is null.
 *
 * Pure.
 */
export function gateTransportDocumentStatus(
  document: TransportDocumentLike | null | undefined,
): GateResult {
  if (!document) {
    return deny(
      "G-T5",
      cond(
        "no_document",
        "No transport document provided — issue the document before gating.",
        "unmet",
      ),
    );
  }

  const status = (document.status || "").toUpperCase();

  if (status === "ISSUED" || status === "RELEASED") {
    return allow("G-T5");
  }

  if (status === "DRAFT") {
    return conditional(
      "G-T5",
      cond(
        "document_draft",
        `Document ${document.documentNumber || document.id || "(unnumbered)"} is still in DRAFT — issue it before finalizing the gated action.`,
        "warning",
      ),
    );
  }

  if (status === "SURRENDERED") {
    return conditional(
      "G-T5",
      cond(
        "document_surrendered",
        `Document ${document.documentNumber || document.id || "(unnumbered)"} is SURRENDERED — awaiting release.`,
        "warning",
      ),
    );
  }

  if (status === "AMENDED") {
    // AMENDED is functionally equivalent to ISSUED — allow.
    return allow("G-T5");
  }

  if (status === "CANCELLED" || status === "VOID") {
    return deny(
      "G-T5",
      cond(
        "document_void",
        `Document ${document.documentNumber || document.id || "(unnumbered)"} is ${status} — cannot gate on a voided document.`,
        "unmet",
      ),
    );
  }

  // Unknown status — default to CONDITIONAL.
  return conditional(
    "G-T5",
    cond(
      "document_unknown_status",
      `Document ${document.documentNumber || document.id || "(unnumbered)"} has unrecognized status "${document.status}" — verify before proceeding.`,
      "warning",
    ),
  );
}

// ============ G-T6: Quote Selection (NON-MARKETPLACE) ============

/**
 * G-T6 — Quote Selection (NON-MARKETPLACE enforcement).
 *
 * Verifies that a quote has been EXPLICITLY selected by the trader.
 *
 * • ALLOW       — quote.status = SELECTED (trader explicitly selected).
 * • CONDITIONAL — quote.status = QUOTED (quoted but not yet selected —
 *                 tenant must explicitly select before proceeding).
 * • DENY        — quote is null or status = EXPIRED / CANCELLED / SUPERSEDED.
 *
 * Pure. NON-MARKETPLACE: there is no auto-selection path — the trader's
 * `selectedByGtid` is the sole source of truth.
 */
export function gateQuoteSelection(
  quote: LogisticsQuoteV2Like | null | undefined,
): GateResult {
  if (!quote) {
    return deny(
      "G-T6",
      cond(
        "no_quote",
        "No logistics quote provided — request and select a quote before proceeding.",
        "unmet",
      ),
    );
  }

  const status = (quote.status || "").toUpperCase();

  if (status === "SELECTED") {
    // Verify an explicit selecting trader is recorded.
    if (!quote.selectedByGtid) {
      return conditional(
        "G-T6",
        cond(
          "selected_by_missing",
          `Quote ${quote.quoteId || quote.id || "(unidentified)"} is SELECTED but no selecting trader GTID is recorded — audit trail incomplete.`,
          "warning",
        ),
      );
    }
    return allow("G-T6");
  }

  if (status === "QUOTED") {
    // Check validity window
    let validityNote = "";
    if (quote.validUntil) {
      const until = new Date(quote.validUntil);
      if (!Number.isNaN(until.getTime())) {
        const daysLeft = Math.ceil((until.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
        validityNote = ` (valid for ${daysLeft} more day(s))`;
      }
    }
    return conditional(
      "G-T6",
      cond(
        "quote_not_selected",
        `Quote ${quote.quoteId || quote.id || "(unidentified)"} has been QUOTED but not yet explicitly selected by the trader${validityNote}. Non-marketplace: explicit selection required.`,
        "warning",
      ),
    );
  }

  if (status === "REQUESTED" || status === "DRAFT") {
    return conditional(
      "G-T6",
      cond(
        "quote_not_quoted",
        `Quote ${quote.quoteId || quote.id || "(unidentified)"} is still ${status} — awaiting provider's quote response.`,
        "warning",
      ),
    );
  }

  if (status === "EXPIRED" || status === "CANCELLED" || status === "SUPERSEDED") {
    return deny(
      "G-T6",
      cond(
        "quote_inactive",
        `Quote ${quote.quoteId || quote.id || "(unidentified)"} is ${status} — request a new quote.`,
        "unmet",
      ),
    );
  }

  // Unknown status — default to CONDITIONAL.
  return conditional(
    "G-T6",
    cond(
      "quote_unknown_status",
      `Quote ${quote.quoteId || quote.id || "(unidentified)"} has unrecognized status "${quote.status}" — verify before proceeding.`,
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
export function mergeTransportGates(gates: GateResult[]): GateResult {
  if (!Array.isArray(gates) || gates.length === 0) {
    return {
      gateId: "G-T-MERGED",
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
    gateId: "G-T-MERGED",
    verdict: merged,
    conditions,
  };
}

// ============ Convenience: run all 6 transport gates ============

export interface TransportGateInput {
  graph?: TransportGraphLike | null;
  continuity?: ContinuityReportLike | null;
  relationship?: ProviderRelationshipLike | null;
  traderGtid?: string;
  validationResult?: ProviderValidationResultLike | null;
  breakdown?: LandedCostBreakdownLike | null;
  document?: TransportDocumentLike | null;
  quote?: LogisticsQuoteV2Like | null;
}

/**
 * Convenience: runs all 6 transport gates and returns the merged verdict.
 * Each gate receives only the input it needs (null-safe). Useful for a
 * single "transport readiness" panel.
 */
export function validateTransportGates(
  input: TransportGateInput,
): { verdict: GateVerdict; conditions: GateCondition[]; gates: GateResult[] } {
  const gates: GateResult[] = [
    gateTransportGraphContinuity(input.graph, input.continuity),
    gateProviderVisibility(input.relationship, input.traderGtid),
    gateProviderValidation(input.validationResult),
    gateLandedCostConfidence(input.breakdown),
    gateTransportDocumentStatus(input.document),
    gateQuoteSelection(input.quote),
  ];
  const merged = mergeTransportGates(gates);
  return { verdict: merged.verdict, conditions: merged.conditions, gates };
}

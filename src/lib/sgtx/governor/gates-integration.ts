// @ts-nocheck — defensive; advisory gates never throw
/**
 * SGTX Governor Phase 8 — Integration Gates (Blueprint §1-§9 G-I1..G-I6)
 * ------------------------------------------------------------
 * Six advisory Governor gates for Phase 8 (Integration Catalog, Country
 * Readiness, Trade Lane Readiness, Alerts, Gap Resolution). Each gate is
 * an advisory PURE function that takes a domain object and returns:
 *   { gateId, verdict, conditions: { id, label, status }[] }
 *
 * Verdict semantics (same as Phase 1/2/5/6 gates):
 *   • ALLOW       — the precondition is fully satisfied.
 *   • CONDITIONAL — the precondition is partially satisfied; can proceed
 *                   but the tenant must resolve the listed conditions
 *                   before contract lock / settlement.
 *   • DENY        — hard violation; the action cannot proceed.
 *
 * NON-MARKETPLACE ENFORCEMENT:
 *   • G-I1 enforces integration coverage (MISSING integrations = DENY —
 *     the trade cannot proceed without the required integrations).
 *   • G-I5 enforces critical alert resolution (OPEN CRITICAL alerts = DENY).
 *   • G-I6 enforces critical gap resolution (MISSING gaps with priority
 *     >= 80 = DENY).
 *
 * Gates never throw — they degrade gracefully to DENY (for missing input) or
 * CONDITIONAL (for ambiguous input) with descriptive reasons when their
 * input is malformed.
 *
 * Usage:
 *   import {
 *     gateIntegrationCoverage, gateCountryReadiness,
 *     gateTradeLaneReadiness, gateConnectorStatus,
 *     gateOpenAlerts, gateGapResolution,
 *     mergeIntegrationGates,
 *   } from "@/lib/sgtx/governor/gates-integration";
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

/** G-I1 input — a DiscoveryResult (from `discoverRequiredIntegrations`). */
export interface DiscoveryResultLike {
  requiredIntegrations?: Array<{
    authority?: string;
    procedure?: string;
    status?: string; // CONNECTED | PARTIAL | MANUAL | MISSING
    priority?: number;
    countryCode?: string;
  }>;
  summary?: {
    total?: number;
    connected?: number;
    partial?: number;
    manual?: number;
    missing?: number;
  };
}

/** G-I2 input — a CountryReadinessResult (from `assessCountryReadiness`). */
export interface CountryReadinessLike {
  countryCode?: string;
  overallReadiness?: number;
  dimensions?: Array<{
    dimension?: string;
    readinessLevel?: string;
    readinessScore?: number;
  }>;
}

/** G-I3 input — a TradeLaneReadinessResult (from `assessTradeLaneReadiness`). */
export interface TradeLaneReadinessLike {
  laneId?: string;
  overallReadiness?: number;
  blockers?: string[] | string | null;
  manualTouchpoints?: number;
  missingIntegrations?: number;
}

/** G-I4 input — an IntegrationCatalog row (see schema.prisma). */
export interface ConnectorLike {
  id?: string;
  connectorId?: string;
  jurisdictionCode?: string;
  authority?: string;
  systemName?: string;
  status?: string; // see CONNECTOR_STATUSES (16-state lifecycle)
  priority?: number;
}

/** G-I5 input — an IntegrationAlert row (see schema.prisma). */
export interface IntegrationAlertLike {
  id?: string;
  alertId?: string;
  alertType?: string;
  severity?: string; // INFO | WARN | CRITICAL
  status?: string; // OPEN | ACKNOWLEDGED | RESOLVED | DISMISSED
  jurisdictionCode?: string;
  connectorId?: string;
  laneId?: string;
  title?: string;
}

/** G-I6 input — an IntegrationGapRecord row (see schema.prisma). */
export interface IntegrationGapLike {
  id?: string;
  gapId?: string;
  jurisdictionCode?: string;
  authority?: string;
  status?: string; // CONNECTED | PARTIAL | MANUAL | MISSING | DEPRECATED
  required?: boolean;
  priority?: number;
  nextAction?: string;
}

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
 * Pure: parse a JSON array from a stored string. Defensive.
 */
function parseStringArray(raw: unknown): string[] {
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

// ============ G-I1: Integration Coverage ============

/**
 * G-I1 — Integration Coverage.
 *
 * Verifies that all required integrations discovered for a trade are
 * connected. SGTX is non-marketplace — if a required integration is
 * MISSING, the trade cannot proceed (the trader must onboard the missing
 * authority first).
 *
 * • ALLOW       — all required integrations are CONNECTED.
 * • CONDITIONAL — some are PARTIAL or MANUAL (usable but not automated).
 * • DENY        — any are MISSING (critical gaps).
 *
 * Pure. Idempotent.
 */
export function gateIntegrationCoverage(
  discoveryResult: DiscoveryResultLike | null | undefined,
): GateResult {
  if (!discoveryResult) {
    return deny(
      "G-I1",
      cond(
        "no_discovery",
        "No discovery result provided — run discoverRequiredIntegrations before proceeding.",
        "unmet",
      ),
    );
  }

  const integrations = Array.isArray(discoveryResult.requiredIntegrations)
    ? discoveryResult.requiredIntegrations
    : [];

  if (integrations.length === 0) {
    return deny(
      "G-I1",
      cond(
        "no_integrations_discovered",
        "Discovery produced 0 required integrations — the trade's (origin, destination, mode, hs6) tuple is malformed or no integration families are applicable.",
        "unmet",
      ),
    );
  }

  let connected = 0;
  let partial = 0;
  let manual = 0;
  let missing = 0;
  const missingList: string[] = [];

  for (const ri of integrations) {
    const s = String(ri?.status || "MISSING").toUpperCase();
    if (s === "CONNECTED") connected++;
    else if (s === "PARTIAL") partial++;
    else if (s === "MANUAL") manual++;
    else if (s === "MISSING") {
      missing++;
      missingList.push(
        `${ri.countryCode || "?"}/${ri.authority || "?"}/${ri.procedure || "?"}`,
      );
    } else {
      // Unknown status — treat as partial (best-effort).
      partial++;
    }
  }

  if (missing > 0) {
    return deny(
      "G-I1",
      cond(
        "missing_integrations",
        `${missing} required integration(s) are MISSING: ${missingList.slice(0, 5).join(", ")}${missingList.length > 5 ? ` (… +${missingList.length - 5} more)` : ""}. The trader must onboard these authorities before proceeding.`,
        "unmet",
      ),
    );
  }

  if (partial > 0 || manual > 0) {
    return conditional(
      "G-I1",
      cond(
        "partial_or_manual_integrations",
        `${connected} connected, ${partial} partial, ${manual} manual — the trade can proceed but ${partial + manual} integration(s) are not yet fully automated (require operator touchpoints).`,
        "warning",
      ),
    );
  }

  return allow("G-I1");
}

// ============ G-I2: Country Readiness ============

/**
 * G-I2 — Country Readiness.
 *
 * Verifies that the country's overall readiness is high enough to support
 * automated cross-border trade.
 *
 * • ALLOW       — overallReadiness >= 0.8.
 * • CONDITIONAL — 0.5 <= overallReadiness < 0.8.
 * • DENY        — overallReadiness < 0.5.
 *
 * Pure. Idempotent.
 */
export function gateCountryReadiness(
  countryReadiness: CountryReadinessLike | null | undefined,
): GateResult {
  if (!countryReadiness) {
    return deny(
      "G-I2",
      cond(
        "no_country_readiness",
        "No country readiness provided — run assessCountryReadiness before proceeding.",
        "unmet",
      ),
    );
  }

  const score = Number(countryReadiness.overallReadiness);
  if (!Number.isFinite(score)) {
    return conditional(
      "G-I2",
      cond(
        "invalid_readiness_score",
        `Country readiness score is not a finite number (${countryReadiness.overallReadiness}) — re-run assessCountryReadiness.`,
        "warning",
      ),
    );
  }

  const dims = Array.isArray(countryReadiness.dimensions)
    ? countryReadiness.dimensions
    : [];
  const missingDims = dims.filter(
    (d) => String(d?.readinessLevel || "").toUpperCase() === "MISSING",
  );
  const manualDims = dims.filter(
    (d) => String(d?.readinessLevel || "").toUpperCase() === "MANUAL",
  );

  if (score >= 0.8) {
    return allow("G-I2");
  }

  if (score >= 0.5) {
    return conditional(
      "G-I2",
      cond(
        "country_partial_readiness",
        `Country ${countryReadiness.countryCode || "?"} overallReadiness=${score.toFixed(3)} (< 0.8). Missing dimensions: ${missingDims.length}; manual dimensions: ${manualDims.length}.`,
        "warning",
      ),
    );
  }

  return deny(
    "G-I2",
    cond(
      "country_low_readiness",
      `Country ${countryReadiness.countryCode || "?"} overallReadiness=${score.toFixed(3)} (< 0.5) — too many missing/manual integrations to support automated trade.`,
      "unmet",
    ),
  );
}

// ============ G-I3: Trade Lane Readiness ============

/**
 * G-I3 — Trade Lane Readiness.
 *
 * Verifies that the trade lane's overall readiness is high enough + no
 * critical blockers exist.
 *
 * • ALLOW       — overallReadiness >= 0.7 AND no blockers.
 * • CONDITIONAL — overallReadiness >= 0.4 OR has non-critical blockers.
 * • DENY        — overallReadiness < 0.4 OR has critical blockers.
 *
 * Blockers are considered "critical" if they reference MISSING integrations
 * with priority >= 80 (the `assessTradeLaneReadiness` function only adds
 * such critical blockers to the blockers array — so any non-empty
 * blockers array is treated as critical).
 *
 * Pure. Idempotent.
 */
export function gateTradeLaneReadiness(
  laneReadiness: TradeLaneReadinessLike | null | undefined,
): GateResult {
  if (!laneReadiness) {
    return deny(
      "G-I3",
      cond(
        "no_lane_readiness",
        "No trade lane readiness provided — run assessTradeLaneReadiness before proceeding.",
        "unmet",
      ),
    );
  }

  const score = Number(laneReadiness.overallReadiness);
  if (!Number.isFinite(score)) {
    return conditional(
      "G-I3",
      cond(
        "invalid_lane_score",
        `Trade lane readiness score is not a finite number (${laneReadiness.overallReadiness}) — re-run assessTradeLaneReadiness.`,
        "warning",
      ),
    );
  }

  // Blockers — the array may be stored as JSON string or be a real array.
  const blockers = parseStringArray(laneReadiness.blockers);
  const hasBlockers = blockers.length > 0;
  const laneRef = laneReadiness.laneId || "(unidentified)";

  // DENY: score < 0.4 OR has critical blockers (blockers always critical per spec).
  if (score < 0.4 || hasBlockers) {
    const reasons: string[] = [];
    if (score < 0.4) {
      reasons.push(`overallReadiness=${score.toFixed(3)} (< 0.4)`);
    }
    if (hasBlockers) {
      reasons.push(`${blockers.length} critical blocker(s): ${blockers.slice(0, 3).join("; ")}${blockers.length > 3 ? ` (… +${blockers.length - 3} more)` : ""}`);
    }
    return deny(
      "G-I3",
      cond(
        "lane_low_readiness_or_blocked",
        `Lane ${laneRef}: ${reasons.join(" + ")}. The trade cannot proceed until blockers are resolved + readiness is raised.`,
        "unmet",
      ),
    );
  }

  // ALLOW: score >= 0.7 AND no blockers.
  if (score >= 0.7 && !hasBlockers) {
    return allow("G-I3");
  }

  // CONDITIONAL: 0.4 <= score < 0.7 with no blockers.
  return conditional(
    "G-I3",
    cond(
      "lane_partial_readiness",
      `Lane ${laneRef}: overallReadiness=${score.toFixed(3)} (0.4 ≤ score < 0.7) — the trade can proceed but the lane is not yet fully automated (manualTouchpoints=${laneReadiness.manualTouchpoints || 0}, missingIntegrations=${laneReadiness.missingIntegrations || 0}).`,
      "warning",
    ),
  );
}

// ============ G-I4: Connector Status ============

/**
 * G-I4 — Connector Status.
 *
 * Verifies that a connector is in a usable state. Used by per-connector
 * gates (e.g. before submitting a customs declaration through a CUSTOMS
 * connector, the connector must be PRODUCTION_CONNECTED).
 *
 * • ALLOW       — status = PRODUCTION_CONNECTED.
 * • CONDITIONAL — SANDBOX_CONNECTED / DEGRADED / PORTAL_ONLY / MANUAL_ONLY
 *                 (usable but not fully automated).
 * • DENY        — OUTAGE / DEPRECATED / NOT_DISCOVERED / CONTACT_REQUIRED /
 *                 CREDENTIALS_REQUIRED / CERTIFICATION_REQUIRED (not ready).
 *
 * Pure. Idempotent.
 */
export function gateConnectorStatus(
  connector: ConnectorLike | null | undefined,
): GateResult {
  if (!connector) {
    return deny(
      "G-I4",
      cond(
        "no_connector",
        "No connector provided — verify the connector exists in the IntegrationCatalog before proceeding.",
        "unmet",
      ),
    );
  }

  const status = String(connector.status || "").toUpperCase();
  const ref =
    connector.connectorId || connector.systemName || "(unidentified)";

  if (status === "PRODUCTION_CONNECTED") {
    return allow("G-I4");
  }

  if (
    status === "SANDBOX_CONNECTED" ||
    status === "DEGRADED" ||
    status === "PORTAL_ONLY" ||
    status === "MANUAL_ONLY"
  ) {
    return conditional(
      "G-I4",
      cond(
        "connector_usable_not_automated",
        `Connector ${ref} status = ${status} — usable but not fully automated. Operator touchpoints required.`,
        "warning",
      ),
    );
  }

  if (
    status === "OUTAGE" ||
    status === "DEPRECATED" ||
    status === "NOT_DISCOVERED" ||
    status === "CONTACT_REQUIRED" ||
    status === "CREDENTIALS_REQUIRED" ||
    status === "CERTIFICATION_REQUIRED"
  ) {
    return deny(
      "G-I4",
      cond(
        "connector_not_ready",
        `Connector ${ref} status = ${status} — not ready for production use. Resolve the connector status before proceeding.`,
        "unmet",
      ),
    );
  }

  // Other statuses (DISCOVERED, DOCUMENTED, SANDBOX_AVAILABLE,
  // CERTIFICATION_PENDING, PRODUCTION_READY) — in-progress, treat as
  // CONDITIONAL.
  return conditional(
    "G-I4",
    cond(
      "connector_in_progress",
      `Connector ${ref} status = ${status} — integration is in progress. Usable only for non-critical actions.`,
      "warning",
    ),
  );
}

// ============ G-I5: Open Alerts ============

/**
 * G-I5 — Open Alerts.
 *
 * Verifies that there are no OPEN CRITICAL alerts. SGTX is non-marketplace —
 * if a CRITICAL alert is OPEN, the admin team must resolve it before any
 * new trades can be processed through the affected connector/lane.
 *
 * • ALLOW       — no OPEN CRITICAL alerts.
 * • CONDITIONAL — OPEN WARN/INFO alerts (advisory).
 * • DENY        — any OPEN CRITICAL alerts (must resolve first).
 *
 * `alerts` is an array of IntegrationAlert rows (the G-I5 input shape).
 *
 * Pure. Idempotent.
 */
export function gateOpenAlerts(
  alerts: IntegrationAlertLike[] | null | undefined,
): GateResult {
  if (!Array.isArray(alerts) || alerts.length === 0) {
    return allow("G-I5");
  }

  const openAlerts = alerts.filter(
    (a) => String(a?.status || "").toUpperCase() === "OPEN",
  );
  if (openAlerts.length === 0) {
    return allow("G-I5");
  }

  const criticalAlerts = openAlerts.filter(
    (a) => String(a?.severity || "").toUpperCase() === "CRITICAL",
  );
  const warnInfoAlerts = openAlerts.filter(
    (a) => {
      const s = String(a?.severity || "").toUpperCase();
      return s === "WARN" || s === "INFO";
    },
  );

  if (criticalAlerts.length > 0) {
    const titles = criticalAlerts
      .slice(0, 3)
      .map((a) => a.title || a.alertId || a.alertType || "(untitled)")
      .join("; ");
    return deny(
      "G-I5",
      cond(
        "open_critical_alerts",
        `${criticalAlerts.length} OPEN CRITICAL alert(s): ${titles}${criticalAlerts.length > 3 ? ` (… +${criticalAlerts.length - 3} more)` : ""}. Resolve these alerts before proceeding.`,
        "unmet",
      ),
    );
  }

  if (warnInfoAlerts.length > 0) {
    return conditional(
      "G-I5",
      cond(
        "open_warn_info_alerts",
        `${warnInfoAlerts.length} OPEN WARN/INFO alert(s) — advisory only. The trade can proceed but the admin team should triage these alerts.`,
        "warning",
      ),
    );
  }

  return allow("G-I5");
}

// ============ G-I6: Gap Resolution ============

/**
 * G-I6 — Gap Resolution.
 *
 * Verifies that there are no MISSING gaps with priority >= 80 (critical
 * missing integrations). SGTX is non-marketplace — if a critical
 * integration is missing, the trade cannot proceed.
 *
 * • ALLOW       — no MISSING gaps with priority >= 80.
 * • CONDITIONAL — MISSING gaps with priority < 80 (non-critical gaps).
 * • DENY        — any MISSING gaps with priority >= 80 (critical missing
 *                 integrations).
 *
 * `gaps` is an array of IntegrationGapRecord rows (the G-I6 input shape).
 *
 * Pure. Idempotent.
 */
export function gateGapResolution(
  gaps: IntegrationGapLike[] | null | undefined,
): GateResult {
  if (!Array.isArray(gaps) || gaps.length === 0) {
    return allow("G-I6");
  }

  const missingGaps = gaps.filter(
    (g) => String(g?.status || "").toUpperCase() === "MISSING",
  );
  if (missingGaps.length === 0) {
    return allow("G-I6");
  }

  const criticalGaps = missingGaps.filter((g) => {
    const p = Number(g?.priority) || 0;
    return p >= 80;
  });
  const nonCriticalGaps = missingGaps.filter((g) => {
    const p = Number(g?.priority) || 0;
    return p < 80;
  });

  if (criticalGaps.length > 0) {
    const list = criticalGaps
      .slice(0, 3)
      .map((g) => `${g.gapId || g.id || "?"} (${g.jurisdictionCode || "?"}/${g.authority || "?"}, priority=${g.priority})`)
      .join("; ");
    return deny(
      "G-I6",
      cond(
        "critical_missing_gaps",
        `${criticalGaps.length} MISSING gap(s) with priority >= 80: ${list}${criticalGaps.length > 3 ? ` (… +${criticalGaps.length - 3} more)` : ""}. Onboard these critical integrations before proceeding.`,
        "unmet",
      ),
    );
  }

  if (nonCriticalGaps.length > 0) {
    return conditional(
      "G-I6",
      cond(
        "non_critical_missing_gaps",
        `${nonCriticalGaps.length} MISSING gap(s) with priority < 80 — non-critical gaps. The trade can proceed but the onboarding team should resolve these gaps.`,
        "warning",
      ),
    );
  }

  return allow("G-I6");
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
export function mergeIntegrationGates(gates: GateResult[]): GateResult {
  if (!Array.isArray(gates) || gates.length === 0) {
    return {
      gateId: "G-I-MERGED",
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
    gateId: "G-I-MERGED",
    verdict: merged,
    conditions,
  };
}

// ============ Convenience: run all 6 integration gates ============

export interface IntegrationGateInput {
  discoveryResult?: DiscoveryResultLike | null;
  countryReadiness?: CountryReadinessLike | null;
  laneReadiness?: TradeLaneReadinessLike | null;
  connector?: ConnectorLike | null;
  alerts?: IntegrationAlertLike[] | null;
  gaps?: IntegrationGapLike[] | null;
}

/**
 * Convenience: runs all 6 integration gates and returns the merged verdict.
 * Each gate receives only the input it needs (null-safe). Useful for a
 * single "integration readiness" panel before contract lock or before
 * executing a trade action.
 */
export function validateIntegrationGates(
  input: IntegrationGateInput,
): {
  verdict: GateVerdict;
  conditions: GateCondition[];
  gates: GateResult[];
} {
  const gates: GateResult[] = [
    gateIntegrationCoverage(input.discoveryResult),
    gateCountryReadiness(input.countryReadiness),
    gateTradeLaneReadiness(input.laneReadiness),
    gateConnectorStatus(input.connector),
    gateOpenAlerts(input.alerts),
    gateGapResolution(input.gaps),
  ];
  const merged = mergeIntegrationGates(gates);
  return { verdict: merged.verdict, conditions: merged.conditions, gates };
}

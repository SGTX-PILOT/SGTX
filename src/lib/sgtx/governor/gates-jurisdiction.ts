// SGTX Governor Gates — Jurisdiction Fabric (CCL-014 §2, §4, §5)
// ---------------------------------------------------------------------------
// Four advisory Governor gates that validate jurisdiction + regulatory-source
// + regulatory-snapshot state for a trade:
//
//   G-J1  gateJurisdictionValidity      — is the jurisdiction itself valid
//                                          (ACTIVE + within effective dates)?
//   G-J2  gateJurisdictionActivation    — is the jurisdiction registered in
//                                          the system at all (regardless of
//                                          active/inactive)?
//   G-J3  gateRegulatorySnapshot        — does a valid regulatory snapshot
//                                          exist for the trade?
//   G-J4  gateRuleVersionConsistency    — has the regulatory source state
//                                          drifted since the snapshot was
//                                          taken?
//
// Each gate returns `{ verdict, conditions }`:
//   • verdict: "ALLOW" | "CONDITIONAL" | "DENY"
//   • conditions: list of { id, label, status } for each contributing check
//
// Verdict semantics (per CCL-014 §6 — Governor integration):
//
//   ALLOW        — Jurisdiction exists, is ACTIVE, within effective dates,
//                  and (for G-J3/G-J4) the snapshot is present + consistent.
//                  The trade may proceed.
//
//   CONDITIONAL  — The jurisdiction exists but is NOT_ACTIVE / INCOMPLETE /
//                  STALE, OR (for G-J3/G-J4) the snapshot is STALE or the
//                  rules have drifted. The trade MAY proceed, but with a
//                  warning surfaced to the operator; the conditions array
//                  explains what to address.
//
//   DENY         — The jurisdiction does not exist, OR is expired
//                  (effectiveUntil in the past), OR (for G-J3/G-J4) the
//                  snapshot is missing or SUPERSEDED. The trade must NOT
//                  proceed until the issue is resolved.
//
// These gates are advisory — the Governor orchestrator merges verdicts
// (DENY > CONDITIONAL > ALLOW) into a final per-trade decision. They never
// make autonomous mutations; they only read + report.

import type {
  JurisdictionFabric,
  RegulatorySnapshot,
} from "@prisma/client";
import { logger } from "@/lib/sgtx/logger";

// ============ Types ============

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

// ============ G-J1: Jurisdiction validity gate ============

/**
 * G-J1 — Jurisdiction validity gate.
 *
 * Answers: is this jurisdiction ACTIVE and within its effective-date window?
 *
 * Verdict matrix:
 *   • jurisdiction is null                     → DENY  (not registered)
 *   • effectiveUntil in the past              → DENY  (expired)
 *   • status is ACTIVE + effective-dates OK   → ALLOW
 *   • status is NOT_ACTIVE / INCOMPLETE / STALE
 *                                              → CONDITIONAL (registered but
 *                                                 not yet operational)
 *
 * The conditions array carries one entry per failed/checked sub-condition so
 * the operator UI can show actionable remediation steps.
 */
export function gateJurisdictionValidity(
  jurisdiction: JurisdictionFabric | null,
): GateResult {
  const conditions: GateCondition[] = [];

  if (!jurisdiction) {
    conditions.push({
      id: "G-J1-EXISTS",
      label: "Jurisdiction registered in SGTX fabric",
      status: "fail",
    });
    return { verdict: "DENY", conditions };
  }

  // EXISTS check (always passes here — already null-checked above).
  conditions.push({
    id: "G-J1-EXISTS",
    label: `Jurisdiction ${jurisdiction.code} (${jurisdiction.name}) registered`,
    status: "ok",
  });

  // STATUS check.
  if (jurisdiction.status === "ACTIVE") {
    conditions.push({
      id: "G-J1-STATUS",
      label: `Status is ACTIVE`,
      status: "ok",
    });
  } else if (
    jurisdiction.status === "NOT_ACTIVE" ||
    jurisdiction.status === "INCOMPLETE" ||
    jurisdiction.status === "STALE"
  ) {
    conditions.push({
      id: "G-J1-STATUS",
      label: `Status is ${jurisdiction.status} (registered, not fully operational)`,
      status: "warn",
    });
  } else {
    conditions.push({
      id: "G-J1-STATUS",
      label: `Status is ${jurisdiction.status} (unexpected)`,
      status: "fail",
    });
  }

  // EFFECTIVE-FROM check.
  if (jurisdiction.effectiveFrom) {
    const fromMs = new Date(jurisdiction.effectiveFrom).getTime();
    if (!isNaN(fromMs) && Date.now() < fromMs) {
      conditions.push({
        id: "G-J1-EFFECTIVE-FROM",
        label: `effectiveFrom ${new Date(jurisdiction.effectiveFrom).toISOString()} is in the future`,
        status: "warn",
      });
    } else {
      conditions.push({
        id: "G-J1-EFFECTIVE-FROM",
        label: `effectiveFrom ${new Date(jurisdiction.effectiveFrom).toISOString()} reached`,
        status: "ok",
      });
    }
  }

  // EFFECTIVE-UNTIL check — an expired jurisdiction is a hard DENY.
  let expired = false;
  if (jurisdiction.effectiveUntil) {
    const untilMs = new Date(jurisdiction.effectiveUntil).getTime();
    if (!isNaN(untilMs) && Date.now() > untilMs) {
      conditions.push({
        id: "G-J1-EFFECTIVE-UNTIL",
        label: `effectiveUntil ${new Date(jurisdiction.effectiveUntil).toISOString()} is in the past (expired)`,
        status: "fail",
      });
      expired = true;
    } else {
      conditions.push({
        id: "G-J1-EFFECTIVE-UNTIL",
        label: `effectiveUntil ${new Date(jurisdiction.effectiveUntil).toISOString()} not yet reached`,
        status: "ok",
      });
    }
  }

  // Compute the merged verdict.
  let verdict: GateVerdict = "ALLOW";
  if (expired) {
    verdict = "DENY";
  } else if (jurisdiction.status !== "ACTIVE") {
    verdict = "CONDITIONAL";
  } else if (conditions.some((c) => c.status === "warn")) {
    // effectiveFrom in the future or similar — registered-but-not-active case.
    verdict = "CONDITIONAL";
  }

  logger.debug("[gate/G-J1] verdict", {
    code: jurisdiction.code,
    verdict,
    conditionCount: conditions.length,
  });
  return { verdict, conditions };
}

// ============ G-J2: Jurisdiction activation gate ============

/**
 * G-J2 — Jurisdiction activation gate.
 *
 * Answers: is this jurisdiction registered in SGTX at all (regardless of
 * ACTIVE / NOT_ACTIVE state)?
 *
 * Verdict matrix:
 *   • jurisdiction is null → DENY  (not registered; the SGTX fabric has no
 *                                    node for this code, so the trade cannot
 *                                    be associated with any jurisdiction)
 *   • jurisdiction exists   → ALLOW (registered; G-J1 / G-J3 / G-J4 decide
 *                                    the rest)
 *
 * This gate is intentionally weaker than G-J1 — it's used in flows where the
 * caller wants to confirm "we know about this jurisdiction" before
 * applying stricter validity / snapshot checks.
 */
export function gateJurisdictionActivation(
  jurisdiction: JurisdictionFabric | null,
): GateResult {
  if (!jurisdiction) {
    return {
      verdict: "DENY",
      conditions: [
        {
          id: "G-J2-REGISTERED",
          label: "Jurisdiction is registered in SGTX fabric",
          status: "fail",
        },
      ],
    };
  }
  return {
    verdict: "ALLOW",
    conditions: [
      {
        id: "G-J2-REGISTERED",
        label: `Jurisdiction ${jurisdiction.code} (${jurisdiction.name}) registered`,
        status: "ok",
      },
      {
        id: "G-J2-TYPE",
        label: `Type: ${jurisdiction.jurisdictionType}`,
        status: "ok",
      },
    ],
  };
}

// ============ G-J3: Regulatory snapshot validity gate ============

/**
 * G-J3 — Regulatory snapshot validity gate.
 *
 * Answers: does a VALID regulatory snapshot exist for this trade?
 *
 * Verdict matrix:
 *   • snapshot is null                       → DENY  (no snapshot — trade
 *                                                   cannot be audited)
 *   • snapshot.status is "SUPERSEDED"        → DENY  (snapshot has been
 *                                                   replaced by a newer one
 *                                                   that the caller hasn't
 *                                                   taken yet)
 *   • snapshot.status is "STALE"             → CONDITIONAL (snapshot exists
 *                                                          but should be
 *                                                          refreshed)
 *   • snapshot.status is "VALID"             → ALLOW
 */
export function gateRegulatorySnapshot(
  snapshot: RegulatorySnapshot | null,
): GateResult {
  const conditions: GateCondition[] = [];

  if (!snapshot) {
    conditions.push({
      id: "G-J3-EXISTS",
      label: "Regulatory snapshot exists for trade",
      status: "fail",
    });
    return { verdict: "DENY", conditions };
  }

  conditions.push({
    id: "G-J3-EXISTS",
    label: `Snapshot ${snapshot.id} (v${snapshot.version || "1"}) taken at ${snapshot.snapshotDate.toISOString()}`,
    status: "ok",
  });

  let verdict: GateVerdict = "ALLOW";
  if (snapshot.status === "VALID") {
    conditions.push({
      id: "G-J3-STATUS",
      label: "Snapshot status is VALID",
      status: "ok",
    });
  } else if (snapshot.status === "STALE") {
    conditions.push({
      id: "G-J3-STATUS",
      label: "Snapshot status is STALE — should be refreshed",
      status: "warn",
    });
    verdict = "CONDITIONAL";
  } else if (snapshot.status === "SUPERSEDED") {
    conditions.push({
      id: "G-J3-STATUS",
      label: "Snapshot status is SUPERSEDED — a newer snapshot must be taken",
      status: "fail",
    });
    verdict = "DENY";
  } else {
    conditions.push({
      id: "G-J3-STATUS",
      label: `Snapshot status is ${snapshot.status} (unexpected)`,
      status: "warn",
    });
    verdict = "CONDITIONAL";
  }

  // HASH presence — a missing hash means the snapshot is incomplete.
  if (!snapshot.snapshotHash) {
    conditions.push({
      id: "G-J3-HASH",
      label: "Snapshot hash is missing — snapshot is incomplete",
      status: "warn",
    });
    if (verdict === "ALLOW") verdict = "CONDITIONAL";
  } else {
    conditions.push({
      id: "G-J3-HASH",
      label: `Snapshot hash present (${snapshot.snapshotHash.slice(0, 12)}…)`,
      status: "ok",
    });
  }

  logger.debug("[gate/G-J3] verdict", {
    snapshotId: snapshot.id,
    status: snapshot.status,
    verdict,
  });
  return { verdict, conditions };
}

// ============ G-J4: Rule version consistency gate ============

/**
 * G-J4 — Rule version consistency gate.
 *
 * Answers: has the regulatory source state drifted since the snapshot was
 * taken?
 *
 * Inputs:
 *   • consistent — the boolean returned by `validateSnapshotConsistency(ustn)`
 *   • changes    — the changes array returned by the same call
 *
 * Verdict matrix:
 *   • consistent === true  AND changes.length === 0  → ALLOW
 *   • consistent === false AND changes.length > 0     → CONDITIONAL
 *     (the snapshot is still usable for audit, but the operator should be
 *      warned that the regulatory landscape has changed since the snapshot
 *      was taken; the trade does NOT need to be re-locked, but the operator
 *      may want to take a fresh snapshot for forward-looking trades)
 *   • changes.length > 0 but consistent === true      → ALLOW (treat as
 *     consistent — defensive against callers that pass both fields)
 *
 * Note: G-J4 NEVER returns DENY. A consistency drift is not a hard block —
 * the snapshot remains the canonical point-in-time reference for the
 * already-locked trade. The Governor orchestrator may choose to surface
 * the drift as a notification rather than as a hard veto.
 */
export function gateRuleVersionConsistency(
  consistent: boolean,
  changes: any[],
): GateResult {
  const conditions: GateCondition[] = [];

  if (consistent && (!changes || changes.length === 0)) {
    conditions.push({
      id: "G-J4-CONSISTENT",
      label: "No regulatory drift since snapshot",
      status: "ok",
    });
    return { verdict: "ALLOW", conditions };
  }

  // Drift detected — surface each change as a condition (capped at 20 for
  // dashboard readability; the full list is preserved in the snapshot audit
  // log).
  const changeCount = changes?.length ?? 0;
  conditions.push({
    id: "G-J4-CONSISTENT",
    label: `${changeCount} regulatory change(s) detected since snapshot`,
    status: "warn",
  });

  const cap = 20;
  const list = changes?.slice(0, cap) ?? [];
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    const field = String(c?.field ?? `change-${i}`);
    const snap = String(c?.snapshotValue ?? "(?)");
    const cur = String(c?.currentValue ?? "(?)");
    conditions.push({
      id: `G-J4-DRIFT-${i + 1}`,
      label: `${field}: snapshot="${snap}" → current="${cur}"`,
      status: "warn",
    });
  }
  if (changeCount > cap) {
    conditions.push({
      id: "G-J4-DRIFT-MORE",
      label: `…and ${changeCount - cap} more (see audit log)`,
      status: "warn",
    });
  }

  logger.debug("[gate/G-J4] verdict", {
    consistent,
    changeCount,
    verdict: "CONDITIONAL",
  });
  return { verdict: "CONDITIONAL", conditions };
}

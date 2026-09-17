// @ts-nocheck
// SGTX Governor Gates — Compliance (Phase 3) CCL-016 §G-C1..G-C7
// ---------------------------------------------------------------------------
// Seven advisory Governor gates that validate the assembled COMPLIANCE_RESULT
// envelope produced by the Phase 3 compliance orchestrator
// (`src/lib/sgtx/compliance-orchestrator`).
//
//   G-C1  gateLicenseState         — is the trade license issued and within
//                                    its validity window?
//   G-C2  gatePermitState           — are ALL required permits issued + valid?
//   G-C3  gateCertificateState      — are ALL required certificates issued
//                                    + valid?
//   G-C4  gateSpsRequirements        — are SPS requirements satisfied (sampling
//                                    / lab / inspection / quarantine done)?
//   G-C5  gateTbtRequirements       — are TBT requirements satisfied (testing /
//                                    registration done)?
//   G-C6  gateControlledGoods       — do any controlled-goods controls block
//                                    the trade (CITES App. I, CWC Sched. 1,
//                                    RADIOACTIVE)?
//   G-C7  gateSanctionsScreening    — did sanctions screening produce any
//                                    BLOCK (exact match on OFAC/UN/EU list)?
//
// Each gate returns `{ verdict, conditions }` following the same convention
// as `gates-jurisdiction.ts` / `gates-regulatory.ts`:
//   • verdict: "ALLOW" | "CONDITIONAL" | "DENY"
//   • conditions: list of { id, label, status } for each contributing check
//     where status is one of "ok" | "warn" | "fail" (drives the merged
//     verdict).
//
// Verdict mapping from the Phase 3 verdict scale (ALLOW | CONDITIONAL |
// ENHANCED_DD | BLOCK) to the Governor verdict scale (ALLOW | CONDITIONAL | DENY):
//
//   ALLOW          → ALLOW
//   CONDITIONAL    → CONDITIONAL
//   ENHANCED_DD     → CONDITIONAL (a condition labeled "ENHANCED DD required"
//                    is surfaced so the operator knows enhanced due diligence
//                    is mandatory before the trade proceeds)
//   BLOCK           → DENY
//
// These gates are advisory — the Governor orchestrator merges all seven
// verdicts (DENY > CONDITIONAL > ALLOW) via `mergeComplianceGates` into a
// final per-trade decision. They never make autonomous mutations; they only
// read + report.

import { logger } from "@/lib/sgtx/logger";

// ============ Types (mirror gates-jurisdiction.ts / gates-regulatory.ts) ===

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

/** Set of license / permit / certificate states considered terminal-bad. */
const BAD_STATES = new Set(["EXPIRED", "REVOKED", "REJECTED"]);

/** Set of license / permit / certificate states considered in-flight. */
const IN_FLIGHT_STATES = new Set([
  "APPLICATION_READY",
  "SUBMITTED",
  "PENDING",
  "REQUIRED",
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

/** Defensive boolean coercion. */
function bool(v: unknown): boolean {
  return v === true;
}

/** Check whether a date string is past the current time (defensive). */
function isPast(dateStr: unknown): boolean {
  if (typeof dateStr !== "string" || dateStr.length === 0) return false;
  const ms = new Date(dateStr).getTime();
  return !isNaN(ms) && ms < Date.now();
}

/**
 * Map a Phase 3 verdict (ALLOW | CONDITIONAL | ENHANCED_DD | BLOCK) to a
 * Governor verdict (ALLOW | CONDITIONAL | DENY) per the spec.
 */
function mapPhase3Verdict(v: string): GateVerdict {
  if (v === "BLOCK") return "DENY";
  if (v === "ENHANCED_DD") return "CONDITIONAL";
  if (v === "CONDITIONAL") return "CONDITIONAL";
  return "ALLOW";
}

// ============ G-C1: License state gate ============

/**
 * G-C1 — License state gate.
 *
 * Answers: is the trade license issued and within its validity window?
 *
 * Verdict matrix:
 *   • state = ISSUED + validUntil not expired   → ALLOW
 *   • state in IN_FLIGHT_STATES                   → CONDITIONAL
 *     (the application is in progress; the trade MAY proceed with a warning)
 *   • state in BAD_STATES (EXPIRED / REVOKED / REJECTED) → DENY
 *
 * The validUntil check only applies when state = ISSUED — an expired
 * ISSUED license becomes a DENY (the validity window elapsed).
 */
export function gateLicenseState(result: any): GateResult {
  const conditions: GateCondition[] = [];

  if (!result || typeof result !== "object") {
    conditions.push(
      fail("G-C1-INPUT", "License result missing — cannot evaluate"),
    );
    return { verdict: "DENY", conditions };
  }

  const state = str(result.state) || "UNKNOWN";
  const licenseType = str(result.licenseType) || "UNKNOWN";
  const required = bool(result.required);

  // Not-required → ALLOW (no license needed for this product/lane).
  if (!required || state === "NOT_REQUIRED") {
    conditions.push(
      ok(
        "G-C1-REQUIRED",
        `License not required for ${licenseType} (state=${state})`,
      ),
    );
    logger.debug("[gate/G-C1] verdict", { state, verdict: "ALLOW" });
    return { verdict: "ALLOW", conditions };
  }

  conditions.push(
    ok("G-C1-REQUIRED", `License required (${licenseType}) — state=${state}`),
  );

  // BAD states → DENY.
  if (BAD_STATES.has(state)) {
    conditions.push(
      fail(
        "G-C1-STATE",
        `License state is ${state} — invalid (terminal)`,
      ),
    );
    logger.debug("[gate/G-C1] verdict", { state, verdict: "DENY" });
    return { verdict: "DENY", conditions };
  }

  // ISSUED — verify validity window.
  if (state === "ISSUED") {
    if (isPast(result.validUntil)) {
      conditions.push(
        fail(
          "G-C1-VALIDITY",
          `License ISSUED but validUntil ${result.validUntil} is in the past (effectively expired)`,
        ),
      );
      logger.debug("[gate/G-C1] verdict", { state, verdict: "DENY" });
      return { verdict: "DENY", conditions };
    }
    conditions.push(
      ok(
        "G-C1-STATE",
        `License ISSUED${result.validUntil ? ` (valid until ${result.validUntil})` : ""}`,
      ),
    );
    logger.debug("[gate/G-C1] verdict", { state, verdict: "ALLOW" });
    return { verdict: "ALLOW", conditions };
  }

  // In-flight states → CONDITIONAL.
  if (IN_FLIGHT_STATES.has(state)) {
    conditions.push(
      warn(
        "G-C1-STATE",
        `License in-flight (state=${state}) — trade may proceed with warning`,
      ),
    );
    logger.debug("[gate/G-C1] verdict", { state, verdict: "CONDITIONAL" });
    return { verdict: "CONDITIONAL", conditions };
  }

  // Unknown state — surface as warning (defensive).
  conditions.push(
    warn(
      "G-C1-STATE",
      `License state ${state} unexpected — manual review recommended`,
    ),
  );
  logger.debug("[gate/G-C1] verdict", { state, verdict: "CONDITIONAL" });
  return { verdict: "CONDITIONAL", conditions };
}

// ============ G-C2: Permit state gate ============

/**
 * G-C2 — Permit state gate.
 *
 * Answers: are ALL required permits issued and valid?
 *
 * Verdict matrix:
 *   • any required permit is EXPIRED / REVOKED / REJECTED   → DENY
 *   • any required permit missing (in-flight or not-applied) → CONDITIONAL
 *   • all required permits ISSUED + valid                     → ALLOW
 *   • no required permits at all                                → ALLOW
 */
export function gatePermitState(determination: any): GateResult {
  const conditions: GateCondition[] = [];

  if (!determination || typeof determination !== "object") {
    conditions.push(
      fail("G-C2-INPUT", "Permit determination missing — cannot evaluate"),
    );
    return { verdict: "DENY", conditions };
  }

  const permits = Array.isArray(determination.permits) ? determination.permits : [];
  const required = permits.filter((p: any) => p && bool(p.required));

  if (required.length === 0) {
    conditions.push(ok("G-C2-NONE", "No required permits"));
    logger.debug("[gate/G-C2] verdict", { required: 0, verdict: "ALLOW" });
    return { verdict: "ALLOW", conditions };
  }

  const bad = required.filter((p: any) => BAD_STATES.has(str(p.state)));
  const missing = required.filter(
    (p: any) => !BAD_STATES.has(str(p.state)) && str(p.state) !== "ISSUED",
  );
  const issued = required.filter((p: any) => str(p.state) === "ISSUED");

  // Expired permits even within ISSUED (validUntil in past) → DENY.
  const expiredIssued = issued.filter((p: any) => isPast(p.validUntil));

  if (bad.length > 0 || expiredIssued.length > 0) {
    for (const p of [...bad, ...expiredIssued]) {
      conditions.push(
        fail(
          `G-C2-${str(p.permitType) || "PERMIT"}`,
          `Permit ${str(p.permitType) || "?"} ${expiredIssued.includes(p) ? "expired" : str(p.state)} (invalid)`,
        ),
      );
    }
    logger.debug("[gate/G-C2] verdict", { bad: bad.length, expiredIssued: expiredIssued.length, verdict: "DENY" });
    return { verdict: "DENY", conditions };
  }

  if (missing.length > 0) {
    for (const p of missing) {
      conditions.push(
        warn(
          `G-C2-${str(p.permitType) || "PERMIT"}`,
          `Permit ${str(p.permitType) || "?"} missing (state=${str(p.state) || "?"})`,
        ),
      );
    }
    logger.debug("[gate/G-C2] verdict", { missing: missing.length, verdict: "CONDITIONAL" });
    return { verdict: "CONDITIONAL", conditions };
  }

  conditions.push(
    ok("G-C2-ALL", `All ${issued.length} required permit(s) issued`),
  );
  logger.debug("[gate/G-C2] verdict", { issued: issued.length, verdict: "ALLOW" });
  return { verdict: "ALLOW", conditions };
}

// ============ G-C3: Certificate state gate ============

/**
 * G-C3 — Certificate state gate.
 *
 * Answers: are ALL required certificates issued and valid?
 *
 * Same semantics as G-C2 but for certificates:
 *   • any required cert EXPIRED / REVOKED / REJECTED   → DENY
 *   • any required cert missing (in-flight / not-applied) → CONDITIONAL
 *   • all required certs ISSUED + valid                   → ALLOW
 *   • no required certs                                      → ALLOW
 */
export function gateCertificateState(determination: any): GateResult {
  const conditions: GateCondition[] = [];

  if (!determination || typeof determination !== "object") {
    conditions.push(
      fail("G-C3-INPUT", "Certificate determination missing — cannot evaluate"),
    );
    return { verdict: "DENY", conditions };
  }

  const certs = Array.isArray(determination.certificates) ? determination.certificates : [];
  const required = certs.filter((c: any) => c && bool(c.required));

  if (required.length === 0) {
    conditions.push(ok("G-C3-NONE", "No required certificates"));
    logger.debug("[gate/G-C3] verdict", { required: 0, verdict: "ALLOW" });
    return { verdict: "ALLOW", conditions };
  }

  const bad = required.filter((c: any) => BAD_STATES.has(str(c.state)));
  const missing = required.filter(
    (c: any) => !BAD_STATES.has(str(c.state)) && str(c.state) !== "ISSUED",
  );
  const issued = required.filter((c: any) => str(c.state) === "ISSUED");
  const expiredIssued = issued.filter((c: any) => isPast(c.validUntil));

  if (bad.length > 0 || expiredIssued.length > 0) {
    for (const c of [...bad, ...expiredIssued]) {
      conditions.push(
        fail(
          `G-C3-${str(c.certificateType) || "CERT"}`,
          `Certificate ${str(c.certificateType) || "?"} ${expiredIssued.includes(c) ? "expired" : str(c.state)} (invalid)`,
        ),
      );
    }
    logger.debug("[gate/G-C3] verdict", { bad: bad.length, expiredIssued: expiredIssued.length, verdict: "DENY" });
    return { verdict: "DENY", conditions };
  }

  if (missing.length > 0) {
    for (const c of missing) {
      conditions.push(
        warn(
          `G-C3-${str(c.certificateType) || "CERT"}`,
          `Certificate ${str(c.certificateType) || "?"} missing (state=${str(c.state) || "?"})`,
        ),
      );
    }
    logger.debug("[gate/G-C3] verdict", { missing: missing.length, verdict: "CONDITIONAL" });
    return { verdict: "CONDITIONAL", conditions };
  }

  conditions.push(
    ok("G-C3-ALL", `All ${issued.length} required certificate(s) issued`),
  );
  logger.debug("[gate/G-C3] verdict", { issued: issued.length, verdict: "ALLOW" });
  return { verdict: "ALLOW", conditions };
}

// ============ G-C4: SPS requirements gate ============

/**
 * G-C4 — SPS requirements gate.
 *
 * Answers: do SPS (sanitary / phytosanitary) requirements need operator action
 * (sampling / lab / inspection / quarantine / treatment)?
 *
 * SPS is ADVISORY — it NEVER hard-blocks a trade, but surfaces conditions the
 * operator must satisfy before customs clearance.
 *
 * Verdict matrix:
 *   • no SPS requirements (totalRequired=0) → ALLOW
 *   • any sampling / lab / inspection / quarantine / treatment required → CONDITIONAL
 *   • DENY never (SPS cannot block; only surface)
 */
export function gateSpsRequirements(determination: any): GateResult {
  const conditions: GateCondition[] = [];

  if (!determination || typeof determination !== "object") {
    conditions.push(
      warn("G-C4-INPUT", "SPS determination missing — operator should verify"),
    );
    return { verdict: "CONDITIONAL", conditions };
  }

  const totalRequired = Number(determination.totalRequired) || 0;
  const sampling = bool(determination.samplingRequired);
  const lab = bool(determination.labTestRequired);
  const inspection = bool(determination.inspectionRequired);
  const treatment = bool(determination.treatmentRequired);
  const quarantineMax = Number(determination.quarantineDaysMax) || 0;

  if (totalRequired === 0) {
    conditions.push(ok("G-C4-NONE", "No SPS requirements apply"));
    logger.debug("[gate/G-C4] verdict", { totalRequired: 0, verdict: "ALLOW" });
    return { verdict: "ALLOW", conditions };
  }

  conditions.push(
    ok("G-C4-COUNT", `${totalRequired} SPS requirement(s) apply`),
  );

  const actions: string[] = [];
  if (sampling) actions.push("sampling");
  if (lab) actions.push("lab test");
  if (inspection) actions.push("inspection");
  if (treatment) actions.push(`treatment (${determination.treatmentRequired})`);
  if (quarantineMax > 0) actions.push(`quarantine<=${quarantineMax}d`);

  if (actions.length > 0) {
    conditions.push(
      warn(
        "G-C4-ACTIONS",
        `SPS operator action required: ${actions.join(", ")}`,
      ),
    );
    logger.debug("[gate/G-C4] verdict", { actions, verdict: "CONDITIONAL" });
    return { verdict: "CONDITIONAL", conditions };
  }

  // SPS requirements exist but no operator action — ALLOW.
  conditions.push(
    ok("G-C4-ACTIONS", "SPS requirements exist but no operator action required"),
  );
  logger.debug("[gate/G-C4] verdict", { actions: [], verdict: "ALLOW" });
  return { verdict: "ALLOW", conditions };
}

// ============ G-C5: TBT requirements gate ============

/**
 * G-C5 — TBT (Technical Barriers to Trade) requirements gate.
 *
 * Answers: do TBT requirements (product testing / registration / labeling /
 * mandatory standards) need operator action?
 *
 * TBT is ADVISORY — never hard-blocks.
 *
 * Verdict matrix:
 *   • no TBT requirements OR no testing/registration required → ALLOW
 *   • testing or registration required                          → CONDITIONAL
 *   • DENY never
 */
export function gateTbtRequirements(determination: any): GateResult {
  const conditions: GateCondition[] = [];

  if (!determination || typeof determination !== "object") {
    conditions.push(
      warn("G-C5-INPUT", "TBT determination missing — operator should verify"),
    );
    return { verdict: "CONDITIONAL", conditions };
  }

  const reqs = Array.isArray(determination.requirements) ? determination.requirements : [];
  const testing = bool(determination.testingRequired);
  const registration = bool(determination.registrationRequired);
  const standards = Array.isArray(determination.mandatoryStandards) ? determination.mandatoryStandards : [];

  if (reqs.length === 0) {
    conditions.push(ok("G-C5-NONE", "No TBT requirements apply"));
    logger.debug("[gate/G-C5] verdict", { reqs: 0, verdict: "ALLOW" });
    return { verdict: "ALLOW", conditions };
  }

  conditions.push(ok("G-C5-COUNT", `${reqs.length} TBT requirement(s) apply`));

  const actions: string[] = [];
  if (testing) actions.push("testing");
  if (registration) actions.push("registration");
  if (standards.length > 0) actions.push(`${standards.length} mandatory standard(s)`);

  if (actions.length > 0) {
    conditions.push(
      warn(
        "G-C5-ACTIONS",
        `TBT operator action required: ${actions.join(", ")}`,
      ),
    );
    logger.debug("[gate/G-C5] verdict", { actions, verdict: "CONDITIONAL" });
    return { verdict: "CONDITIONAL", conditions };
  }

  conditions.push(
    ok("G-C5-ACTIONS", "TBT requirements exist but no operator action required"),
  );
  logger.debug("[gate/G-C5] verdict", { actions: [], verdict: "ALLOW" });
  return { verdict: "ALLOW", conditions };
}

// ============ G-C6: Controlled goods gate ============

/**
 * G-C6 — Controlled goods gate.
 *
 * Answers: do any controlled-goods controls BLOCK the trade?
 *
 * Verdict matrix:
 *   • no controls apply                                     → ALLOW
 *   • topSeverity = CONDITIONAL (e.g. controlled medicines) → CONDITIONAL
 *   • topSeverity = ENHANCED_DD                              → CONDITIONAL
 *     (a condition labeled "Enhanced due diligence required" is surfaced)
 *   • topSeverity = BLOCK (CITES App. I, CWC Sched. 1, RADIOACTIVE) → DENY
 */
export function gateControlledGoods(determination: any): GateResult {
  const conditions: GateCondition[] = [];

  if (!determination || typeof determination !== "object") {
    conditions.push(
      fail("G-C6-INPUT", "Controlled-goods determination missing — cannot evaluate"),
    );
    return { verdict: "DENY", conditions };
  }

  const controls = Array.isArray(determination.controls) ? determination.controls : [];
  if (controls.length === 0) {
    conditions.push(ok("G-C6-NONE", "No controlled-goods controls apply"));
    logger.debug("[gate/G-C6] verdict", { controls: 0, verdict: "ALLOW" });
    return { verdict: "ALLOW", conditions };
  }

  const topSeverity = str(determination.topSeverity);
  const topVerdict = str(determination.topVerdict);

  // Surface each control as a condition (capped at 20 for readability).
  const cap = 20;
  for (let i = 0; i < Math.min(controls.length, cap); i++) {
    const c = controls[i];
    if (!c) continue;
    const cat = str(c.controlCategory) || "UNKNOWN";
    const sev = str(c.severity);
    const status = sev === "BLOCK" ? "fail" : "warn";
    conditions.push({
      id: `G-C6-${cat}-${i + 1}`,
      label: `Controlled good ${cat}${c.controlListEntry ? ` (${str(c.controlListEntry)})` : ""} severity=${sev || "?"}`,
      status,
    });
  }
  if (controls.length > cap) {
    conditions.push({
      id: "G-C6-MORE",
      label: `…and ${controls.length - cap} more (see compliance result)`,
      status: "warn",
    });
  }

  // BLOCK severity → DENY.
  if (topSeverity === "BLOCK" || topVerdict === "BLOCK") {
    conditions.push(
      fail(
        "G-C6-SEVERITY",
        `Controlled-goods topSeverity=BLOCK — trade blocked`,
      ),
    );
    logger.debug("[gate/G-C6] verdict", { topSeverity, topVerdict, verdict: "DENY" });
    return { verdict: "DENY", conditions };
  }

  // ENHANCED_DD → CONDITIONAL with explicit "Enhanced due diligence required" condition.
  if (topSeverity === "ENHANCED_DD" || topVerdict === "ENHANCED_DD") {
    conditions.push(
      warn(
        "G-C6-EDD",
        "Enhanced due diligence required (controlled goods)",
      ),
    );
    logger.debug("[gate/G-C6] verdict", { topSeverity, topVerdict, verdict: "CONDITIONAL" });
    return { verdict: "CONDITIONAL", conditions };
  }

  // CONDITIONAL severity (e.g. controlled medicines) → CONDITIONAL.
  conditions.push(
    warn(
      "G-C6-SEVERITY",
      `Controlled-goods topSeverity=${topSeverity || "?"} — enhanced review recommended`,
    ),
  );
  logger.debug("[gate/G-C6] verdict", { topSeverity, topVerdict, verdict: "CONDITIONAL" });
  return { verdict: "CONDITIONAL", conditions };
}

// ============ G-C7: Sanctions screening gate ============

/**
 * G-C7 — Sanctions screening gate.
 *
 * Answers: did sanctions screening produce any BLOCK?
 *
 * Verdict matrix:
 *   • no matches (aggregate.topVerdict = ALLOW)         → ALLOW
 *   • any fuzzy match (matchScore 0.5-0.7)              → CONDITIONAL
 *   • any BLOCK (exact match on OFAC/UN/EU list)         → DENY
 *
 * Accepts either:
 *   • the orchestrator sanctions object `{ results, aggregate }` (preferred)
 *   • a single SanctionsScreeningResult
 *   • an array of SanctionsScreeningResult
 */
export function gateSanctionsScreening(result: any): GateResult {
  const conditions: GateCondition[] = [];

  if (!result || typeof result !== "object") {
    conditions.push(
      warn("G-C7-INPUT", "Sanctions screening result missing — manual review recommended"),
    );
    return { verdict: "CONDITIONAL", conditions };
  }

  // Normalize to an array of screening results.
  let results: any[] = [];
  if (Array.isArray(result)) {
    results = result;
  } else if (Array.isArray(result.results)) {
    results = result.results;
  } else if (result.verdict || result.matchScore !== undefined) {
    results = [result];
  }

  if (results.length === 0) {
    conditions.push(ok("G-C7-NONE", "No sanctions screening performed (no targets)"));
    logger.debug("[gate/G-C7] verdict", { results: 0, verdict: "ALLOW" });
    return { verdict: "ALLOW", conditions };
  }

  const blockResults = results.filter(
    (r: any) => r && str(r.verdict) === "BLOCK",
  );
  const fuzzyResults = results.filter((r: any) => {
    if (!r) return false;
    const score = Number(r.matchScore) || 0;
    return score >= 0.5 && score < 0.7;
  });
  const enhancedDdResults = results.filter(
    (r: any) => r && str(r.verdict) === "ENHANCED_DD",
  );

  if (blockResults.length > 0) {
    for (const r of blockResults) {
      conditions.push(
        fail(
          `G-C7-${str(r.screeningType) || "BLOCK"}`,
          `Sanctions BLOCK: "${str(r.screenedValue)}" matched ${str(r.matchedList) || "list"} (score=${Number(r.matchScore) || 0})`,
        ),
      );
    }
    logger.debug("[gate/G-C7] verdict", { blockCount: blockResults.length, verdict: "DENY" });
    return { verdict: "DENY", conditions };
  }

  if (enhancedDdResults.length > 0 || fuzzyResults.length > 0) {
    for (const r of [...enhancedDdResults, ...fuzzyResults]) {
      conditions.push(
        warn(
          `G-C7-${str(r.screeningType) || "MATCH"}`,
          `Sanctions match: "${str(r.screenedValue)}" score=${Number(r.matchScore) || 0}${r.matchedList ? ` (${r.matchedList})` : ""} — enhanced review required`,
        ),
      );
    }
    logger.debug("[gate/G-C7] verdict", {
      enhancedDd: enhancedDdResults.length,
      fuzzy: fuzzyResults.length,
      verdict: "CONDITIONAL",
    });
    return { verdict: "CONDITIONAL", conditions };
  }

  conditions.push(
    ok("G-C7-OK", `Sanctions screening passed for ${results.length} target(s)`),
  );
  logger.debug("[gate/G-C7] verdict", { results: results.length, verdict: "ALLOW" });
  return { verdict: "ALLOW", conditions };
}

// ============ Merger ============

/**
 * Merge a list of compliance gate results into a single verdict + flattened
 * conditions list. Mirrors the merge semantics used in
 * `gates-jurisdiction.ts` / `gates-regulatory.ts`:
 *
 *   • verdict: strictest of the inputs (DENY > CONDITIONAL > ALLOW)
 *   • conditions: flattened concatenation of every gate's conditions array
 *     (only non-ALLOW gates contribute — ALLOW-only gates carry no
 *     actionable conditions for the operator).
 */
export function mergeComplianceGates(gates: GateResult[]): {
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

  logger.debug("[gate/merge-compliance] merged", {
    gateCount: list.length,
    verdict: merged,
    conditionCount: conditions.length,
  });
  return { verdict: merged, conditions };
}

// @ts-nocheck
// SGTX Governor Gates — Regulatory Product (Phase 2) CCL-XXX §G-R1..G-R4
// ---------------------------------------------------------------------------
// Four advisory Governor gates that validate the assembled
// REGULATORY_PRODUCT_RESULT envelope produced by the Phase 2 orchestrator
// (`src/lib/sgtx/regulatory-product`).
//
//   G-R1  gateClassificationConfidence  — is the classification confident
//                                          enough (and was an HS6 determined)?
//   G-R2  gateTariffValidity             — did the tariff engine compute a
//                                          non-null total duty with at least
//                                          one tariff line?
//   G-R3  gateOriginEligibility          — is the origin (non-preferential
//                                          and, if claimed, preferential)
//                                          determinable + qualifying?
//   G-R4  gateRegulatoryRestrictions     — are there any BLOCK / WARN
//                                          restrictions on the envelope?
//
// Each gate returns `{ verdict, conditions }` following the same convention
// as `gates-jurisdiction.ts`:
//   • verdict: "ALLOW" | "CONDITIONAL" | "DENY"
//   • conditions: list of { id, label, status } for each contributing check
//     where status is one of "ok" | "warn" | "fail" (drives the merged
//     verdict).
//
// Verdict semantics:
//
//   ALLOW        — the dimension under inspection is fully satisfied.
//
//   CONDITIONAL  — the dimension is partially satisfied (e.g. confidence
//                  below threshold, preferential not qualifying but
//                  MFN still applies, WARN restriction present). The trade
//                  MAY proceed, but with a warning surfaced to the operator;
//                  the conditions array explains what to address.
//
//   DENY         — hard block on this dimension (e.g. no HS6, tariff
//                  computation failed entirely, origin basis "unknown",
//                  BLOCK restriction present). The trade must NOT proceed
//                  until the issue is resolved.
//
// These gates are advisory — the Governor orchestrator merges all four
// verdicts (DENY > CONDITIONAL > ALLOW) via `mergeRegulatoryGates` into a
// final per-trade decision. They never make autonomous mutations; they only
// read + report.
//
// NON-MARKETPLACE: these gates never produce scores, rankings, or
// counterparty recommendations. They answer the binary "is this regulatory
// envelope acceptable?" question only.

import { logger } from "@/lib/sgtx/logger";

// ============ Types (mirror gates-jurisdiction.ts) ============

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

const CLASSIFICATION_CONF_ALLOW = 0.85;
const CLASSIFICATION_CONF_REVIEW = 0.6;
const TARIFF_CONF_ALLOW = 0.7;

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

/** Defensive numeric coercion of a confidence field; 0 when not a finite number. */
function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Defensive pct formatter — 0..1 -> "85%". */
function pct(v: number): string {
  return `${(v * 100).toFixed(0)}%`;
}

// ============ G-R1: Classification confidence gate ============

/**
 * G-R1 — Classification confidence gate.
 *
 * Answers: is the product classification confident enough, and was an HS6
 * code actually determined?
 *
 * Verdict matrix:
 *   • no hs6 determined (missing or shorter than 6 digits)  → DENY
 *      (the product is unclassifiable)
 *   • confidence < 0.6                                       → DENY
 *      (classification too weak to act on)
 *   • 0.6 <= confidence < 0.85                              → CONDITIONAL
 *      (human review required before the trade can lock)
 *   • confidence >= 0.85                                     → ALLOW
 */
export function gateClassificationConfidence(result: any): GateResult {
  const conditions: GateCondition[] = [];
  const classification = (result && result.classification) || {};
  const confidence = num(classification.confidence);
  const hs6 = typeof classification.hs6 === "string" ? classification.hs6 : "";

  // HS6 presence check — a missing/short HS6 is a hard DENY.
  if (!hs6 || hs6.length < 6) {
    conditions.push(
      fail(
        "G-R1-HS6",
        `No HS6 determined (hs6="${hs6 || ""}") — product is unclassifiable`,
      ),
    );
    // Still emit the confidence condition so the operator sees both signals.
    conditions.push(
      fail(
        "G-R1-CONF",
        `Classification confidence ${pct(confidence)} — cannot proceed without HS6`,
      ),
    );
    logger.debug("[gate/G-R1] verdict", { hs6, confidence, verdict: "DENY" });
    return { verdict: "DENY", conditions };
  }

  conditions.push(ok("G-R1-HS6", `HS6 determined: ${hs6}`));

  if (confidence < CLASSIFICATION_CONF_REVIEW) {
    conditions.push(
      fail(
        "G-R1-CONF",
        `Classification confidence ${pct(confidence)} < ${pct(CLASSIFICATION_CONF_REVIEW)} — unclassifiable, human re-classification required`,
      ),
    );
    logger.debug("[gate/G-R1] verdict", { hs6, confidence, verdict: "DENY" });
    return { verdict: "DENY", conditions };
  }

  if (confidence < CLASSIFICATION_CONF_ALLOW) {
    conditions.push(
      warn(
        "G-R1-CONF",
        `Classification confidence ${pct(confidence)} in [${pct(CLASSIFICATION_CONF_REVIEW)}, ${pct(CLASSIFICATION_CONF_ALLOW)}) — human review required`,
      ),
    );
    logger.debug("[gate/G-R1] verdict", { hs6, confidence, verdict: "CONDITIONAL" });
    return { verdict: "CONDITIONAL", conditions };
  }

  conditions.push(
    ok(
      "G-R1-CONF",
      `Classification confidence ${pct(confidence)} >= ${pct(CLASSIFICATION_CONF_ALLOW)}`,
    ),
  );
  logger.debug("[gate/G-R1] verdict", { hs6, confidence, verdict: "ALLOW" });
  return { verdict: "ALLOW", conditions };
}

// ============ G-R2: Tariff validity gate ============

/**
 * G-R2 — Tariff validity gate.
 *
 * Answers: did the tariff engine produce a usable tariff computation?
 *
 * Verdict matrix:
 *   • tariff.totalDutyUsd is null/undefined/non-finite   → DENY
 *      (tariff computation failed entirely)
 *   • tariff.lines is empty (no rules matched)            → CONDITIONAL
 *      (the trade MAY proceed under MFN/default, but the
 *        operator should review the missing rate)
 *   • lines.length > 0 AND confidence >= 0.7             → ALLOW
 *   • lines.length > 0 AND confidence < 0.7              → CONDITIONAL
 *      (a rate was applied but the engine is unsure — manual
 *        review recommended)
 */
export function gateTariffValidity(result: any): GateResult {
  const conditions: GateCondition[] = [];
  const tariff = (result && result.tariff) || {};
  const lines = Array.isArray(tariff.lines) ? tariff.lines : [];
  const confidence = num(tariff.confidence);
  const totalDutyUsd = tariff.totalDutyUsd;

  // Total-duty presence check — a null/undefined total is a hard DENY.
  const totalValid =
    typeof totalDutyUsd === "number" && Number.isFinite(totalDutyUsd);
  if (!totalValid) {
    conditions.push(
      fail(
        "G-R2-COMPUTE",
        `Tariff computation failed — totalDutyUsd is ${totalDutyUsd === null ? "null" : totalDutyUsd === undefined ? "undefined" : "non-finite"}`,
      ),
    );
    // Emit secondary signals for diagnostics.
    conditions.push(
      fail(
        "G-R2-LINES",
        `${lines.length} tariff line(s) available (computation incomplete)`,
      ),
    );
    logger.debug("[gate/G-R2] verdict", {
      totalDutyUsd,
      lineCount: lines.length,
      verdict: "DENY",
    });
    return { verdict: "DENY", conditions };
  }

  conditions.push(
    ok("G-R2-COMPUTE", `Total duty USD ${totalDutyUsd.toFixed(2)} computed`),
  );

  // Lines presence check.
  if (lines.length === 0) {
    conditions.push(
      warn(
        "G-R2-LINES",
        "No tariff rules matched — verify HS6/jurisdiction; MFN/default may apply",
      ),
    );
    // Confidence condition for diagnostics.
    conditions.push(
      warn(
        "G-R2-CONF",
        `Tariff confidence ${pct(confidence)} — no rules applied`,
      ),
    );
    logger.debug("[gate/G-R2] verdict", {
      totalDutyUsd,
      lineCount: 0,
      verdict: "CONDITIONAL",
    });
    return { verdict: "CONDITIONAL", conditions };
  }

  conditions.push(ok("G-R2-LINES", `${lines.length} tariff line(s) applied`));

  // Confidence check.
  if (confidence < TARIFF_CONF_ALLOW) {
    conditions.push(
      warn(
        "G-R2-CONF",
        `Tariff confidence ${pct(confidence)} < ${pct(TARIFF_CONF_ALLOW)} — manual rate review recommended`,
      ),
    );
    logger.debug("[gate/G-R2] verdict", {
      totalDutyUsd,
      lineCount: lines.length,
      confidence,
      verdict: "CONDITIONAL",
    });
    return { verdict: "CONDITIONAL", conditions };
  }

  conditions.push(
    ok(
      "G-R2-CONF",
      `Tariff confidence ${pct(confidence)} >= ${pct(TARIFF_CONF_ALLOW)}`,
    ),
  );
  logger.debug("[gate/G-R2] verdict", {
    totalDutyUsd,
    lineCount: lines.length,
    confidence,
    verdict: "ALLOW",
  });
  return { verdict: "ALLOW", conditions };
}

// ============ G-R3: Origin eligibility gate ============

/**
 * G-R3 — Origin eligibility gate.
 *
 * Answers: is the origin of the goods determinable, and — if a preferential
 * claim was made — does the goods actually qualify?
 *
 * Verdict matrix:
 *   • non-preferential basis is "unknown"                  → DENY
 *      (origin could not be determined at all — the trade
 *        cannot proceed because customs cannot clear goods
 *        of unknown origin)
 *   • preferential claimed AND not qualifying              → CONDITIONAL
 *      (MFN still applies, so the trade MAY proceed, but
 *        the operator should be warned that the FTA claim
 *        failed)
 *   • origin.humanReviewRequired === true                  → CONDITIONAL
 *      (origin engine flagged an ambiguous case)
 *   • otherwise                                           → ALLOW
 *
 * Note: G-R3 NEVER returns DENY for a preferential-claim failure —
 * preferential is an *enhancement*, not a hard requirement. The non-preferential
 * origin determination is what's mandatory. A failed preferential claim
 * simply reverts the trade to MFN treatment.
 */
export function gateOriginEligibility(
  result: any,
  claimedPreferential: boolean,
): GateResult {
  const conditions: GateCondition[] = [];
  const origin = (result && result.origin) || {};
  const nonPref = origin.nonPreferential || {};
  const pref = origin.preferential;
  const prefElig = (result && result.preferentialEligibility) || {};

  // Non-preferential basis check — "unknown" is a hard DENY.
  const basis = nonPref.basis || "unknown";
  if (basis === "unknown") {
    conditions.push(
      fail(
        "G-R3-BASIS",
        `Non-preferential origin basis is "unknown" — origin cannot be determined`,
      ),
    );
    logger.debug("[gate/G-R3] verdict", { basis, verdict: "DENY" });
    return { verdict: "DENY", conditions };
  }
  conditions.push(
    ok(
      "G-R3-BASIS",
      `Non-preferential origin determined (basis: ${basis}, country: ${nonPref.originCountry || "?"})`,
    ),
  );

  // Preferential claim check.
  if (claimedPreferential) {
    // The origin engine's preferential.qualifying OR the orchestrator's
    // preferentialEligibility.eligible — either signal counts.
    const prefQualifying =
      prefElig.eligible === true ||
      (pref && pref.qualifying === true);
    if (!prefQualifying) {
      conditions.push(
        warn(
          "G-R3-PREF",
          `Preferential origin claimed (agreement ${prefElig.agreementId || pref?.agreementId || "?"}) but not qualifying — MFN rate applies. Reason: ${prefElig.reason || pref?.reason || "not specified"}`,
        ),
      );
      logger.debug("[gate/G-R3] verdict", {
        basis,
        claimed: true,
        qualifying: false,
        verdict: "CONDITIONAL",
      });
      return { verdict: "CONDITIONAL", conditions };
    }
    conditions.push(
      ok(
        "G-R3-PREF",
        `Preferential origin qualifying under agreement ${prefElig.agreementId || pref?.agreementId || "?"}`,
      ),
    );
  } else {
    conditions.push(ok("G-R3-PREF", "Preferential origin not claimed (MFN applies)"));
  }

  // Human-review flag.
  if (origin.humanReviewRequired === true) {
    conditions.push(
      warn(
        "G-R3-REVIEW",
        "Origin engine flagged human review required — ambiguous rule application",
      ),
    );
    logger.debug("[gate/G-R3] verdict", {
      basis,
      humanReviewRequired: true,
      verdict: "CONDITIONAL",
    });
    return { verdict: "CONDITIONAL", conditions };
  }

  logger.debug("[gate/G-R3] verdict", { basis, claimed: claimedPreferential, verdict: "ALLOW" });
  return { verdict: "ALLOW", conditions };
}

// ============ G-R4: Regulatory restrictions gate ============

/**
 * G-R4 — Regulatory restrictions gate.
 *
 * Answers: does the assembled envelope carry any BLOCK or WARN restrictions?
 *
 * Verdict matrix:
 *   • any restriction with severity === "BLOCK"            → DENY
 *      (e.g. CITES Appendix I, dual-use without license,
 *        pharma without GMP — the trade is blocked by
 *        hard regulatory constraint)
 *   • any restriction with severity === "WARN" (no BLOCK)  → CONDITIONAL
 *      (e.g. quota exhausted, preferential not qualifying —
 *        the trade MAY proceed but the operator must
 *        acknowledge the warning)
 *   • no restrictions OR all INFO                          → ALLOW
 *
 * INFO restrictions are surfaced as `ok` conditions for diagnostics but
 * do NOT affect the verdict.
 */
export function gateRegulatoryRestrictions(result: any): GateResult {
  const conditions: GateCondition[] = [];
  const restrictions = Array.isArray(result?.restrictions) ? result.restrictions : [];

  const blockList = restrictions.filter(
    (r: any) => r && r.severity === "BLOCK",
  );
  const warnList = restrictions.filter(
    (r: any) => r && r.severity === "WARN",
  );
  const infoList = restrictions.filter(
    (r: any) => r && r.severity === "INFO",
  );

  // Surface each INFO restriction as an "ok" diagnostic condition.
  for (const r of infoList) {
    conditions.push(
      ok(
        `G-R4-INFO-${r.type || "UNKNOWN"}`,
        `INFO: ${r.description || "(no description)"}`,
      ),
    );
  }

  if (blockList.length > 0) {
    for (const r of blockList) {
      conditions.push(
        fail(
          `G-R4-BLOCK-${r.type || "UNKNOWN"}`,
          `BLOCK: ${r.description || "(no description)"}`,
        ),
      );
    }
    logger.debug("[gate/G-R4] verdict", {
      blockCount: blockList.length,
      warnCount: warnList.length,
      verdict: "DENY",
    });
    return { verdict: "DENY", conditions };
  }

  if (warnList.length > 0) {
    for (const r of warnList) {
      conditions.push(
        warn(
          `G-R4-WARN-${r.type || "UNKNOWN"}`,
          `WARN: ${r.description || "(no description)"}`,
        ),
      );
    }
    logger.debug("[gate/G-R4] verdict", {
      blockCount: 0,
      warnCount: warnList.length,
      verdict: "CONDITIONAL",
    });
    return { verdict: "CONDITIONAL", conditions };
  }

  conditions.push(
    ok("G-R4-OK", "No BLOCK or WARN restrictions on the regulatory envelope"),
  );
  logger.debug("[gate/G-R4] verdict", {
    blockCount: 0,
    warnCount: 0,
    infoCount: infoList.length,
    verdict: "ALLOW",
  });
  return { verdict: "ALLOW", conditions };
}

// ============ Merger ============

/**
 * Merge a list of regulatory gate results into a single verdict + flattened
 * conditions list. Mirrors the merge semantics used in
 * `gates-jurisdiction.ts` / `gates-phase2.ts`:
 *
 *   • verdict: strictest of the inputs (DENY > CONDITIONAL > ALLOW)
 *   • conditions: flattened concatenation of every gate's conditions array
 *     (only non-ALLOW gates contribute — ALLOW-only gates carry no
 *     actionable conditions for the operator).
 *
 * Re-uses the verdict-rank approach (DENY=2, CONDITIONAL=1, ALLOW=0).
 */
export function mergeRegulatoryGates(gates: GateResult[]): {
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

  logger.debug("[gate/merge-regulatory] merged", {
    gateCount: list.length,
    verdict: merged,
    conditionCount: conditions.length,
  });
  return { verdict: merged, conditions };
}

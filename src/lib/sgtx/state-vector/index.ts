// @ts-nocheck
/**
 * SGTX Master Amendment — §6-8 State Vector Engine
 * ===========================================================================
 *
 * Implements the multi-clock, multi-dimensional transaction reality model
 * from §6 (Multi-Clock Transaction Reality), §7 (State Vector), and §8
 * (the 12 state domains). A USTN's "state" is no longer a single column —
 * it is a 12-dimensional vector, one per orthogonal clock:
 *
 *   1.  execution           — physical/operational execution progress
 *   2.  financial           — financial / payment state
 *   3.  legal               — contract / legal state
 *   4.  physicalOperational — goods / logistics state
 *   5.  documentary        — document state (LC, BL, CoO, inspection…)
 *   6.  compliance         — regulatory compliance state
 *   7.  regulatory         — regulatory submissions / permits
 *   8.  counterparty       — counterparty readiness / KYC
 *   9.  reconciliation     — financial + document reconciliation
 *   10. dispute            — dispute / claim state
 *   11. exposure           — financial exposure subledger state
 *   12. closure            — closure policy state
 *
 * §9 — Finality Classes F0..F5:
 *
 *   F0  — PRE_FINAL          nothing is settled yet
 *   F1  — PROVISIONAL        some intermediate state is recorded but revocable
 *   F2  — CONDITIONAL        state recorded under a condition (LC, escrow…)
 *   F3  — IRREVOCABLE        state is final under SGTX authority
 *   F4  — SETTLED            underlying settlement executed (bank conf.)
 *   F5  — SUPERSEDED         superseded by a later event
 *
 * §95-98 — Divergence Index (NONE | LOW | MEDIUM | HIGH | CRITICAL) and
 * Transaction Health (GREEN | YELLOW | ORANGE | RED | BLACK) are pure
 * functions of the state vector — see `computeDivergenceIndex` and
 * `computeTransactionHealth`.
 *
 * `computeStateIntegrity` returns a 0..1 score reflecting how aligned the
 * 12 domains are and how complete the evidence base is.
 *
 * All DB calls are try/catch-wrapped with safe defaults — the engine never
 * throws synchronously into API routes.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ §8 Constants — the 12 state domains ============

/**
 * §8 — the 12 state domains of the transaction state vector. Each domain
 * has an independent clock and may be in any of {PENDING, IN_PROGRESS,
 * COMPLETED, FAILED, REVERSED} (the dispute / exposure / closure domains
 * use specialized vocabularies such as NONE / OPEN / RESOLVED).
 */
export const STATE_VECTOR_DOMAINS = [
  "execution",
  "financial",
  "legal",
  "physicalOperational",
  "documentary",
  "compliance",
  "regulatory",
  "counterparty",
  "reconciliation",
  "dispute",
  "exposure",
  "closure",
] as const;

export type StateDomain = (typeof STATE_VECTOR_DOMAINS)[number];

/**
 * §9 — Finality classes F0..F5.
 */
export const FINALITY_CLASSES = [
  "F0", // PRE_FINAL
  "F1", // PROVISIONAL
  "F2", // CONDITIONAL
  "F3", // IRREVOCABLE
  "F4", // SETTLED
  "F5", // SUPERSEDED
] as const;

/**
 * Default PENDING-style value for each domain — used by getOrCreate.
 */
const DOMAIN_DEFAULTS: Record<StateDomain, string> = {
  execution: "PENDING",
  financial: "PENDING",
  legal: "PENDING",
  physicalOperational: "PENDING",
  documentary: "PENDING",
  compliance: "PENDING",
  regulatory: "PENDING",
  counterparty: "PENDING",
  reconciliation: "PENDING",
  dispute: "NONE",
  exposure: "NONE",
  closure: "OPEN",
};

/**
 * §95 — Divergence Index buckets.
 */
export const DIVERGENCE_LEVELS = [
  "NONE",
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
] as const;

/**
 * §96 — Transaction Health bands.
 */
export const TRANSACTION_HEALTH_LEVELS = [
  "GREEN",
  "YELLOW",
  "ORANGE",
  "RED",
  "BLACK",
] as const;

// ============ Types ============

export interface StateVector {
  id: string;
  ustn: string;
  execution: string;
  financial: string;
  legal: string;
  physicalOperational: string;
  documentary: string;
  compliance: string;
  regulatory: string;
  counterparty: string;
  reconciliation: string;
  dispute: string;
  exposure: string;
  closure: string;
  finalityClass: string;
  stateIntegrityScore?: number | null;
  reconciliationConfidence?: number | null;
  divergenceIndex?: string | null;
  transactionHealth?: string | null;
  lastUpdated: Date;
  createdAt: Date;
}

export interface StateDomainUpdate {
  domain: StateDomain;
  value: string;
  reason?: string;
}

// ============ §7.0 Pure helpers ============

/**
 * Pure: compute the set of unique non-default values across the 12
 * domains. A vector is "divergent" when domains disagree about whether
 * the trade is COMPLETED.
 */
function domainValues(sv: Pick<StateVector, StateDomain>): string[] {
  return STATE_VECTOR_DOMAINS.map((d) => String(sv[d] || "").toUpperCase());
}

/**
 * Pure: count the domains in a "terminal" state (COMPLETED, RESOLVED,
 * SETTLED, NONE, CLOSED, USTN_CLOSED) vs "in-progress" vs "blocked"
 * (FAILED, REVERSED, REJECTED, OPEN, REOPENED, DIVERGENT).
 *
 * Returns { terminal, inProgress, blocked }.
 */
function classifyDomains(sv: Pick<StateVector, StateDomain>): {
  terminal: number;
  inProgress: number;
  blocked: number;
} {
  const TERMINAL = new Set([
    "COMPLETED",
    "SETTLED",
    "RESOLVED",
    "ACCEPTED",
    "SEALED",
    "CLOSED",
    "USTN_CLOSED",
    "NONE",
  ]);
  const BLOCKED = new Set([
    "FAILED",
    "REVERSED",
    "REJECTED",
    "OPEN",
    "REOPENED",
    "DIVERGENT",
    "BLOCKED",
    "ESCALATED",
  ]);
  let terminal = 0;
  let inProgress = 0;
  let blocked = 0;
  for (const v of domainValues(sv)) {
    if (!v || v === "PENDING") continue;
    if (TERMINAL.has(v)) terminal++;
    else if (BLOCKED.has(v)) blocked++;
    else if (v === "IN_PROGRESS" || v === "PROCESSING" || v === "SUBMITTED") inProgress++;
    else inProgress++;
  }
  return { terminal, inProgress, blocked };
}

/**
 * Pure: compute the §95 divergence index for a state vector.
 *
 * Divergence measures how far the 12 domains are from a single
 * consistent reality. Algorithm:
 *
 *   - blocked domains are weighted 3x.
 *   - in-progress domains count once.
 *   - terminal + pending contribute 0 (terminal is fine; pending is
 *     the default and adds no divergence).
 *
 *   NONE      — divergence <= 0
 *   LOW       — 1-2 in-progress, 0 blocked
 *   MEDIUM    — 3-4 in-progress OR 1 blocked
 *   HIGH      — 5+ in-progress OR 2 blocked
 *   CRITICAL  — 3+ blocked
 */
export function computeDivergenceIndex(
  sv: Pick<StateVector, StateDomain>,
): string {
  if (!sv) return "NONE";
  const { inProgress, blocked } = classifyDomains(sv);
  const score = inProgress + blocked * 3;
  if (blocked >= 3) return "CRITICAL";
  if (blocked >= 2 || score >= 5) return "HIGH";
  if (blocked === 1 || score >= 3) return "MEDIUM";
  if (inProgress >= 1) return "LOW";
  return "NONE";
}

/**
 * Pure: compute the §96 transaction health band. Combines:
 *
 *   - blocked domains → drives RED / BLACK
 *   - divergenceIndex  → escalates one band
 *   - dispute domain (OPEN/REOPENED) → drops to YELLOW at best
 *
 *   GREEN  — all domains terminal/PENDING, no disputes, divergence NONE
 *   YELLOW — some in-progress, no blocked, divergence <= LOW
 *   ORANGE — divergence MEDIUM or exposure OPEN
 *   RED    — divergence HIGH or blocked domains present
 *   BLACK  — divergence CRITICAL OR closure FAILED/REVERSED
 */
export function computeTransactionHealth(
  sv: Pick<StateVector, StateDomain> & {
    divergenceIndex?: string | null;
  },
): string {
  if (!sv) return "GREEN";
  const { inProgress, blocked } = classifyDomains(sv);
  const dispute = String(sv.dispute || "NONE").toUpperCase();
  const exposure = String(sv.exposure || "NONE").toUpperCase();
  const closure = String(sv.closure || "OPEN").toUpperCase();
  const divergence = String(
    sv.divergenceIndex || computeDivergenceIndex(sv),
  ).toUpperCase();

  // BLACK: closure failed/reversed OR divergence CRITICAL
  if (
    closure === "FAILED" ||
    closure === "REVERSED" ||
    divergence === "CRITICAL"
  ) {
    return "BLACK";
  }
  // RED: any blocked domain OR divergence HIGH
  if (blocked > 0 || divergence === "HIGH") return "RED";
  // ORANGE: divergence MEDIUM OR exposure open/reopened
  if (
    divergence === "MEDIUM" ||
    exposure === "OPEN" ||
    exposure === "REOPENED"
  ) {
    return "ORANGE";
  }
  // YELLOW: dispute open OR any in-progress OR divergence LOW
  if (
    dispute === "OPEN" ||
    dispute === "REOPENED" ||
    inProgress > 0 ||
    divergence === "LOW"
  ) {
    return "YELLOW";
  }
  // GREEN: all terminal/pending
  return "GREEN";
}

/**
 * Pure: compute the §97 state integrity score (0..1). Combines:
 *
 *   - source-agreement: terminal domains should agree with closure
 *   - evidence completeness: terminal + blocked > 0 implies evidence
 *
 * Algorithm (deterministic, no DB):
 *   start = 1.0
 *   - blocked domains   : -0.15 each (capped at 0.6)
 *   - divergence penalty: NONE=0, LOW=0.05, MEDIUM=0.15, HIGH=0.30, CRITICAL=0.60
 *   - dispute OPEN       : -0.10
 *   - exposure OPEN      : -0.05
 *   - closure FAILED     : -0.20
 *   clamp to [0, 1]
 */
export function computeStateIntegrity(
  sv: Pick<StateVector, StateDomain> & {
    divergenceIndex?: string | null;
  },
): number {
  if (!sv) return 0;
  const { blocked } = classifyDomains(sv);
  const divergence = String(
    sv.divergenceIndex || computeDivergenceIndex(sv),
  ).toUpperCase();
  const dispute = String(sv.dispute || "NONE").toUpperCase();
  const exposure = String(sv.exposure || "NONE").toUpperCase();
  const closure = String(sv.closure || "OPEN").toUpperCase();

  let score = 1.0;
  score -= Math.min(0.6, blocked * 0.15);
  const divPenalty: Record<string, number> = {
    NONE: 0,
    LOW: 0.05,
    MEDIUM: 0.15,
    HIGH: 0.3,
    CRITICAL: 0.6,
  };
  score -= divPenalty[divergence] ?? 0;
  if (dispute === "OPEN" || dispute === "REOPENED") score -= 0.1;
  if (exposure === "OPEN" || exposure === "REOPENED") score -= 0.05;
  if (closure === "FAILED" || closure === "REVERSED") score -= 0.2;

  return Math.max(0, Math.min(1, score));
}

/**
 * Pure: compute the §9 finality class for a state vector.
 *
 *   F5 SUPERSEDED     — closure is REVERSED or SUPERSEDED
 *   F4 SETTLED        — financial=SETTLED + closure=USTN_CLOSED + reconciliation=RESOLVED
 *   F3 IRREVOCABLE    — financial=SETTLED + documentary=SEALED + reconciliation=MATCHED
 *   F2 CONDITIONAL    — financial in [AUTHORIZED, SUBMITTED] or documentary=LC_ISSUED
 *   F1 PROVISIONAL    — any domain IN_PROGRESS or documentary=DRAFT
 *   F0 PRE_FINAL      — otherwise
 */
export function computeFinalityClass(
  sv: Pick<StateVector, StateDomain>,
): string {
  if (!sv) return "F0";
  const financial = String(sv.financial || "PENDING").toUpperCase();
  const documentary = String(sv.documentary || "PENDING").toUpperCase();
  const reconciliation = String(sv.reconciliation || "PENDING").toUpperCase();
  const closure = String(sv.closure || "OPEN").toUpperCase();

  if (closure === "REVERSED" || closure === "SUPERSEDED") return "F5";
  if (
    financial === "SETTLED" &&
    closure === "USTN_CLOSED" &&
    reconciliation === "RESOLVED"
  ) {
    return "F4";
  }
  if (
    financial === "SETTLED" &&
    (documentary === "SEALED" || documentary === "COMPLETED") &&
    (reconciliation === "MATCHED" || reconciliation === "RESOLVED")
  ) {
    return "F3";
  }
  if (
    ["AUTHORIZED", "SUBMITTED", "PROCESSING", "IN_PROGRESS"].includes(financial) ||
    documentary === "LC_ISSUED" ||
    documentary === "AWAITING_CONFIRMATION"
  ) {
    return "F2";
  }
  if (
    financial === "IN_PROGRESS" ||
    documentary === "DRAFT" ||
    documentary === "IN_PROGRESS" ||
    financial === "PARTIALLY_SETTLED"
  ) {
    return "F1";
  }
  return "F0";
}

/**
 * Pure: serialize a divergence index recompute payload back to the
 * canonical column shape. Helper for callers that want to know what
 * the engine would write without making a DB call.
 */
export function deriveMetrics(
  sv: Pick<StateVector, StateDomain>,
): {
  finalityClass: string;
  divergenceIndex: string;
  transactionHealth: string;
  stateIntegrityScore: number;
} {
  const divergenceIndex = computeDivergenceIndex(sv);
  const transactionHealth = computeTransactionHealth({ ...sv, divergenceIndex });
  const stateIntegrityScore = computeStateIntegrity({ ...sv, divergenceIndex });
  const finalityClass = computeFinalityClass(sv);
  return {
    finalityClass,
    divergenceIndex,
    transactionHealth,
    stateIntegrityScore,
  };
}

// ============ §7.1 getOrCreateStateVector ============

/**
 * Get the TransactionStateVector for a USTN, creating it (with all 12
 * domains at their PENDING/NONE/OPEN defaults + finalityClass=F0) if it
 * does not already exist.
 *
 * Returns a fresh F0 vector on error.
 */
export async function getOrCreateStateVector(
  ustn: string,
): Promise<StateVector> {
  if (!ustn) throw new Error("ustn is required");
  // Try fetch first
  try {
    const existing = await db.transactionStateVector.findUnique({
      where: { ustn },
    });
    if (existing) return existing as StateVector;
  } catch (err) {
    logger.warn("[state-vector] findUnique failed — will attempt create", {
      error: String(err),
      ustn,
    });
  }
  // Create
  try {
    const row = await db.transactionStateVector.create({
      data: {
        ustn,
        execution: DOMAIN_DEFAULTS.execution,
        financial: DOMAIN_DEFAULTS.financial,
        legal: DOMAIN_DEFAULTS.legal,
        physicalOperational: DOMAIN_DEFAULTS.physicalOperational,
        documentary: DOMAIN_DEFAULTS.documentary,
        compliance: DOMAIN_DEFAULTS.compliance,
        regulatory: DOMAIN_DEFAULTS.regulatory,
        counterparty: DOMAIN_DEFAULTS.counterparty,
        reconciliation: DOMAIN_DEFAULTS.reconciliation,
        dispute: DOMAIN_DEFAULTS.dispute,
        exposure: DOMAIN_DEFAULTS.exposure,
        closure: DOMAIN_DEFAULTS.closure,
        finalityClass: "F0",
      },
    });
    logger.info("[state-vector] state vector created (F0)", { ustn });
    return row as StateVector;
  } catch (err) {
    // Race condition: another worker created it between our find + create
    try {
      const existing = await db.transactionStateVector.findUnique({
        where: { ustn },
      });
      if (existing) return existing as StateVector;
    } catch (err2) {
      logger.error("[state-vector] fallback findUnique also failed", {
        error: String(err2),
        ustn,
      });
    }
    logger.error("[state-vector] create failed — returning fresh F0 in-memory", {
      error: String(err),
      ustn,
    });
    const now = new Date();
    return {
      id: "",
      ustn,
      execution: DOMAIN_DEFAULTS.execution,
      financial: DOMAIN_DEFAULTS.financial,
      legal: DOMAIN_DEFAULTS.legal,
      physicalOperational: DOMAIN_DEFAULTS.physicalOperational,
      documentary: DOMAIN_DEFAULTS.documentary,
      compliance: DOMAIN_DEFAULTS.compliance,
      regulatory: DOMAIN_DEFAULTS.regulatory,
      counterparty: DOMAIN_DEFAULTS.counterparty,
      reconciliation: DOMAIN_DEFAULTS.reconciliation,
      dispute: DOMAIN_DEFAULTS.dispute,
      exposure: DOMAIN_DEFAULTS.exposure,
      closure: DOMAIN_DEFAULTS.closure,
      finalityClass: "F0",
      stateIntegrityScore: null,
      reconciliationConfidence: null,
      divergenceIndex: null,
      transactionHealth: null,
      lastUpdated: now,
      createdAt: now,
    };
  }
}

// ============ §7.2 updateStateDomain ============

/**
 * Update a single state domain for a USTN. Auto-creates the state vector
 * if it doesn't exist. Recomputes finalityClass / divergenceIndex /
 * transactionHealth / stateIntegrityScore after the update.
 *
 * Returns the updated state vector (or null on error).
 */
export async function updateStateDomain(
  ustn: string,
  domain: StateDomain,
  value: string,
  reason?: string,
): Promise<StateVector | null> {
  if (!ustn) throw new Error("ustn is required");
  if (!STATE_VECTOR_DOMAINS.includes(domain as StateDomain)) {
    throw new Error(`unknown state domain: ${domain}`);
  }
  try {
    const sv = await getOrCreateStateVector(ustn);
    const updated = { ...sv, [domain]: value } as StateVector;
    const metrics = deriveMetrics(updated);
    const row = await db.transactionStateVector.update({
      where: { ustn },
      data: {
        [domain]: value,
        finalityClass: metrics.finalityClass,
        divergenceIndex: metrics.divergenceIndex,
        transactionHealth: metrics.transactionHealth,
        stateIntegrityScore: metrics.stateIntegrityScore,
      },
    });
    logger.info("[state-vector] domain updated", {
      ustn,
      domain,
      value,
      reason,
      finalityClass: metrics.finalityClass,
      health: metrics.transactionHealth,
      divergence: metrics.divergenceIndex,
    });
    return row as StateVector;
  } catch (err) {
    logger.error("[state-vector] updateStateDomain failed", {
      error: String(err),
      ustn,
      domain,
      value,
    });
    return null;
  }
}

/**
 * Update multiple state domains in one call. Recomputes all metrics once
 * after applying all updates.
 */
export async function updateStateDomains(
  ustn: string,
  updates: StateDomainUpdate[],
): Promise<StateVector | null> {
  if (!ustn) throw new Error("ustn is required");
  if (!Array.isArray(updates) || updates.length === 0) {
    return getStateVector(ustn);
  }
  try {
    const sv = await getOrCreateStateVector(ustn);
    const data: Record<string, any> = {};
    const next: any = { ...sv };
    for (const u of updates) {
      if (!STATE_VECTOR_DOMAINS.includes(u.domain as StateDomain)) continue;
      data[u.domain] = u.value;
      next[u.domain] = u.value;
    }
    if (Object.keys(data).length === 0) return sv as StateVector;
    const metrics = deriveMetrics(next);
    data.finalityClass = metrics.finalityClass;
    data.divergenceIndex = metrics.divergenceIndex;
    data.transactionHealth = metrics.transactionHealth;
    data.stateIntegrityScore = metrics.stateIntegrityScore;
    const row = await db.transactionStateVector.update({
      where: { ustn },
      data,
    });
    logger.info("[state-vector] batch update applied", {
      ustn,
      domains: Object.keys(data).filter(
        (k) =>
          !k.endsWith("Class") &&
          !k.endsWith("Index") &&
          !k.endsWith("Health") &&
          !k.endsWith("Score"),
      ),
    });
    return row as StateVector;
  } catch (err) {
    logger.error("[state-vector] updateStateDomains failed", {
      error: String(err),
      ustn,
    });
    return null;
  }
}

// ============ §7.3 getStateVector ============

/**
 * Get the full state vector for a USTN. Returns null if not found or on
 * error. Does NOT auto-create — use `getOrCreateStateVector` for that.
 */
export async function getStateVector(
  ustn: string,
): Promise<StateVector | null> {
  if (!ustn) return null;
  try {
    const row = await db.transactionStateVector.findUnique({
      where: { ustn },
    });
    return (row as StateVector) || null;
  } catch (err) {
    logger.error("[state-vector] getStateVector failed", {
      error: String(err),
      ustn,
    });
    return null;
  }
}

// ============ §9 computeFinalityClassForUstn (DB wrapper) ============

/**
 * Async wrapper around the pure `computeFinalityClass`. Loads the state
 * vector for the USTN and returns the recomputed finality class. Returns
 * "F0" on error or not-found.
 */
export async function computeFinalityClassForUstn(
  ustn: string,
): Promise<string> {
  const sv = await getStateVector(ustn);
  if (!sv) return "F0";
  return computeFinalityClass(sv);
}

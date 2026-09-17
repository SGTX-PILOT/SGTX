// @ts-nocheck
/**
 * SGTX Master Amendment — §89 Transaction Twin Engine
 * ===========================================================================
 *
 * Implements the §89 Transaction Twin — the live logical representation
 * of a transaction. The twin is NOT a copy of the trade row; it is the
 * rolled-up, multi-domain view that the AI governor sees:
 *
 *   - obligations         — §66 obligation graph (IDs)
 *   - actors              — counterparty + auxiliary actor GTIDs
 *   - dependencies       — dependency graph (obligation + entity)
 *   - documents          — document set
 *   - financialState     — payment + exposure summary
 *   - legalState         — contract / LC state
 *   - executionState     — physical execution
 *   - physicalState      — goods + logistics
 *   - complianceState    — customs / SPS / TBT
 *   - evidence           — evidence references
 *   - exceptions         — exception IDs
 *   - exposure           — exposure summary
 *   - recoveryPaths     — recovery path IDs
 *   - closureConditions — closure checklist state
 *
 * §22 — Post-Closure Observation: after closure, the twin stays alive
 * for a jurisdiction-specific period (e.g. 90 days post-closure) so
 * that late-arriving events (reconciliation breaks, dispute reopenings,
 * tax adjustments) can still be applied + observed.
 *
 * All DB calls are try/catch-wrapped with safe defaults — the engine
 * never throws synchronously into API routes.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ §89 Constants — twin domains ============

/**
 * §89 — the 14 domains of the Transaction Twin. Each is a JSON-serialized
 * column on the TransactionTwin row.
 */
export const TWIN_DOMAINS = [
  "obligations",
  "actors",
  "dependencies",
  "documents",
  "financialState",
  "legalState",
  "executionState",
  "physicalState",
  "complianceState",
  "evidence",
  "exceptions",
  "exposure",
  "recoveryPaths",
  "closureConditions",
] as const;

export type TwinDomain = (typeof TWIN_DOMAINS)[number];

/**
 * §22 — Post-closure observation periods (jurisdiction-specific).
 */
export const POST_CLOSURE_PERIODS = [
  { code: "NONE", days: 0, description: "No post-closure observation" },
  { code: "P30", days: 30, description: "30 days post-closure" },
  { code: "P90", days: 90, description: "90 days post-closure (default)" },
  { code: "P180", days: 180, description: "180 days post-closure" },
  { code: "P365", days: 365, description: "1 year post-closure (high-risk)" },
  { code: "P1095", days: 1095, description: "3 years (legal/tax disputes)" },
] as const;

// ============ Types ============

export interface TransactionTwinRow {
  id: string;
  ustn: string;
  stateVectorId?: string | null;
  obligations?: string | null;
  actors?: string | null;
  dependencies?: string | null;
  documents?: string | null;
  financialState?: string | null;
  legalState?: string | null;
  executionState?: string | null;
  physicalState?: string | null;
  complianceState?: string | null;
  evidence?: string | null;
  exceptions?: string | null;
  exposure?: string | null;
  recoveryPaths?: string | null;
  closureConditions?: string | null;
  postClosurePeriod?: string | null;
  postClosureActive: boolean;
  lastUpdated: Date;
  createdAt: Date;
}

// ============ §89.0 Pure helpers ============

/**
 * Pure: parse a JSON-encoded twin domain. Defensive — returns []
 * for array domains and {} for object domains.
 */
export function parseTwinDomain(
  raw: unknown,
  as: "array" | "object" = "array",
): any[] | Record<string, any> {
  if (Array.isArray(raw)) return as === "array" ? (raw as any[]) : {};
  if (raw && typeof raw === "object") return as === "object" ? (raw as Record<string, any>) : [];
  if (typeof raw !== "string" || !raw) return as === "array" ? [] : {};
  try {
    const parsed = JSON.parse(raw);
    if (as === "array") return Array.isArray(parsed) ? parsed : [];
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return as === "array" ? [] : {};
  }
}

/**
 * Pure: serialize a twin domain value to JSON.
 */
export function serializeTwinDomain(value: any): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

// ============ §89.1 getOrCreateTransactionTwin ============

/**
 * Get the TransactionTwin for a USTN, creating it (with all domains empty)
 * if it does not already exist. Auto-links the TransactionStateVector id.
 *
 * Returns a fresh empty twin on error.
 */
export async function getOrCreateTransactionTwin(
  ustn: string,
): Promise<TransactionTwinRow> {
  if (!ustn) throw new Error("ustn is required");
  try {
    const existing = await db.transactionTwin.findUnique({
      where: { ustn },
    });
    if (existing) return existing as TransactionTwinRow;
  } catch (err) {
    logger.warn("[transaction-twin] findUnique failed — will attempt create", {
      error: String(err),
      ustn,
    });
  }

  // Resolve stateVectorId (best-effort)
  let stateVectorId: string | null = null;
  try {
    const sv = await db.transactionStateVector.findUnique({
      where: { ustn },
      select: { id: true },
    });
    if (sv) stateVectorId = sv.id;
  } catch (err) {
    logger.warn("[transaction-twin] could not resolve stateVectorId", {
      error: String(err),
      ustn,
    });
  }

  try {
    const row = await db.transactionTwin.create({
      data: {
        ustn,
        stateVectorId,
        postClosurePeriod: null,
        postClosureActive: false,
      },
    });
    logger.info("[transaction-twin] twin created", { ustn, stateVectorId });
    return row as TransactionTwinRow;
  } catch (err) {
    // Race: another worker created it
    try {
      const existing = await db.transactionTwin.findUnique({
        where: { ustn },
      });
      if (existing) return existing as TransactionTwinRow;
    } catch (err2) {
      logger.error("[transaction-twin] fallback findUnique failed", {
        error: String(err2),
        ustn,
      });
    }
    logger.error("[transaction-twin] create failed — returning fresh in-memory", {
      error: String(err),
      ustn,
    });
    const now = new Date();
    return {
      id: "",
      ustn,
      stateVectorId: null,
      obligations: null,
      actors: null,
      dependencies: null,
      documents: null,
      financialState: null,
      legalState: null,
      executionState: null,
      physicalState: null,
      complianceState: null,
      evidence: null,
      exceptions: null,
      exposure: null,
      recoveryPaths: null,
      closureConditions: null,
      postClosurePeriod: null,
      postClosureActive: false,
      lastUpdated: now,
      createdAt: now,
    };
  }
}

// ============ §89.2 updateTwinDomain ============

/**
 * Update a single domain of the transaction twin. The data is JSON-serialized
 * before being stored. Auto-creates the twin if it doesn't exist.
 *
 * Returns the updated twin, or null on error.
 */
export async function updateTwinDomain(
  ustn: string,
  domain: TwinDomain,
  data: any,
): Promise<TransactionTwinRow | null> {
  if (!ustn) throw new Error("ustn is required");
  if (!TWIN_DOMAINS.includes(domain as TwinDomain)) {
    throw new Error(`unknown twin domain: ${domain}`);
  }
  try {
    const twin = await getOrCreateTransactionTwin(ustn);
    const serialized = serializeTwinDomain(data);
    const updated = await db.transactionTwin.update({
      where: { ustn },
      data: { [domain]: serialized },
    });
    logger.info("[transaction-twin] domain updated", {
      ustn,
      domain,
      byteSize: serialized.length,
    });
    return updated as TransactionTwinRow;
  } catch (err) {
    logger.error("[transaction-twin] updateTwinDomain failed", {
      error: String(err),
      ustn,
      domain,
    });
    return null;
  }
}

/**
 * Update multiple twin domains at once. Auto-creates the twin.
 */
export async function updateTwinDomains(
  ustn: string,
  updates: Partial<Record<TwinDomain, any>>,
): Promise<TransactionTwinRow | null> {
  if (!ustn) throw new Error("ustn is required");
  if (!updates || Object.keys(updates).length === 0) {
    return getTransactionTwin(ustn);
  }
  try {
    await getOrCreateTransactionTwin(ustn);
    const data: Record<string, string | null> = {};
    for (const domain of Object.keys(updates) as TwinDomain[]) {
      if (!TWIN_DOMAINS.includes(domain)) continue;
      data[domain] = serializeTwinDomain(updates[domain]);
    }
    if (Object.keys(data).length === 0) return getTransactionTwin(ustn);
    const updated = await db.transactionTwin.update({
      where: { ustn },
      data,
    });
    logger.info("[transaction-twin] batch domain update", {
      ustn,
      domains: Object.keys(data),
    });
    return updated as TransactionTwinRow;
  } catch (err) {
    logger.error("[transaction-twin] updateTwinDomains failed", {
      error: String(err),
      ustn,
    });
    return null;
  }
}

// ============ §89.3 getTransactionTwin ============

/**
 * Get the full twin for a USTN. Returns null if not found. Does NOT
 * auto-create — use `getOrCreateTransactionTwin` for that.
 */
export async function getTransactionTwin(
  ustn: string,
): Promise<TransactionTwinRow | null> {
  if (!ustn) return null;
  try {
    const row = await db.transactionTwin.findUnique({
      where: { ustn },
    });
    return (row as TransactionTwinRow) || null;
  } catch (err) {
    logger.error("[transaction-twin] getTransactionTwin failed", {
      error: String(err),
      ustn,
    });
    return null;
  }
}

// ============ §22 activatePostClosure ============

/**
 * §22 — Activate post-closure observation on the twin. Sets
 * `postClosureActive=true` and records the jurisdiction-specific period.
 *
 * After activation, the twin stays alive (and SGTX continues to record
 * events on the canonical spine) until the period elapses, so late-arriving
 * reconciliation breaks or dispute reopenings can still be applied.
 *
 * Returns the updated twin, or null on error.
 */
export async function activatePostClosure(
  ustn: string,
  period: string = "P90",
): Promise<TransactionTwinRow | null> {
  if (!ustn) throw new Error("ustn is required");
  const validPeriod = POST_CLOSURE_PERIODS.find((p) => p.code === period);
  if (!validPeriod) {
    logger.warn("[transaction-twin] unknown post-closure period", {
      ustn,
      period,
    });
  }
  try {
    const twin = await getOrCreateTransactionTwin(ustn);
    const updated = await db.transactionTwin.update({
      where: { ustn },
      data: {
        postClosurePeriod: period,
        postClosureActive: true,
      },
    });
    logger.info("[transaction-twin] post-closure observation activated", {
      ustn,
      period,
      days: validPeriod?.days,
    });
    return updated as TransactionTwinRow;
  } catch (err) {
    logger.error("[transaction-twin] activatePostClosure failed", {
      error: String(err),
      ustn,
      period,
    });
    return null;
  }
}

/**
 * §22 — Deactivate post-closure observation. Called after the period
 * elapses or when the operator manually ends observation.
 */
export async function deactivatePostClosure(
  ustn: string,
): Promise<TransactionTwinRow | null> {
  if (!ustn) return null;
  try {
    const updated = await db.transactionTwin.update({
      where: { ustn },
      data: { postClosureActive: false },
    });
    logger.info("[transaction-twin] post-closure observation deactivated", {
      ustn,
    });
    return updated as TransactionTwinRow;
  } catch (err) {
    logger.error("[transaction-twin] deactivatePostClosure failed", {
      error: String(err),
      ustn,
    });
    return null;
  }
}

/**
 * §22 — Check if post-closure observation is currently active for a USTN.
 * Returns false on error or if no twin exists.
 */
export async function isPostClosureActive(
  ustn: string,
): Promise<boolean> {
  if (!ustn) return false;
  try {
    const twin = await db.transactionTwin.findUnique({
      where: { ustn },
      select: { postClosureActive: true, postClosurePeriod: true, lastUpdated: true },
    });
    if (!twin) return false;
    if (!twin.postClosureActive) return false;
    // Check if period has elapsed
    const period = POST_CLOSURE_PERIODS.find(
      (p) => p.code === twin.postClosurePeriod,
    );
    if (!period || period.days === 0) return twin.postClosureActive;
    const elapsedMs = Date.now() - new Date(twin.lastUpdated).getTime();
    const periodMs = period.days * 24 * 3600 * 1000;
    if (elapsedMs > periodMs) {
      // Auto-deactivate
      try {
        await db.transactionTwin.update({
          where: { ustn },
          data: { postClosureActive: false },
        });
        logger.info("[transaction-twin] post-closure auto-expired", {
          ustn,
          period: twin.postClosurePeriod,
        });
        return false;
      } catch (err) {
        logger.warn("[transaction-twin] auto-expire failed", {
          error: String(err),
          ustn,
        });
      }
    }
    return twin.postClosureActive;
  } catch (err) {
    logger.error("[transaction-twin] isPostClosureActive failed", {
      error: String(err),
      ustn,
    });
    return false;
  }
}

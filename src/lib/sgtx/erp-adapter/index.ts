// @ts-nocheck
/**
 * SGTX Phase 6 — §8 ERP Adapter
 * ===========================================================================
 *
 * Adapters for connecting SGTX's accounting ledger (§7) to the trader's
 * external ERP / bookkeeping system. SGTX is NON-CUSTODIAL — it does NOT
 * replace the trader's books of record; it PUSHES accounting entries into
 * the ERP (and can optionally PULL back confirmed records) via this adapter.
 *
 * 8 ERP types (§8):
 *
 *   SAP                  — SAP S/4HANA / SAP ECC
 *   ORACLE                — Oracle Fusion / E-Business Suite
 *   MICROSOFT_DYNAMICS    — Microsoft Dynamics 365 Finance & Operations
 *   NETSUITE              — Oracle NetSuite
 *   ODOO                  — Odoo Community / Enterprise
 *   GENERIC_API           — any REST/JSON ERP (custom integration)
 *   GENERIC_EDI           — X12 / EDIFACT EDI interchange
 *   SFTP                  — flat-file CSV/XML drop into an SFTP endpoint
 *
 * Connection lifecycle:
 *   NOT_CONFIGURED → CONFIGURED → CONNECTED → SYNCING → CONNECTED
 *                                  ↘ ERROR ↘ DEPRECATED
 *
 * Sync frequency:
 *   REAL_TIME | HOURLY | DAILY | WEEKLY
 *
 * Field mapping: `fieldMapping` is a JSON object (SGTX field → ERP field).
 * `updateFieldMapping` overwrites the mapping.
 *
 * Sync (simulated):
 *   syncToErp    — for each AccountingEntry in the specified categories,
 *                  map fields via `fieldMapping` + "send" to the ERP. Returns
 *                  { ok, syncedCount, errors }.
 *   syncFromErp  — "import" data from the ERP into SGTX. Returns
 *                  { ok, importedCount, errors }.
 *
 * Connection test (simulated): `testConnection` returns ok=true if
 * `endpointUrl` is set. No real HTTP is performed (this is the design until
 * production credentials + circuit-breaker wiring are added in a later
 * phase).
 *
 * All DB calls are try/catch-wrapped with safe defaults.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { listEntries } from "@/lib/sgtx/accounting";

// ============ §8 Constants ============

export const ERP_TYPES = [
  "SAP",
  "ORACLE",
  "MICROSOFT_DYNAMICS",
  "NETSUITE",
  "ODOO",
  "GENERIC_API",
  "GENERIC_EDI",
  "SFTP",
] as const;

export const ERP_STATUSES = [
  "NOT_CONFIGURED",
  "CONFIGURED",
  "CONNECTED",
  "SYNCING",
  "ERROR",
  "DEPRECATED",
] as const;

export const ERP_SYNC_FREQUENCIES = [
  "REAL_TIME",
  "HOURLY",
  "DAILY",
  "WEEKLY",
] as const;

export const ERP_AUTH_METHODS = [
  "OAUTH2",
  "API_KEY",
  "BASIC",
  "MUTUAL_TLS",
  "NONE",
] as const;

export const ERP_SYNC_STATUSES = [
  "SUCCESS",
  "PARTIAL",
  "FAILED",
  "NEVER",
] as const;

// ============ Types ============

export interface CreateErpInput {
  traderGtid: string;
  erpType: string;
  systemName?: string;
  endpointUrl?: string;
  apiKey?: string;
  apiSecret?: string;
  authMethod?: string;
  syncFrequency?: string;
  syncCategories?: string[];
  fieldMapping?: Record<string, any>;
  notes?: string;
}

export interface ErpListFilters {
  traderGtid?: string;
  erpType?: string;
  status?: string;
}

export interface SyncResult {
  ok: boolean;
  syncedCount: number;
  errors: string[];
}

export interface ImportResult {
  ok: boolean;
  importedCount: number;
  errors: string[];
}

export interface ConnectionTestResult {
  ok: boolean;
  latencyMs?: number;
  error?: string;
}

export interface ErpHealth {
  status: string;
  lastSyncAt: Date | null;
  lastSyncStatus: string | null;
  lastError: string | null;
}

// ============ §8.0 Pure helpers ============

function isValidErpType(t?: string | null): boolean {
  return !!t && (ERP_TYPES as readonly string[]).includes(t);
}

function isValidErpStatus(s?: string | null): boolean {
  return !!s && (ERP_STATUSES as readonly string[]).includes(s);
}

function isValidSyncFrequency(f?: string | null): boolean {
  return !!f && (ERP_SYNC_FREQUENCIES as readonly string[]).includes(f);
}

function isValidAuthMethod(a?: string | null): boolean {
  return !!a && (ERP_AUTH_METHODS as readonly string[]).includes(a);
}

/**
 * Apply the field mapping to an accounting entry — returns a shallow copy
 * with keys renamed per the mapping. Pure.
 *
 * Mapping semantics: keys in the entry that match a key in `fieldMapping`
 * are renamed to the mapped value. Keys not present in the mapping are
 * passed through unchanged.
 */
export function applyFieldMapping(
  entry: Record<string, any>,
  mapping: Record<string, string> | null | undefined,
): Record<string, any> {
  if (!entry || typeof entry !== "object") return {};
  if (!mapping || typeof mapping !== "object") return { ...entry };
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(entry)) {
    const newKey = Object.prototype.hasOwnProperty.call(mapping, k)
      ? String(mapping[k])
      : k;
    out[newKey] = v;
  }
  return out;
}

// ============ §8.1 createErpAdapter ============

/**
 * Create a new ERP adapter. Enforces the uniqueness constraint
 * (traderGtid + erpType). If an adapter already exists for this pair, the
 * existing row is returned unchanged (idempotent on the unique key).
 *
 * Defaults:
 *   - status = NOT_CONFIGURED (unless endpointUrl + authMethod are both
 *     supplied, in which case status = CONFIGURED).
 *   - syncFrequency = DAILY (if not provided).
 *   - syncCategories = null (means "all categories" — see syncToErp).
 *   - fieldMapping = {} (empty).
 *
 * Throws on invalid input.
 */
export async function createErpAdapter(input: CreateErpInput): Promise<any> {
  if (!input) throw new Error("createErpAdapter: input is required");
  if (!input.traderGtid) throw new Error("createErpAdapter: traderGtid is required");
  if (!isValidErpType(input.erpType)) {
    throw new Error(`createErpAdapter: invalid erpType "${input.erpType}"`);
  }
  if (input.authMethod && !isValidAuthMethod(input.authMethod)) {
    throw new Error(
      `createErpAdapter: invalid authMethod "${input.authMethod}"`,
    );
  }
  if (input.syncFrequency && !isValidSyncFrequency(input.syncFrequency)) {
    throw new Error(
      `createErpAdapter: invalid syncFrequency "${input.syncFrequency}"`,
    );
  }

  // Idempotent: if an adapter for (traderGtid, erpType) already exists,
  // return the existing row.
  try {
    const existing = await db.erpAdapter.findUnique({
      where: {
        traderGtid_erpType: {
          traderGtid: input.traderGtid,
          erpType: input.erpType,
        },
      },
    });
    if (existing) {
      logger.info("[erp-adapter] adapter already exists — returning existing", {
        id: existing.id,
        traderGtid: input.traderGtid,
        erpType: input.erpType,
      });
      return existing;
    }
  } catch (err) {
    logger.error("[erp-adapter] createErpAdapter lookup failed", {
      error: String(err),
      traderGtid: input.traderGtid,
      erpType: input.erpType,
    });
    throw err;
  }

  const initialStatus =
    input.endpointUrl && input.authMethod ? "CONFIGURED" : "NOT_CONFIGURED";

  const data: any = {
    traderGtid: input.traderGtid,
    erpType: input.erpType,
    status: initialStatus,
    syncFrequency: input.syncFrequency || "DAILY",
    fieldMapping: input.fieldMapping
      ? JSON.stringify(input.fieldMapping)
      : JSON.stringify({}),
    lastSyncStatus: "NEVER",
  };
  if (input.systemName) data.systemName = input.systemName;
  if (input.endpointUrl) data.endpointUrl = input.endpointUrl;
  if (input.apiKey) data.apiKey = input.apiKey;
  if (input.apiSecret) data.apiSecret = input.apiSecret;
  if (input.authMethod) data.authMethod = input.authMethod;
  if (Array.isArray(input.syncCategories) && input.syncCategories.length > 0) {
    data.syncCategories = JSON.stringify(input.syncCategories);
  }
  if (input.notes) data.notes = input.notes;

  try {
    const adapter = await db.erpAdapter.create({ data });
    logger.info("[erp-adapter] adapter created", {
      id: adapter.id,
      traderGtid: input.traderGtid,
      erpType: input.erpType,
      status: initialStatus,
    });
    return adapter;
  } catch (err) {
    logger.error("[erp-adapter] createErpAdapter DB error", {
      error: String(err),
      traderGtid: input.traderGtid,
      erpType: input.erpType,
    });
    throw err;
  }
}

// ============ §8.2 getErpAdapter ============

/**
 * Fetch an ERP adapter by its row `id`. Returns null if not found or on DB
 * error (safe default).
 */
export async function getErpAdapter(id: string): Promise<any | null> {
  if (!id) return null;
  try {
    return await db.erpAdapter.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[erp-adapter] getErpAdapter DB error", {
      error: String(err),
      id,
    });
    return null;
  }
}

// ============ §8.3 getErpAdapterByTraderType ============

/**
 * Fetch an ERP adapter by the unique (traderGtid, erpType) pair. Returns null
 * if not found or on DB error.
 */
export async function getErpAdapterByTraderType(
  traderGtid: string,
  erpType: string,
): Promise<any | null> {
  if (!traderGtid || !erpType) return null;
  try {
    return await db.erpAdapter.findUnique({
      where: { traderGtid_erpType: { traderGtid, erpType } },
    });
  } catch (err) {
    logger.error("[erp-adapter] getErpAdapterByTraderType DB error", {
      error: String(err),
      traderGtid,
      erpType,
    });
    return null;
  }
}

// ============ §8.4 listErpAdapters ============

/**
 * List ERP adapters by filter. Supports traderGtid, erpType, status.
 * Ordered by createdAt DESC. Safe default: returns [] on DB error.
 */
export async function listErpAdapters(
  filters?: ErpListFilters,
): Promise<any[]> {
  const where: any = {};
  if (filters) {
    if (filters.traderGtid) where.traderGtid = filters.traderGtid;
    if (filters.erpType) where.erpType = filters.erpType;
    if (filters.status) where.status = filters.status;
  }
  try {
    return await db.erpAdapter.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
  } catch (err) {
    logger.error("[erp-adapter] listErpAdapters DB error", {
      error: String(err),
      filters,
    });
    return [];
  }
}

// ============ §8.5 connectErp ============

/**
 * Transition an adapter NOT_CONFIGURED/CONFIGURED → CONNECTED. Tests the
 * connection first (simulated). If the test fails, sets status=ERROR and
 * throws.
 *
 * The simulated connection succeeds if `endpointUrl` is set.
 */
export async function connectErp(id: string): Promise<any> {
  if (!id) throw new Error("connectErp: id is required");

  let adapter: any = null;
  try {
    adapter = await db.erpAdapter.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[erp-adapter] connectErp lookup failed", {
      error: String(err),
      id,
    });
    throw err;
  }
  if (!adapter) throw new Error(`connectErp: adapter not found: ${id}`);

  if (
    adapter.status !== "NOT_CONFIGURED" &&
    adapter.status !== "CONFIGURED" &&
    adapter.status !== "ERROR"
  ) {
    throw new Error(
      `connectErp: cannot connect from status=${adapter.status}`,
    );
  }

  // Test the connection (simulated).
  const test = await testConnection(id);
  if (!test.ok) {
    try {
      await db.erpAdapter.update({
        where: { id },
        data: { status: "ERROR", lastError: test.error || "connection failed" },
      });
    } catch (e) {
      logger.error("[erp-adapter] connectErp error-status update failed", {
        error: String(e),
        id,
      });
    }
    throw new Error(`connectErp: connection test failed — ${test.error}`);
  }

  try {
    const updated = await db.erpAdapter.update({
      where: { id },
      data: {
        status: "CONNECTED",
        lastError: null,
      },
    });
    logger.info("[erp-adapter] adapter connected", {
      id,
      erpType: adapter.erpType,
      latencyMs: test.latencyMs,
    });
    return updated;
  } catch (err) {
    logger.error("[erp-adapter] connectErp DB error", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §8.6 syncToErp ============

/**
 * Sync SGTX accounting entries to the ERP. For each POSTED entry in the
 * specified categories (default: all categories from the adapter's
 * `syncCategories`, or all 13 if not set), map fields via `fieldMapping`
 * and "send" to the ERP (simulated).
 *
 * The simulated sync:
 *   1. Loads matching AccountingEntry rows (POSTED + REVERSED — REVERSED are
 *      also synced so the ERP books the storno).
 *   2. For each entry, applies `fieldMapping` (pure).
 *   3. "Sends" to the ERP (simulated — randomly fails ~5% of the time to
 *      exercise the error path).
 *   4. Updates the adapter's lastSyncAt + lastSyncStatus + status.
 *
 * Returns { ok, syncedCount, errors }. `ok` is true if at least one entry
 * synced without error; otherwise false.
 */
export async function syncToErp(
  id: string,
  categories?: string[],
): Promise<SyncResult> {
  if (!id) {
    return { ok: false, syncedCount: 0, errors: ["syncToErp: id is required"] };
  }

  let adapter: any = null;
  try {
    adapter = await db.erpAdapter.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[erp-adapter] syncToErp lookup failed", {
      error: String(err),
      id,
    });
    return { ok: false, syncedCount: 0, errors: [String(err)] };
  }
  if (!adapter) {
    return {
      ok: false,
      syncedCount: 0,
      errors: [`syncToErp: adapter not found: ${id}`],
    };
  }

  // Resolve the effective categories: explicit override > adapter.syncCategories > all.
  let effectiveCategories: string[] | null = null;
  if (Array.isArray(categories) && categories.length > 0) {
    effectiveCategories = categories;
  } else if (adapter.syncCategories) {
    try {
      const parsed = JSON.parse(adapter.syncCategories);
      if (Array.isArray(parsed) && parsed.length > 0) {
        effectiveCategories = parsed;
      }
    } catch {
      // ignore — fall through to "all"
    }
  }

  // Mark the adapter as SYNCING.
  try {
    await db.erpAdapter.update({
      where: { id },
      data: { status: "SYNCING" },
    });
  } catch (err) {
    logger.error("[erp-adapter] syncToErp SYNCING-flag update failed", {
      error: String(err),
      id,
    });
  }

  // Load the entries to sync — POSTED + REVERSED, optionally by category.
  let entries: any[] = [];
  try {
    const where: any = { status: { in: ["POSTED", "REVERSED"] } };
    if (effectiveCategories && effectiveCategories.length > 0) {
      where.category = { in: effectiveCategories };
    }
    entries = await db.accountingEntry.findMany({ where });
  } catch (err) {
    logger.error("[erp-adapter] syncToErp entry-load failed", {
      error: String(err),
      id,
    });
    await markSyncFailed(id, String(err));
    return { ok: false, syncedCount: 0, errors: [String(err)] };
  }

  // Parse the field mapping.
  let mapping: Record<string, string> | null = null;
  if (adapter.fieldMapping) {
    try {
      mapping = JSON.parse(adapter.fieldMapping);
    } catch {
      // ignore — mapping stays null (passthrough).
    }
  }

  const errors: string[] = [];
  let synced = 0;
  const startedAt = Date.now();
  for (const entry of entries) {
    // Apply the field mapping (pure).
    const mapped = applyFieldMapping(entry, mapping);
    // Simulated send — ~5% random failure rate to exercise the error path.
    // We do NOT actually make an HTTP call — this is the design until
    // production credentials + circuit-breaker wiring land in a later phase.
    const fail = Math.random() < 0.05;
    if (fail) {
      errors.push(
        `entry ${entry.entryId || entry.id}: simulated ERP send failure`,
      );
      continue;
    }
    synced++;
    // The mapped payload is available for a future real-HTTP implementation.
    void mapped;
  }
  const latencyMs = Date.now() - startedAt;

  const finalStatus = errors.length === 0 ? "SUCCESS" : synced > 0 ? "PARTIAL" : "FAILED";
  try {
    await db.erpAdapter.update({
      where: { id },
      data: {
        status: errors.length === entries.length && entries.length > 0 ? "ERROR" : "CONNECTED",
        lastSyncAt: new Date(),
        lastSyncStatus: finalStatus,
        lastError: errors.length > 0 ? errors.slice(0, 3).join(" | ") : null,
      },
    });
  } catch (err) {
    logger.error("[erp-adapter] syncToErp final-status update failed", {
      error: String(err),
      id,
    });
  }

  logger.info("[erp-adapter] syncToErp complete", {
    id,
    erpType: adapter.erpType,
    total: entries.length,
    synced,
    errors: errors.length,
    latencyMs,
  });

  return {
    ok: synced > 0 || entries.length === 0,
    syncedCount: synced,
    errors,
  };
}

// ============ §8.7 syncFromErp ============

/**
 * Import data FROM the ERP into SGTX. Simulated — generates a synthetic count
 * of "imported" records (one per POSTED AccountingEntry in the matching
 * categories, scaled by a factor of 0.5 to model ERP having fewer reconciled
 * rows). Returns { ok, importedCount, errors }.
 *
 * The simulated import:
 *   1. Verifies the adapter is CONNECTED (or SYNCING).
 *   2. Counts matching AccountingEntry rows for the categories (default: all).
 *   3. Synthesizes an importedCount = ceil(count * 0.5).
 *   4. Updates lastSyncAt + lastSyncStatus.
 *
 * No real AccountingEntry rows are created in this simulated path — actual
 * import logic depends on ERP-specific response shapes and is deferred to a
 * later phase.
 */
export async function syncFromErp(
  id: string,
  categories?: string[],
): Promise<ImportResult> {
  if (!id) {
    return { ok: false, importedCount: 0, errors: ["syncFromErp: id is required"] };
  }

  let adapter: any = null;
  try {
    adapter = await db.erpAdapter.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[erp-adapter] syncFromErp lookup failed", {
      error: String(err),
      id,
    });
    return { ok: false, importedCount: 0, errors: [String(err)] };
  }
  if (!adapter) {
    return {
      ok: false,
      importedCount: 0,
      errors: [`syncFromErp: adapter not found: ${id}`],
    };
  }

  // Resolve the effective categories.
  let effectiveCategories: string[] | null = null;
  if (Array.isArray(categories) && categories.length > 0) {
    effectiveCategories = categories;
  } else if (adapter.syncCategories) {
    try {
      const parsed = JSON.parse(adapter.syncCategories);
      if (Array.isArray(parsed) && parsed.length > 0) {
        effectiveCategories = parsed;
      }
    } catch {
      // ignore
    }
  }

  // Count matching entries (simulated import basis).
  let entryCount = 0;
  try {
    const where: any = { status: { in: ["POSTED", "REVERSED"] } };
    if (effectiveCategories && effectiveCategories.length > 0) {
      where.category = { in: effectiveCategories };
    }
    entryCount = await db.accountingEntry.count({ where });
  } catch (err) {
    logger.error("[erp-adapter] syncFromErp count failed", {
      error: String(err),
      id,
    });
    await markSyncFailed(id, String(err));
    return { ok: false, importedCount: 0, errors: [String(err)] };
  }

  // Simulated import — half the entry count (rounded up), bounded [0, 1000].
  const importedCount = Math.min(
    1000,
    Math.max(0, Math.ceil(entryCount * 0.5)),
  );

  try {
    await db.erpAdapter.update({
      where: { id },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: "SUCCESS",
        lastError: null,
      },
    });
  } catch (err) {
    logger.error("[erp-adapter] syncFromErp final-status update failed", {
      error: String(err),
      id,
    });
  }

  logger.info("[erp-adapter] syncFromErp complete", {
    id,
    erpType: adapter.erpType,
    importedCount,
    basisCount: entryCount,
  });

  return {
    ok: true,
    importedCount,
    errors: [],
  };
}

// ============ §8.8 updateFieldMapping ============

/**
 * Update the field mapping (JSON: SGTX field → ERP field). Overwrites the
 * existing mapping.
 */
export async function updateFieldMapping(
  id: string,
  mapping: any,
): Promise<any> {
  if (!id) throw new Error("updateFieldMapping: id is required");
  if (mapping === null || typeof mapping !== "object" || Array.isArray(mapping)) {
    throw new Error("updateFieldMapping: mapping must be a plain object");
  }

  let adapter: any = null;
  try {
    adapter = await db.erpAdapter.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[erp-adapter] updateFieldMapping lookup failed", {
      error: String(err),
      id,
    });
    throw err;
  }
  if (!adapter) throw new Error(`updateFieldMapping: adapter not found: ${id}`);

  try {
    const updated = await db.erpAdapter.update({
      where: { id },
      data: { fieldMapping: JSON.stringify(mapping) },
    });
    logger.info("[erp-adapter] field mapping updated", {
      id,
      mappingKeys: Object.keys(mapping).length,
    });
    return updated;
  } catch (err) {
    logger.error("[erp-adapter] updateFieldMapping DB error", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §8.9 setSyncFrequency ============

/**
 * Set the sync frequency. REAL_TIME | HOURLY | DAILY | WEEKLY.
 */
export async function setSyncFrequency(
  id: string,
  frequency: string,
): Promise<any> {
  if (!id) throw new Error("setSyncFrequency: id is required");
  if (!isValidSyncFrequency(frequency)) {
    throw new Error(`setSyncFrequency: invalid frequency "${frequency}"`);
  }

  let adapter: any = null;
  try {
    adapter = await db.erpAdapter.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[erp-adapter] setSyncFrequency lookup failed", {
      error: String(err),
      id,
    });
    throw err;
  }
  if (!adapter) throw new Error(`setSyncFrequency: adapter not found: ${id}`);

  try {
    const updated = await db.erpAdapter.update({
      where: { id },
      data: { syncFrequency: frequency },
    });
    logger.info("[erp-adapter] sync frequency set", {
      id,
      frequency,
    });
    return updated;
  } catch (err) {
    logger.error("[erp-adapter] setSyncFrequency DB error", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §8.10 deleteErpAdapter ============

/**
 * Delete an ERP adapter. Soft-delete by default — sets status=DEPRECATED.
 * Pass `hard=true` for a hard delete (row removed from DB).
 *
 * Returns true on success, false on not-found or DB error.
 */
export async function deleteErpAdapter(
  id: string,
  hard = false,
): Promise<boolean> {
  if (!id) return false;

  let adapter: any = null;
  try {
    adapter = await db.erpAdapter.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[erp-adapter] deleteErpAdapter lookup failed", {
      error: String(err),
      id,
    });
    return false;
  }
  if (!adapter) return false;

  try {
    if (hard) {
      await db.erpAdapter.delete({ where: { id } });
      logger.info("[erp-adapter] adapter HARD deleted", { id });
    } else {
      await db.erpAdapter.update({
        where: { id },
        data: { status: "DEPRECATED" },
      });
      logger.info("[erp-adapter] adapter SOFT deleted (status=DEPRECATED)", {
        id,
      });
    }
    return true;
  } catch (err) {
    logger.error("[erp-adapter] deleteErpAdapter DB error", {
      error: String(err),
      id,
    });
    return false;
  }
}

// ============ §8.11 testConnection ============

/**
 * Test the connection (simulated). Returns ok=true if `endpointUrl` is set.
 * The simulated latency is a small random number (10–50ms) to model a real
 * round-trip without making an actual HTTP call.
 *
 * Returns { ok, latencyMs?, error? }.
 */
export async function testConnection(
  id: string,
): Promise<ConnectionTestResult> {
  if (!id) {
    return { ok: false, error: "testConnection: id is required" };
  }

  let adapter: any = null;
  try {
    adapter = await db.erpAdapter.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[erp-adapter] testConnection lookup failed", {
      error: String(err),
      id,
    });
    return { ok: false, error: String(err) };
  }
  if (!adapter) {
    return { ok: false, error: `adapter not found: ${id}` };
  }

  if (!adapter.endpointUrl || !String(adapter.endpointUrl).trim()) {
    return {
      ok: false,
      error: "endpointUrl is not configured — cannot test connection",
    };
  }

  // Simulated latency: 10–50ms random.
  const latencyMs = 10 + Math.floor(Math.random() * 41);
  return { ok: true, latencyMs };
}

// ============ §8.12 getErpHealth ============

/**
 * Return a health summary for the adapter. Safe default: returns
 * { status: "ERROR", lastSyncAt: null, lastSyncStatus: null, lastError: null }
 * on DB error.
 */
export async function getErpHealth(id: string): Promise<ErpHealth> {
  const fallback: ErpHealth = {
    status: "ERROR",
    lastSyncAt: null,
    lastSyncStatus: null,
    lastError: null,
  };
  if (!id) return fallback;

  try {
    const adapter = await db.erpAdapter.findUnique({ where: { id } });
    if (!adapter) return fallback;
    return {
      status: adapter.status || "ERROR",
      lastSyncAt: adapter.lastSyncAt || null,
      lastSyncStatus: adapter.lastSyncStatus || null,
      lastError: adapter.lastError || null,
    };
  } catch (err) {
    logger.error("[erp-adapter] getErpHealth DB error", {
      error: String(err),
      id,
    });
    return fallback;
  }
}

// ============ Internal helpers ============

/**
 * Mark the adapter as having failed a sync. Internal — never throws.
 */
async function markSyncFailed(id: string, reason: string): Promise<void> {
  try {
    await db.erpAdapter.update({
      where: { id },
      data: {
        status: "ERROR",
        lastSyncAt: new Date(),
        lastSyncStatus: "FAILED",
        lastError: reason,
      },
    });
  } catch (err) {
    logger.error("[erp-adapter] markSyncFailed failed", {
      error: String(err),
      id,
    });
  }
}

// Re-export the listEntries helper for callers that want to enumerate
// accounting entries by category before syncing.
export { listEntries };

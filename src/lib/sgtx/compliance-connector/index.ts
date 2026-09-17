// @ts-nocheck
// SGTX Phase 3 — Compliance Connector Registry (CCL-016 §8 admin)
// ---------------------------------------------------------------------------
// The §8 admin registry of which Phase 3 subsystem connectors are connected,
// missing, or degraded per jurisdiction. Each row maps a (subsystem,
// jurisdictionCode) tuple to a real-world data source — GOV_API / GOV_PORTAL /
// DATA_FEED / MANUAL / OFFICIAL_LIST — and tracks its operational health:
//
//   CONNECTED     — connector is live and syncing.
//   DEGRADED      — connector is up but last sync was PARTIAL or FAILED.
//   MISSING       — no connector is registered for this (subsystem,
//                  jurisdiction); the orchestrator will still run, but with
//                  reduced confidence.
//   NOT_AVAILABLE — connector is intentionally disabled.
//   PLANNED       — connector is on the roadmap but not yet wired.
//
// Subsystem enum (mirrors prisma/schema.prisma `ComplianceConnector.subsystem`):
//   LICENSE | PERMIT | CERTIFICATE | SPS | TBT | CONTROLLED_GOODS | SANCTIONS
//
// This lib is consumed by the SGTX admin UI ("missing per jurisdiction" view,
// overall coverage %, per-subsystem health breakdown) and by the orchestrator
// (which uses the per-subsystem confidence score when computing overallConfidence
// — currently the orchestrator uses fixed baselines; a future task can wire
// the connector confidence into the orchestrator's weighting).
//
// Design rules (mandatory per the SGTX convention):
//   • // @ts-nocheck at the top.
//   • Every DB call wrapped in try/catch with safe defaults (return null / []
//   / a stub on failure; never throws).
//   • Uses `import { db } from "@/lib/db"` and
//   `import { logger } from "@/lib/sgtx/logger"`.
//   • Upsert finds an existing row by the natural key
//   `(subsystem, jurisdictionCode)` and updates; or creates when no match.

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

import type { ComplianceConnector, JurisdictionFabric } from "@prisma/client";
export type { ComplianceConnector };

// ============ Exported constants ============

/**
 * The 7 Phase 3 subsystems. Order is canonical (mirrors the orchestrator
 * execution order and the prisma `ComplianceConnector.subsystem` enum).
 */
export const SUBSYSTEMS = [
  "LICENSE",
  "PERMIT",
  "CERTIFICATE",
  "SPS",
  "TBT",
  "CONTROLLED_GOODS",
  "SANCTIONS",
] as const;

/** Connector statuses (mirror prisma `ComplianceConnector.status`). */
export const CONNECTOR_STATUSES = [
  "CONNECTED",
  "DEGRADED",
  "MISSING",
  "NOT_AVAILABLE",
  "PLANNED",
] as const;

/** Connector types (mirror prisma `ComplianceConnector.connectorType`). */
export const CONNECTOR_TYPES = [
  "GOV_API",
  "GOV_PORTAL",
  "DATA_FEED",
  "MANUAL",
  "OFFICIAL_LIST",
] as const;

// ============ Exported interfaces ============

export interface UpsertConnectorInput {
  subsystem: string;
  jurisdictionId?: string;
  jurisdictionCode?: string;
  connectorName: string;
  connectorType: string;
  endpointUrl?: string;
  apiKeyRequired?: boolean;
  apiKeyConfigured?: boolean;
  authMethod?: string;
  status?: string;
  lastSyncAt?: Date;
  lastSyncStatus?: string;
  lastError?: string;
  coveragePct?: number;
  confidenceScore?: number;
  notes?: string;
}

export interface ConnectorHealth {
  total: number;
  connected: number;
  degraded: number;
  missing: number;
  notAvailable: number;
  planned: number;
  coveragePctAvg: number;
}

export interface MissingConnectorRow {
  subsystem: string;
  jurisdictionCode: string;
  jurisdictionName: string;
  connectorName: string;
  status: string;
  lastError?: string;
}

// ============ Internal helpers ============

/** Defensive string coercion. */
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Defensive number coercion (defaults 0). */
function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Shape a raw DB row into the ComplianceConnector (passthrough — kept for symmetry). */
function shape(row: any): ComplianceConnector | null {
  if (!row || typeof row !== "object") return null;
  return row as ComplianceConnector;
}

// ============ List / get ============

/**
 * listComplianceConnectors — list connectors with optional filters.
 *
 * @param filters  Optional { subsystem, status, jurisdictionCode } filter.
 * @returns       Array of ComplianceConnector rows (empty on error).
 */
export async function listComplianceConnectors(
  filters?: { subsystem?: string; status?: string; jurisdictionCode?: string },
): Promise<ComplianceConnector[]> {
  try {
    const where: Record<string, unknown> = {};
    if (filters && str(filters.subsystem)) where.subsystem = filters.subsystem;
    if (filters && str(filters.status)) where.status = filters.status;
    if (filters && str(filters.jurisdictionCode)) where.jurisdictionCode = filters.jurisdictionCode;

    const rows = await db.complianceConnector.findMany({
      where,
      orderBy: [{ subsystem: "asc" }, { jurisdictionCode: "asc" }],
    });
    return (rows || []).map(shape).filter(Boolean) as ComplianceConnector[];
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.error("[compliance-connector] listComplianceConnectors failed", { filters, error: reason });
    return [];
  }
}

/**
 * getComplianceConnector — fetch a single connector by its id.
 *
 * @returns The connector, or null if not found / on error.
 */
export async function getComplianceConnector(id: string): Promise<ComplianceConnector | null> {
  if (!str(id)) return null;
  try {
    const row = await db.complianceConnector.findUnique({ where: { id } });
    return shape(row);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.error("[compliance-connector] getComplianceConnector failed", { id, error: reason });
    return null;
  }
}

/**
 * getConnectorBySubsystemJurisdiction — fetch a connector by its natural key
 * (subsystem, jurisdictionCode). jurisdictionCode may be null/empty to denote
 * a global source (e.g. OFAC SDN list applies globally — not per-jurisdiction).
 *
 * @returns The connector, or null if not found / on error.
 */
export async function getConnectorBySubsystemJurisdiction(
  subsystem: string,
  jurisdictionCode: string,
): Promise<ComplianceConnector | null> {
  const sub = str(subsystem);
  if (!sub) return null;
  try {
    // Use findFirst with explicit null handling — Prisma treats { connector: null }
    // differently across versions; here we match either null or empty string
    // (defensive) when jurisdictionCode is empty.
    const jc = str(jurisdictionCode);
    const row = await db.complianceConnector.findFirst({
      where: jc
        ? { subsystem: sub, jurisdictionCode: jc }
        : { subsystem: sub, OR: [{ jurisdictionCode: null }, { jurisdictionCode: "" }] },
    });
    return shape(row);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.error("[compliance-connector] getConnectorBySubsystemJurisdiction failed", { subsystem, jurisdictionCode, error: reason });
    return null;
  }
}

// ============ Upsert ============

/**
 * upsertComplianceConnector — create or update a connector row by its natural
 * key (subsystem, jurisdictionCode).
 *
 * On any DB failure, the function returns a minimal in-memory stub so the
 * caller (admin UI / API) can continue rather than crash. The stub is NOT
 * persisted — callers should treat persistence failures as a degraded state
 * surfaced via the returned object's `id` (prefixed "tmp-").
 *
 * @returns The created / updated ComplianceConnector (or stub on error).
 */
export async function upsertComplianceConnector(
  input: UpsertConnectorInput,
): Promise<ComplianceConnector> {
  const subsystem = str(input?.subsystem);
  const jc = str(input?.jurisdictionCode) || null;
  const connectorName = str(input?.connectorName);
  const connectorType = str(input?.connectorType);

  if (!subsystem || !connectorName || !connectorType) {
    logger.error("[compliance-connector] upsertComplianceConnector invalid input", { subsystem, connectorName, connectorType });
    return {
      id: `tmp-invalid-${Date.now()}`,
      subsystem,
      jurisdictionId: str(input?.jurisdictionId) || null,
      jurisdictionCode: jc,
      connectorName,
      connectorType,
      endpointUrl: str(input?.endpointUrl) || null,
      apiKeyRequired: input?.apiKeyRequired === true,
      apiKeyConfigured: input?.apiKeyConfigured === true,
      authMethod: str(input?.authMethod) || null,
      status: str(input?.status) || "MISSING",
      lastSyncAt: input?.lastSyncAt ?? null,
      lastSyncStatus: str(input?.lastSyncStatus) || null,
      lastError: str(input?.lastError) || null,
      coveragePct: num(input?.coveragePct),
      confidenceScore: typeof input?.confidenceScore === "number" ? input.confidenceScore : null,
      notes: str(input?.notes) || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as ComplianceConnector;
  }

  const data = {
    subsystem,
    jurisdictionCode: jc,
    jurisdictionId: str(input?.jurisdictionId) || null,
    connectorName,
    connectorType,
    endpointUrl: str(input?.endpointUrl) || null,
    apiKeyRequired: input?.apiKeyRequired === true,
    apiKeyConfigured: input?.apiKeyConfigured === true,
    authMethod: str(input?.authMethod) || null,
    status: str(input?.status) || "MISSING",
    lastSyncAt: input?.lastSyncAt ?? null,
    lastSyncStatus: str(input?.lastSyncStatus) || null,
    lastError: str(input?.lastError) || null,
    coveragePct: num(input?.coveragePct),
    confidenceScore: typeof input?.confidenceScore === "number" ? input.confidenceScore : null,
    notes: str(input?.notes) || null,
  };

  try {
    // Find existing row by natural key (subsystem + jurisdictionCode OR null).
    const existing = await db.complianceConnector.findFirst({
      where: jc
        ? { subsystem, jurisdictionCode: jc }
        : { subsystem, OR: [{ jurisdictionCode: null }, { jurisdictionCode: "" }] },
    });

    if (existing) {
      const updated = await db.complianceConnector.update({
        where: { id: existing.id },
        data,
      });
      return shape(updated) as ComplianceConnector;
    }

    const created = await db.complianceConnector.create({ data });
    return shape(created) as ComplianceConnector;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.error("[compliance-connector] upsertComplianceConnector DB failure", { subsystem, jurisdictionCode: jc, error: reason });
    return {
      id: `tmp-error-${Date.now()}`,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as ComplianceConnector;
  }
}

// ============ Delete ============

/**
 * deleteComplianceConnector — delete a connector row.
 *
 * @param id    The connector id.
 * @param hard  When true, hard-delete (db.delete); when false, soft-mark as
 *              NOT_AVAILABLE (preferred — preserves audit history). Defaults
 *              to false.
 * @returns     true if the row was deleted/updated; false if not found / on error.
 */
export async function deleteComplianceConnector(id: string, hard = false): Promise<boolean> {
  if (!str(id)) return false;
  try {
    if (hard) {
      const r = await db.complianceConnector.delete({ where: { id } });
      return !!r;
    }
    const r = await db.complianceConnector.update({
      where: { id },
      data: { status: "NOT_AVAILABLE", notes: `Soft-deleted at ${new Date().toISOString()}` },
    });
    return !!r;
  } catch (err) {
    // Prisma throws P2025 (record not found) — treat as false.
    const reason = err instanceof Error ? err.message : String(err);
    logger.error("[compliance-connector] deleteComplianceConnector failed", { id, hard, error: reason });
    return false;
  }
}

// ============ Missing connectors view ============

/**
 * getMissingConnectors — return all connectors with status = MISSING or DEGRADED.
 *
 * This is the §8 "show all missing" view — the admin UI uses it to surface which
 * subsystems are NOT properly wired per jurisdiction. Each row includes the
 * jurisdiction display name (looked up via JurisdictionFabric) for the admin
 * table; if the jurisdiction can't be resolved (e.g. a global source with
 * jurisdictionCode=null), the name falls back to "Global".
 *
 * @returns Array of MissingConnectorRow (empty on error).
 */
export async function getMissingConnectors(): Promise<MissingConnectorRow[]> {
  try {
    const rows = await db.complianceConnector.findMany({
      where: { status: { in: ["MISSING", "DEGRADED"] } },
      orderBy: [{ subsystem: "asc" }, { jurisdictionCode: "asc" }],
    });

    // Pre-fetch jurisdiction names for all referenced codes — single query.
    const codes = Array.from(
      new Set(
        (rows || [])
          .map((r: any) => r?.jurisdictionCode)
          .filter((c: any) => typeof c === "string" && c.length > 0),
      ),
    );
    const jurisdictions: Record<string, JurisdictionFabric> = {};
    if (codes.length > 0) {
      const js = await db.jurisdictionFabric.findMany({
        where: { code: { in: codes } },
      });
      for (const j of js || []) {
        if (j && j.code) jurisdictions[j.code] = j;
      }
    }

    return (rows || []).map((r: any) => {
      const jc = str(r?.jurisdictionCode);
      const j = jc ? jurisdictions[jc] : null;
      const jurisdictionName = j ? str(j.name) : (jc ? jc : "Global");
      return {
        subsystem: str(r?.subsystem),
        jurisdictionCode: jc || "Global",
        jurisdictionName,
        connectorName: str(r?.connectorName),
        status: str(r?.status),
        lastError: r?.lastError ? str(r.lastError) : undefined,
      };
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.error("[compliance-connector] getMissingConnectors failed", { error: reason });
    return [];
  }
}

// ============ Health summary ============

/**
 * getConnectorHealth — aggregate health summary across ALL connectors.
 *
 * @returns Counts per status + average coveragePct (0..100). Zero across the
 * board on error.
 */
export async function getConnectorHealth(): Promise<ConnectorHealth> {
  const empty: ConnectorHealth = {
    total: 0,
    connected: 0,
    degraded: 0,
    missing: 0,
    notAvailable: 0,
    planned: 0,
    coveragePctAvg: 0,
  };
  try {
    const rows = await db.complianceConnector.findMany();
    const list = rows || [];
    let connected = 0, degraded = 0, missing = 0, notAvailable = 0, planned = 0, coverageSum = 0, coverageCount = 0;
    for (const r of list) {
      const s = str(r?.status);
      if (s === "CONNECTED") connected++;
      else if (s === "DEGRADED") degraded++;
      else if (s === "MISSING") missing++;
      else if (s === "NOT_AVAILABLE") notAvailable++;
      else if (s === "PLANNED") planned++;
      if (typeof r?.coveragePct === "number" && Number.isFinite(r.coveragePct)) {
        coverageSum += r.coveragePct;
        coverageCount += 1;
      }
    }
    return {
      total: list.length,
      connected,
      degraded,
      missing,
      notAvailable,
      planned,
      coveragePctAvg: coverageCount > 0 ? coverageSum / coverageCount : 0,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.error("[compliance-connector] getConnectorHealth failed", { error: reason });
    return empty;
  }
}

// ============ Per-jurisdiction subsystem map ============

/**
 * getSubsystemsByJurisdiction — return a map of all 7 subsystems → connector
 * (or null if missing) for a single jurisdiction. Used by the admin
 * "missing per jurisdiction" view.
 *
 * Always returns a record keyed by every subsystem name (so the UI can render
 * a stable table); missing entries are explicitly null.
 *
 * @param jurisdictionCode  The jurisdiction code (null/empty = global / "all").
 */
export async function getSubsystemsByJurisdiction(
  jurisdictionCode: string,
): Promise<Record<string, ComplianceConnector | null>> {
  const result: Record<string, ComplianceConnector | null> = {};
  for (const s of SUBSYSTEMS) result[s] = null;

  try {
    const jc = str(jurisdictionCode);
    const rows = await db.complianceConnector.findMany({
      where: jc
        ? { jurisdictionCode: jc }
        : { OR: [{ jurisdictionCode: null }, { jurisdictionCode: "" }] },
    });
    for (const r of rows || []) {
      const sub = str(r?.subsystem);
      if (sub && result[sub] === null) {
        result[sub] = shape(r);
      }
    }
    return result;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.error("[compliance-connector] getSubsystemsByJurisdiction failed", { jurisdictionCode, error: reason });
    return result;
  }
}

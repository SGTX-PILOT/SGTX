// @ts-nocheck
/**
 * SGTX Phase 8 — §1–§3 Integration Catalog
 * ===========================================================================
 *
 * Implements the worldwide Integration Catalog on top of the new
 * `IntegrationCatalog` Prisma model. The catalog is the "what exists"
 * registry — every government / transport / bank / broker / ERP system
 * SGTX knows about worldwide, regardless of whether SGTX is connected.
 *
 * The catalog is RICHER than the Phase 4 `GovConnector` (which is the
 * per-connection live registry). A `GovConnector` is created when SGTX
 * actually connects to a system; an `IntegrationCatalog` entry exists
 * as soon as SGTX knows the system exists (NOT_DISCOVERED → DEPRECATED).
 *
 * §2 — 13 integration types (the technology used to integrate):
 *
 *   API | EDI | XML | JSON | UN_EDIFACT | CARGO_XML | ONE_RECORD |
 *   ISO_20022 | SFTP | WEBHOOK | PORTAL | BROKER | MANUAL
 *
 * §3 — 16 connector statuses (the connection lifecycle):
 *
 *   NOT_DISCOVERED → DISCOVERED → DOCUMENTED → CONTACT_REQUIRED →
 *   CREDENTIALS_REQUIRED → SANDBOX_AVAILABLE → SANDBOX_CONNECTED →
 *   CERTIFICATION_REQUIRED → CERTIFICATION_PENDING → PRODUCTION_READY →
 *   PRODUCTION_CONNECTED
 *
 *   (off-ramps: PORTAL_ONLY, MANUAL_ONLY, DEPRECATED; failure modes:
 *    DEGRADED, OUTAGE)
 *
 * Lifecycle semantics:
 *   - NOT_DISCOVERED: SGTX has no information — placeholder for "we know
 *     there must be an integration here but we haven't found it yet".
 *   - DISCOVERED/DOCUMENTED: research stage — public info only.
 *   - CONTACT_REQUIRED/CREDENTIALS_REQUIRED: SGTX is talking to the
 *     authority to get API access.
 *   - SANDBOX_AVAILABLE/SANDBOX_CONNECTED: integration is testable in
 *     the sandbox.
 *   - CERTIFICATION_REQUIRED/CERTIFICATION_PENDING: production access
 *     requires the authority's certification.
 *   - PRODUCTION_READY: credentials + certification in hand, ready to
 *     cut over.
 *   - PRODUCTION_CONNECTED: live + healthy.
 *   - DEGRADED/OUTAGE: connected but not healthy (the LSP system handles
 *     failover).
 *   - PORTAL_ONLY: no API — operators use the government portal by hand
 *     (still "usable" but not automated).
 *   - MANUAL_ONLY: no API and no portal — manual process (fax/email/in-person).
 *   - DEPRECATED: the authority has retired the system.
 *
 * `connectorId` follows the canonical SGTX ID format `CAT-YYYYMMDD-NNNNN`
 * (5-digit zero-padded random suffix per day).
 *
 * All DB calls are try/catch-wrapped with safe defaults — the engine never
 * throws synchronously into API routes. Pure helpers
 * (`generateConnectorId`, `isConnectorConnected`, `isConnectorUsable`) have
 * no side effects.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ §1 Constants ============

/**
 * The 13 authorities SGTX integrates with (§1). A jurisdiction may have
 * multiple catalogs per authority (e.g. CUSTOMS may have Nafeza + CargoX +
 * ETA in Egypt).
 */
export const AUTHORITIES = [
  "CUSTOMS",
  "TAX",
  "SPS",
  "TBT",
  "AGRICULTURE",
  "HEALTH",
  "STANDARDS",
  "SECURITY",
  "TRANSPORT",
  "BANK",
  "INSURANCE",
  "BROKER",
  "ERP",
] as const;

/**
 * §2 — the 13 integration types (the technology used to integrate).
 */
export const INTEGRATION_TYPES = [
  "API",
  "EDI",
  "XML",
  "JSON",
  "UN_EDIFACT",
  "CARGO_XML",
  "ONE_RECORD",
  "ISO_20022",
  "SFTP",
  "WEBHOOK",
  "PORTAL",
  "BROKER",
  "MANUAL",
] as const;

/**
 * §3 — the 16 connector statuses (the connection lifecycle).
 */
export const CONNECTOR_STATUSES = [
  "NOT_DISCOVERED",
  "DISCOVERED",
  "DOCUMENTED",
  "CONTACT_REQUIRED",
  "CREDENTIALS_REQUIRED",
  "SANDBOX_AVAILABLE",
  "SANDBOX_CONNECTED",
  "CERTIFICATION_REQUIRED",
  "CERTIFICATION_PENDING",
  "PRODUCTION_READY",
  "PRODUCTION_CONNECTED",
  "DEGRADED",
  "OUTAGE",
  "PORTAL_ONLY",
  "MANUAL_ONLY",
  "DEPRECATED",
] as const;

/**
 * Catalog statuses that count as "connected" (live + automated).
 */
export const CONNECTED_STATUSES = ["PRODUCTION_CONNECTED", "SANDBOX_CONNECTED"] as const;

/**
 * Catalog statuses that count as "usable but manual" (no API, but the
 * integration is still operable by hand).
 */
export const USABLE_MANUAL_STATUSES = ["PORTAL_ONLY", "MANUAL_ONLY"] as const;

// ============ Types ============

export interface CreateCatalogInput {
  jurisdictionCode: string;
  authority: string;
  systemName: string;
  procedure?: string;
  transportMode?: string;
  integrationType: string;
  purpose?: string;
  officialUrl?: string;
  apiUrl?: string;
  ediUrl?: string;
  portalUrl?: string;
  documentationUrl?: string;
  sandboxUrl?: string;
  authentication?: string;
  certificateRequirement?: string;
  legalAgreement?: string;
  certification?: string;
  productionRequirements?: string[];
  status?: string;
  priority?: number;
  owner?: string;
  version?: string;
  notes?: string;
}

export interface IntegrationCatalog {
  id: string;
  connectorId: string;
  jurisdictionCode: string;
  authority: string;
  systemName: string;
  procedure?: string | null;
  transportMode?: string | null;
  integrationType: string;
  purpose?: string | null;
  officialUrl?: string | null;
  apiUrl?: string | null;
  ediUrl?: string | null;
  portalUrl?: string | null;
  documentationUrl?: string | null;
  sandboxUrl?: string | null;
  authentication?: string | null;
  certificateRequirement?: string | null;
  legalAgreement?: string | null;
  certification?: string | null;
  productionRequirements?: string | null;
  status: string;
  priority: number;
  owner?: string | null;
  lastVerifiedAt?: Date | null;
  version?: string | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListCatalogFilters {
  jurisdictionCode?: string;
  authority?: string;
  systemName?: string;
  status?: string;
  integrationType?: string;
  transportMode?: string;
  procedure?: string;
}

export interface FindCatalogInput {
  jurisdictionCode: string;
  authority?: string;
  procedure?: string;
  transportMode?: string;
  systemName?: string;
}

export interface ConnectedCountSummary {
  total: number;
  connected: number;
  partial: number;
  manual: number;
  missing: number;
  deprecated: number;
}

// ============ §1.0 Pure helpers ============

/**
 * Pure: generate a `CAT-YYYYMMDD-NNNNN` connector id. 5-digit zero-padded
 * random suffix per UTC day. No DB, no side effects.
 */
export function generateConnectorId(): string {
  const d = new Date();
  const ymd =
    `${d.getUTCFullYear()}` +
    `${String(d.getUTCMonth() + 1).padStart(2, "0")}` +
    `${String(d.getUTCDate()).padStart(2, "0")}`;
  const n = Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, "0");
  return `CAT-${ymd}-${n}`;
}

/**
 * Pure: true if the connector is live + automated (PRODUCTION_CONNECTED
 * or SANDBOX_CONNECTED). No DB, no side effects.
 */
export function isConnectorConnected(connector: IntegrationCatalog): boolean {
  if (!connector || !connector.status) return false;
  return (CONNECTED_STATUSES as readonly string[]).includes(connector.status);
}

/**
 * Pure: true if the connector is usable (connected OR PORTAL_ONLY OR
 * MANUAL_ONLY). Usable means the trade can proceed — either through an
 * automated API or via a human operator on the portal. No DB, no side
 * effects.
 */
export function isConnectorUsable(connector: IntegrationCatalog): boolean {
  if (!connector || !connector.status) return false;
  if (isConnectorConnected(connector)) return true;
  return (USABLE_MANUAL_STATUSES as readonly string[]).includes(connector.status);
}

/**
 * Pure: validate an integration type.
 */
function isValidIntegrationType(t?: string | null): boolean {
  return !!t && (INTEGRATION_TYPES as readonly string[]).includes(t);
}

/**
 * Pure: validate a connector status.
 */
function isValidStatus(s?: string | null): boolean {
  return !!s && (CONNECTOR_STATUSES as readonly string[]).includes(s);
}

/**
 * Pure: serialize an array of production requirements into a JSON string.
 * Empty arrays serialize to `null` so the DB column stays null.
 */
function serializeStringArray(arr?: string[] | null): string | null {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return JSON.stringify(arr);
}

/**
 * Pure: parse a JSON string into an array. Defensive.
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

/**
 * Pure: bucket a connector status into the high-level readiness category
 * used by `getConnectedCount`. Used internally.
 */
function bucketStatus(status: string): keyof ConnectedCountSummary {
  if (!status) return "partial";
  if (status === "PRODUCTION_CONNECTED" || status === "SANDBOX_CONNECTED") {
    return "connected";
  }
  if (status === "PORTAL_ONLY" || status === "MANUAL_ONLY") return "manual";
  if (status === "NOT_DISCOVERED") return "missing";
  if (status === "DEPRECATED") return "deprecated";
  return "partial";
}

// ============ §1.1 createCatalogEntry ============

/**
 * Create a new IntegrationCatalog entry. Generates a `CAT-YYYYMMDD-NNNNN`
 * connector id. The composite key (jurisdictionCode, authority, systemName,
 * procedure, transportMode, integrationType) is enforced by a Prisma
 * @@unique constraint — duplicate inserts raise a DB error that callers
 * should catch (or use `upsertCatalogEntry` to handle).
 *
 * Defaults:
 *   - status: NOT_DISCOVERED (unless provided)
 *   - priority: 50 (0..100 — higher = more important)
 *   - lastVerifiedAt: now (creation counts as a verification)
 *
 * Throws on DB error — wrap at the call site if needed. The catalog is
 * the foundational "what exists" registry so callers should see the error.
 */
export async function createCatalogEntry(
  input: CreateCatalogInput,
): Promise<IntegrationCatalog> {
  if (!input) throw new Error("input is required");
  if (!input.jurisdictionCode) throw new Error("jurisdictionCode is required");
  if (!input.authority) throw new Error("authority is required");
  if (!input.systemName) throw new Error("systemName is required");
  if (!isValidIntegrationType(input.integrationType)) {
    throw new Error(`invalid integrationType: ${input.integrationType}`);
  }

  const status = isValidStatus(input.status) ? input.status! : "NOT_DISCOVERED";
  const priority =
    typeof input.priority === "number" && !Number.isNaN(input.priority)
      ? Math.max(0, Math.min(100, Math.round(input.priority)))
      : 50;

  const data: any = {
    connectorId: generateConnectorId(),
    jurisdictionCode: input.jurisdictionCode,
    authority: input.authority,
    systemName: input.systemName,
    procedure: input.procedure || null,
    transportMode: input.transportMode || null,
    integrationType: input.integrationType,
    purpose: input.purpose || null,
    officialUrl: input.officialUrl || null,
    apiUrl: input.apiUrl || null,
    ediUrl: input.ediUrl || null,
    portalUrl: input.portalUrl || null,
    documentationUrl: input.documentationUrl || null,
    sandboxUrl: input.sandboxUrl || null,
    authentication: input.authentication || null,
    certificateRequirement: input.certificateRequirement || null,
    legalAgreement: input.legalAgreement || null,
    certification: input.certification || null,
    productionRequirements: serializeStringArray(input.productionRequirements),
    status,
    priority,
    owner: input.owner || null,
    lastVerifiedAt: new Date(),
    version: input.version || null,
    notes: input.notes || null,
  };

  try {
    const row = await db.integrationCatalog.create({ data });
    logger.info("[integration-catalog] catalog entry created", {
      id: row.id,
      connectorId: row.connectorId,
      jurisdictionCode: row.jurisdictionCode,
      authority: row.authority,
      systemName: row.systemName,
      status,
    });
    return row as IntegrationCatalog;
  } catch (err) {
    logger.error("[integration-catalog] createCatalogEntry DB error", {
      error: String(err),
      jurisdictionCode: input.jurisdictionCode,
      authority: input.authority,
      systemName: input.systemName,
      integrationType: input.integrationType,
    });
    throw err;
  }
}

// ============ §1.2 getCatalogEntry ============

/**
 * Get a catalog entry by its DB `id`. Returns null if not found or on DB
 * error. Never throws.
 */
export async function getCatalogEntry(id: string): Promise<IntegrationCatalog | null> {
  if (!id) return null;
  try {
    const row = await db.integrationCatalog.findUnique({ where: { id } });
    return (row as IntegrationCatalog) || null;
  } catch (err) {
    logger.error("[integration-catalog] getCatalogEntry DB error", {
      error: String(err),
      id,
    });
    return null;
  }
}

// ============ §1.3 getCatalogByConnectorId ============

/**
 * Get a catalog entry by its human-readable `CAT-YYYYMMDD-NNNNN`
 * connector id. Returns null if not found or on DB error. Never throws.
 */
export async function getCatalogByConnectorId(
  connectorId: string,
): Promise<IntegrationCatalog | null> {
  if (!connectorId) return null;
  try {
    const row = await db.integrationCatalog.findUnique({
      where: { connectorId },
    });
    return (row as IntegrationCatalog) || null;
  } catch (err) {
    logger.error("[integration-catalog] getCatalogByConnectorId DB error", {
      error: String(err),
      connectorId,
    });
    return null;
  }
}

// ============ §1.4 listCatalogEntries ============

/**
 * List catalog entries by filter. All filter fields are optional — omit
 * them to fetch all entries. Returns [] on DB error. Never throws.
 */
export async function listCatalogEntries(
  filters?: ListCatalogFilters,
): Promise<IntegrationCatalog[]> {
  const where: any = {};
  if (filters?.jurisdictionCode) where.jurisdictionCode = filters.jurisdictionCode;
  if (filters?.authority) where.authority = filters.authority;
  if (filters?.systemName) where.systemName = filters.systemName;
  if (filters?.status) where.status = filters.status;
  if (filters?.integrationType) where.integrationType = filters.integrationType;
  if (filters?.transportMode) where.transportMode = filters.transportMode;
  if (filters?.procedure) where.procedure = filters.procedure;

  try {
    const rows = await db.integrationCatalog.findMany({
      where,
      orderBy: [{ jurisdictionCode: "asc" }, { authority: "asc" }, { systemName: "asc" }],
    });
    return (rows as IntegrationCatalog[]) || [];
  } catch (err) {
    logger.error("[integration-catalog] listCatalogEntries DB error", {
      error: String(err),
      filters,
    });
    return [];
  }
}

// ============ §1.5 findCatalogEntries ============

/**
 * Find all catalog entries matching a (jurisdictionCode, authority?,
 * procedure?, transportMode?, systemName?) tuple. Used by the discovery
 * engine to find candidate integrations for a country/authority/procedure
 * combination. Returns [] on DB error. Never throws.
 */
export async function findCatalogEntries(
  input: FindCatalogInput,
): Promise<IntegrationCatalog[]> {
  if (!input?.jurisdictionCode) return [];
  const where: any = { jurisdictionCode: input.jurisdictionCode };
  if (input.authority) where.authority = input.authority;
  if (input.procedure) where.procedure = input.procedure;
  if (input.transportMode) where.transportMode = input.transportMode;
  if (input.systemName) where.systemName = input.systemName;

  try {
    const rows = await db.integrationCatalog.findMany({
      where,
      orderBy: [{ priority: "desc" }, { systemName: "asc" }],
    });
    return (rows as IntegrationCatalog[]) || [];
  } catch (err) {
    logger.error("[integration-catalog] findCatalogEntries DB error", {
      error: String(err),
      input,
    });
    return [];
  }
}

// ============ §1.6 updateCatalogStatus ============

/**
 * Transition a connector's status. Sets `lastVerifiedAt` to now (every
 * status change counts as a verification — the operator looked at it).
 *
 * The `notes` param (optional) is appended to the existing notes field
 * with a timestamp — used for status-change audit trails.
 *
 * Throws if the connector is not found or if newStatus is invalid.
 */
export async function updateCatalogStatus(
  connectorId: string,
  newStatus: string,
  notes?: string,
): Promise<IntegrationCatalog> {
  if (!connectorId) throw new Error("connectorId is required");
  if (!isValidStatus(newStatus)) {
    throw new Error(`invalid status: ${newStatus}`);
  }

  const existing = await getCatalogByConnectorId(connectorId);
  if (!existing) {
    throw new Error(`catalog entry not found: ${connectorId}`);
  }

  const notePrefix = `[${new Date().toISOString()}] status → ${newStatus}`;
  const appendedNotes = notes
    ? `${notePrefix}: ${notes}${existing.notes ? "\n" + existing.notes : ""}`
    : `${notePrefix}${existing.notes ? "\n" + existing.notes : ""}`;

  try {
    const row = await db.integrationCatalog.update({
      where: { connectorId },
      data: {
        status: newStatus,
        lastVerifiedAt: new Date(),
        notes: appendedNotes,
      },
    });
    logger.info("[integration-catalog] status updated", {
      connectorId,
      previousStatus: existing.status,
      newStatus,
    });
    return row as IntegrationCatalog;
  } catch (err) {
    logger.error("[integration-catalog] updateCatalogStatus DB error", {
      error: String(err),
      connectorId,
      newStatus,
    });
    throw err;
  }
}

// ============ §1.7 upsertCatalogEntry ============

/**
 * Upsert a catalog entry by composite key (jurisdictionCode, authority,
 * systemName, procedure, transportMode, integrationType). If a matching
 * entry exists, update it; otherwise create a new one.
 *
 * This is the preferred entry point for catalog ingest pipelines — the
 * external system is the source of truth, and SGTX's catalog reflects
 * the latest snapshot.
 *
 * Throws on DB error.
 */
export async function upsertCatalogEntry(
  input: CreateCatalogInput,
): Promise<IntegrationCatalog> {
  if (!input) throw new Error("input is required");
  if (!input.jurisdictionCode) throw new Error("jurisdictionCode is required");
  if (!input.authority) throw new Error("authority is required");
  if (!input.systemName) throw new Error("systemName is required");
  if (!isValidIntegrationType(input.integrationType)) {
    throw new Error(`invalid integrationType: ${input.integrationType}`);
  }

  const where: any = {
    jurisdictionCode: input.jurisdictionCode,
    authority: input.authority,
    systemName: input.systemName,
    procedure: input.procedure || null,
    transportMode: input.transportMode || null,
    integrationType: input.integrationType,
  };

  let existing: IntegrationCatalog | null = null;
  try {
    existing = (await db.integrationCatalog.findFirst({ where })) as IntegrationCatalog | null;
  } catch (err) {
    logger.error("[integration-catalog] upsertCatalogEntry find error", {
      error: String(err),
      where,
    });
    // fall through to create attempt
  }

  if (existing) {
    const status = isValidStatus(input.status) ? input.status! : existing.status;
    const priority =
      typeof input.priority === "number" && !Number.isNaN(input.priority)
        ? Math.max(0, Math.min(100, Math.round(input.priority)))
        : existing.priority;

    try {
      const row = await db.integrationCatalog.update({
        where: { id: existing.id },
        data: {
          procedure: input.procedure || null,
          transportMode: input.transportMode || null,
          purpose: input.purpose ?? existing.purpose ?? null,
          officialUrl: input.officialUrl ?? existing.officialUrl ?? null,
          apiUrl: input.apiUrl ?? existing.apiUrl ?? null,
          ediUrl: input.ediUrl ?? existing.ediUrl ?? null,
          portalUrl: input.portalUrl ?? existing.portalUrl ?? null,
          documentationUrl: input.documentationUrl ?? existing.documentationUrl ?? null,
          sandboxUrl: input.sandboxUrl ?? existing.sandboxUrl ?? null,
          authentication: input.authentication ?? existing.authentication ?? null,
          certificateRequirement:
            input.certificateRequirement ?? existing.certificateRequirement ?? null,
          legalAgreement: input.legalAgreement ?? existing.legalAgreement ?? null,
          certification: input.certification ?? existing.certification ?? null,
          productionRequirements:
            input.productionRequirements !== undefined
              ? serializeStringArray(input.productionRequirements)
              : existing.productionRequirements,
          status,
          priority,
          owner: input.owner ?? existing.owner ?? null,
          lastVerifiedAt: new Date(),
          version: input.version ?? existing.version ?? null,
          notes: input.notes ?? existing.notes ?? null,
        },
      });
      logger.info("[integration-catalog] catalog entry upserted (existing)", {
        id: row.id,
        connectorId: row.connectorId,
        status,
      });
      return row as IntegrationCatalog;
    } catch (err) {
      logger.error("[integration-catalog] upsertCatalogEntry update error", {
        error: String(err),
        id: existing.id,
      });
      throw err;
    }
  }

  // No existing — create new.
  return createCatalogEntry(input);
}

// ============ §1.8 deleteCatalogEntry ============

/**
 * Delete a catalog entry. Soft-delete (default) sets status=DEPRECATED;
 * hard-delete (hard=true) permanently removes the row.
 *
 * Soft-delete is the default — DEPRECATED connectors are retained for
 * audit history. Use hard=true only for data-cleanup operations.
 *
 * Returns true on success, false on DB error or not-found. Never throws.
 */
export async function deleteCatalogEntry(
  connectorId: string,
  hard = false,
): Promise<boolean> {
  if (!connectorId) return false;

  const existing = await getCatalogByConnectorId(connectorId);
  if (!existing) {
    logger.warn("[integration-catalog] deleteCatalogEntry: not found", { connectorId });
    return false;
  }

  try {
    if (hard) {
      await db.integrationCatalog.delete({ where: { connectorId } });
      logger.info("[integration-catalog] catalog entry HARD deleted", {
        connectorId,
        jurisdictionCode: existing.jurisdictionCode,
        authority: existing.authority,
        systemName: existing.systemName,
      });
    } else {
      await db.integrationCatalog.update({
        where: { connectorId },
        data: { status: "DEPRECATED", lastVerifiedAt: new Date() },
      });
      logger.info("[integration-catalog] catalog entry soft-deleted → DEPRECATED", {
        connectorId,
      });
    }
    return true;
  } catch (err) {
    logger.error("[integration-catalog] deleteCatalogEntry DB error", {
      error: String(err),
      connectorId,
      hard,
    });
    return false;
  }
}

// ============ §1.9 getCatalogByJurisdiction ============

/**
 * Get ALL connectors for a jurisdiction (all authorities, all statuses,
 * all transport modes). Returns [] on DB error. Never throws.
 */
export async function getCatalogByJurisdiction(
  jurisdictionCode: string,
): Promise<IntegrationCatalog[]> {
  if (!jurisdictionCode) return [];
  try {
    const rows = await db.integrationCatalog.findMany({
      where: { jurisdictionCode },
      orderBy: [{ authority: "asc" }, { priority: "desc" }, { systemName: "asc" }],
    });
    return (rows as IntegrationCatalog[]) || [];
  } catch (err) {
    logger.error("[integration-catalog] getCatalogByJurisdiction DB error", {
      error: String(err),
      jurisdictionCode,
    });
    return [];
  }
}

// ============ §1.10 getCatalogByAuthority ============

/**
 * Get ALL connectors for an authority worldwide (across all jurisdictions).
 * Used by authority-specific dashboards (e.g. "show me all CUSTOMS
 * connectors worldwide"). Returns [] on DB error. Never throws.
 */
export async function getCatalogByAuthority(
  authority: string,
): Promise<IntegrationCatalog[]> {
  if (!authority) return [];
  try {
    const rows = await db.integrationCatalog.findMany({
      where: { authority },
      orderBy: [{ jurisdictionCode: "asc" }, { priority: "desc" }, { systemName: "asc" }],
    });
    return (rows as IntegrationCatalog[]) || [];
  } catch (err) {
    logger.error("[integration-catalog] getCatalogByAuthority DB error", {
      error: String(err),
      authority,
    });
    return [];
  }
}

// ============ §1.11 getConnectedCount ============

/**
 * Get a summary of connector readiness for a jurisdiction. Returns:
 *   - total:        total connectors for the jurisdiction
 *   - connected:    PRODUCTION_CONNECTED + SANDBOX_CONNECTED
 *   - partial:      in-progress / known but not yet connected
 *                   (DISCOVERED, DOCUMENTED, CONTACT_REQUIRED,
 *                    CREDENTIALS_REQUIRED, SANDBOX_AVAILABLE,
 *                    CERTIFICATION_REQUIRED, CERTIFICATION_PENDING,
 *                    PRODUCTION_READY, DEGRADED, OUTAGE)
 *   - manual:       PORTAL_ONLY + MANUAL_ONLY
 *   - missing:      NOT_DISCOVERED
 *   - deprecated:   DEPRECATED
 *
 * Returns zeros on DB error. Never throws.
 */
export async function getConnectedCount(
  jurisdictionCode: string,
): Promise<ConnectedCountSummary> {
  const summary: ConnectedCountSummary = {
    total: 0,
    connected: 0,
    partial: 0,
    manual: 0,
    missing: 0,
    deprecated: 0,
  };
  if (!jurisdictionCode) return summary;

  const rows = await getCatalogByJurisdiction(jurisdictionCode);
  summary.total = rows.length;
  for (const row of rows) {
    const bucket = bucketStatus(row.status);
    summary[bucket]++;
  }
  return summary;
}

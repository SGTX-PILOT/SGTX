// @ts-nocheck
/**
 * SGTX Phase 8 — §4 Integration Gap Analysis
 * ===========================================================================
 *
 * Implements the Integration Gap records on top of the new
 * `IntegrationGapRecord` Prisma model. A gap record answers the question:
 * "for each (jurisdiction × authority × procedure × mode) required by a
 * trade, is the integration connected, partial, manual, missing, or
 * deprecated?"
 *
 * The gap record is the per-trade-line actionable view of the Integration
 * Catalog. Where the catalog says "Egypt customs Nafeza exists and is
 * PRODUCTION_CONNECTED", the gap record says "for THIS trade (Egypt → UAE,
 * agricultural export), the Egypt customs EXPORT integration is CONNECTED".
 *
 * §4 gap statuses (5 states):
 *
 *   CONNECTED — fully automated (status from catalog = PRODUCTION_CONNECTED)
 *   PARTIAL   — known but not yet live (sandbox connected, in certification,
 *               outage, etc.)
 *   MANUAL    — operator uses a portal or manual process
 *   MISSING   — no integration found at all (NOT_DISCOVERED in catalog or
 *               no catalog entry exists)
 *   DEPRECATED — the authority has retired the integration
 *
 * Gap → Catalog relationship:
 *   - The catalog stores "what exists" worldwide.
 *   - The gap record stores "what is missing for THIS trade / lane".
 *   - `assessGapFromCatalog(catalogEntry)` derives the gap status + the
 *     availability booleans from a catalog entry's status field.
 *
 * `gapId` follows the canonical SGTX ID format `GAP-YYYYMMDD-NNNNN`.
 *
 * The CRITICAL query is `getMissingGaps(jurisdictionCode?)` — it returns
 * every gap record with status=MISSING, ordered by priority desc. That is
 * the "to-do list" for the SGTX onboarding team.
 *
 * All DB calls are try/catch-wrapped with safe defaults. Pure helpers
 * (`generateGapId`, `computeGapPriority`, `assessGapFromCatalog`) have no
 * side effects.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import type { IntegrationCatalog } from "@/lib/sgtx/integration-catalog";

// ============ §4 Constants ============

/**
 * §4 gap statuses (5 states — narrower than the 16-state catalog lifecycle).
 * The gap record abstracts over the catalog's 16 statuses and produces a
 * 5-bucket readiness classification that is actionable per trade.
 */
export const GAP_STATUSES = [
  "CONNECTED",
  "PARTIAL",
  "MANUAL",
  "MISSING",
  "DEPRECATED",
] as const;

/**
 * Priority base values per gap status. Used by `computeGapPriority`.
 * Higher priority = more urgent (MISSING is the most urgent).
 */
export const GAP_PRIORITY_BASE: Record<string, number> = {
  MISSING: 80,
  PARTIAL: 60,
  MANUAL: 40,
  CONNECTED: 20,
  DEPRECATED: 10,
};

/**
 * Source of a gap record — used to differentiate gaps that the discovery
 * engine auto-created vs. gaps that an operator manually logged vs. gaps
 * that the government proactively notified SGTX about.
 */
export const GAP_SOURCES = [
  "AUTOMATIC_DISCOVERY",
  "MANUAL",
  "GOVERNMENT_NOTIFICATION",
] as const;

// ============ Types ============

export interface CreateGapInput {
  jurisdictionCode: string;
  authority: string;
  procedure?: string;
  transportMode?: string;
  systemName?: string;
  required?: boolean;
  apiAvailable?: boolean;
  ediAvailable?: boolean;
  portalAvailable?: boolean;
  documentationAvailable?: boolean;
  credentialsRequired?: boolean;
  sandboxRequired?: boolean;
  certificationRequired?: boolean;
  legalAgreementRequired?: boolean;
  status?: string;
  priority?: number;
  owner?: string;
  nextAction?: string;
  dueDate?: Date;
  source?: string;
  evidence?: string[];
  notes?: string;
}

export interface IntegrationGapRecord {
  id: string;
  gapId: string;
  jurisdictionCode: string;
  authority: string;
  procedure?: string | null;
  transportMode?: string | null;
  systemName?: string | null;
  required: boolean;
  apiAvailable: boolean;
  ediAvailable: boolean;
  portalAvailable: boolean;
  documentationAvailable: boolean;
  credentialsRequired: boolean;
  sandboxRequired: boolean;
  certificationRequired: boolean;
  legalAgreementRequired: boolean;
  status: string;
  priority: number;
  affectedTradeLanes?: string | null;
  affectedUstns?: string | null;
  owner?: string | null;
  nextAction?: string | null;
  dueDate?: Date | null;
  source?: string | null;
  evidence?: string | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListGapFilters {
  jurisdictionCode?: string;
  authority?: string;
  status?: string;
  priority?: number;
  procedure?: string;
  transportMode?: string;
}

export interface GapSummary {
  total: number;
  connected: number;
  partial: number;
  manual: number;
  missing: number;
  deprecated: number;
  avgPriority: number;
}

export interface GapAssessment {
  required: boolean;
  apiAvailable: boolean;
  ediAvailable: boolean;
  portalAvailable: boolean;
  documentationAvailable: boolean;
  status: string;
  priority: number;
}

// ============ §4.0 Pure helpers ============

/**
 * Pure: generate a `GAP-YYYYMMDD-NNNNN` gap id. 5-digit zero-padded random
 * suffix per UTC day. No DB, no side effects.
 */
export function generateGapId(): string {
  const d = new Date();
  const ymd =
    `${d.getUTCFullYear()}` +
    `${String(d.getUTCMonth() + 1).padStart(2, "0")}` +
    `${String(d.getUTCDate()).padStart(2, "0")}`;
  const n = Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, "0");
  return `GAP-${ymd}-${n}`;
}

/**
 * Pure: validate a gap status.
 */
function isValidGapStatus(s?: string | null): boolean {
  return !!s && (GAP_STATUSES as readonly string[]).includes(s);
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

/**
 * Pure: serialize an array of strings into a JSON string. Empty arrays
 * serialize to `null` so the DB column stays null.
 */
function serializeStringArray(arr?: string[] | null): string | null {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return JSON.stringify(arr);
}

/**
 * Pure: compute the priority (0..100) of a gap record.
 *
 * Formula:
 *   base        = GAP_PRIORITY_BASE[status] (MISSING=80, PARTIAL=60,
 *                 MANUAL=40, CONNECTED=20, DEPRECATED=10)
 *   + ustnBonus = min(affectedUstns.length * 5, 20)
 *   + laneBonus = min(affectedTradeLanes.length * 3, 15)
 *   priority   = clamp(base + ustnBonus + laneBonus, 0, 100)
 *
 * A MISSING gap with many affected trades is the most urgent (priority 100).
 * A CONNECTED gap with no affected trades is the least urgent (priority 20).
 *
 * No DB, no side effects.
 */
export function computeGapPriority(gap: IntegrationGapRecord): number {
  if (!gap) return 0;
  const base = GAP_PRIORITY_BASE[gap.status] ?? 50;
  const ustns = parseStringArray(gap.affectedUstns);
  const lanes = parseStringArray(gap.affectedTradeLanes);
  const ustnBonus = Math.min(ustns.length * 5, 20);
  const laneBonus = Math.min(lanes.length * 3, 15);
  const raw = base + ustnBonus + laneBonus;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/**
 * Pure: derive a gap assessment from a catalog entry's status + availability
 * fields. Maps the 16-state catalog lifecycle to the 5-state gap lifecycle
 * + extracts which integration types are available.
 *
 * Mapping (catalog status → gap status):
 *   PRODUCTION_CONNECTED                       → CONNECTED, apiAvailable=true
 *   SANDBOX_CONNECTED                         → PARTIAL, apiAvailable=true, sandboxRequired=true
 *   PORTAL_ONLY                                → MANUAL, portalAvailable=true
 *   MANUAL_ONLY                                → MANUAL
 *   DEPRECATED                                 → DEPRECATED
 *   NOT_DISCOVERED                             → MISSING
 *   all others (DISCOVERED, DOCUMENTED, ...,
 *     PRODUCTION_READY, DEGRADED, OUTAGE)      → PARTIAL
 *
 * Priority is computed via the same formula as `computeGapPriority` —
 * base by status, no affected USTNs/trade lanes (this is a fresh
 * assessment, not yet attached to a trade).
 *
 * No DB, no side effects.
 */
export function assessGapFromCatalog(
  catalogEntry: IntegrationCatalog,
): GapAssessment {
  const fallback: GapAssessment = {
    required: true,
    apiAvailable: false,
    ediAvailable: false,
    portalAvailable: false,
    documentationAvailable: false,
    status: "MISSING",
    priority: GAP_PRIORITY_BASE["MISSING"],
  };
  if (!catalogEntry) return fallback;

  const status = catalogEntry.status;
  const docUrl = !!catalogEntry.documentationUrl;
  const apiUrl = !!catalogEntry.apiUrl;
  const ediUrl = !!catalogEntry.ediUrl;
  const portalUrl = !!catalogEntry.portalUrl;

  let gapStatus: string;
  let apiAvailable = false;
  let ediAvailable = false;
  let portalAvailable = false;
  let documentationAvailable = false;

  switch (status) {
    case "PRODUCTION_CONNECTED":
      gapStatus = "CONNECTED";
      apiAvailable = apiUrl;
      ediAvailable = ediUrl;
      portalAvailable = portalUrl;
      documentationAvailable = docUrl;
      break;
    case "SANDBOX_CONNECTED":
      gapStatus = "PARTIAL";
      apiAvailable = apiUrl;
      ediAvailable = ediUrl;
      documentationAvailable = docUrl;
      break;
    case "PORTAL_ONLY":
      gapStatus = "MANUAL";
      portalAvailable = true;
      documentationAvailable = docUrl;
      break;
    case "MANUAL_ONLY":
      gapStatus = "MANUAL";
      documentationAvailable = docUrl;
      break;
    case "DEPRECATED":
      gapStatus = "DEPRECATED";
      documentationAvailable = docUrl;
      break;
    case "NOT_DISCOVERED":
      gapStatus = "MISSING";
      break;
    default:
      // DISCOVERED, DOCUMENTED, CONTACT_REQUIRED, CREDENTIALS_REQUIRED,
      // SANDBOX_AVAILABLE, CERTIFICATION_REQUIRED, CERTIFICATION_PENDING,
      // PRODUCTION_READY, DEGRADED, OUTAGE
      gapStatus = "PARTIAL";
      apiAvailable = apiUrl;
      documentationAvailable = docUrl;
      break;
  }

  const base = GAP_PRIORITY_BASE[gapStatus] ?? 50;
  return {
    required: true,
    apiAvailable,
    ediAvailable,
    portalAvailable,
    documentationAvailable,
    status: gapStatus,
    priority: base,
  };
}

// ============ §4.1 createGapRecord ============

/**
 * Create a new IntegrationGapRecord. Generates a `GAP-YYYYMMDD-NNNNN`
 * gap id. The status defaults to MISSING (the most common case — a new
 * gap is a gap because we don't yet have the integration).
 *
 * If `priority` is omitted, it is computed via `computeGapPriority` —
 * so the priority is always consistent with the status + affected
 * USTNs/trade lanes at creation time.
 *
 * Throws on DB error.
 */
export async function createGapRecord(
  input: CreateGapInput,
): Promise<IntegrationGapRecord> {
  if (!input) throw new Error("input is required");
  if (!input.jurisdictionCode) throw new Error("jurisdictionCode is required");
  if (!input.authority) throw new Error("authority is required");

  const status = isValidGapStatus(input.status) ? input.status! : "MISSING";

  const affectedUstns = serializeStringArray([]);
  const affectedTradeLanes = serializeStringArray([]);
  const evidence = serializeStringArray(input.evidence);

  const draftPriority =
    typeof input.priority === "number" && !Number.isNaN(input.priority)
      ? Math.max(0, Math.min(100, Math.round(input.priority)))
      : GAP_PRIORITY_BASE[status] ?? 50;

  const data: any = {
    gapId: generateGapId(),
    jurisdictionCode: input.jurisdictionCode,
    authority: input.authority,
    procedure: input.procedure || null,
    transportMode: input.transportMode || null,
    systemName: input.systemName || null,
    required: input.required !== false,
    apiAvailable: !!input.apiAvailable,
    ediAvailable: !!input.ediAvailable,
    portalAvailable: !!input.portalAvailable,
    documentationAvailable: !!input.documentationAvailable,
    credentialsRequired: !!input.credentialsRequired,
    sandboxRequired: !!input.sandboxRequired,
    certificationRequired: !!input.certificationRequired,
    legalAgreementRequired: !!input.legalAgreementRequired,
    status,
    priority: draftPriority,
    affectedTradeLanes,
    affectedUstns,
    owner: input.owner || null,
    nextAction: input.nextAction || null,
    dueDate: input.dueDate || null,
    source: input.source || "AUTOMATIC_DISCOVERY",
    evidence,
    notes: input.notes || null,
  };

  try {
    const row = await db.integrationGapRecord.create({ data });
    logger.info("[gap-analysis] gap record created", {
      id: row.id,
      gapId: row.gapId,
      jurisdictionCode: row.jurisdictionCode,
      authority: row.authority,
      procedure: row.procedure,
      status,
    });
    return row as IntegrationGapRecord;
  } catch (err) {
    logger.error("[gap-analysis] createGapRecord DB error", {
      error: String(err),
      jurisdictionCode: input.jurisdictionCode,
      authority: input.authority,
    });
    throw err;
  }
}

// ============ §4.2 getGapRecord ============

/**
 * Get a gap record by its DB `id`. Returns null if not found or on DB
 * error. Never throws.
 */
export async function getGapRecord(id: string): Promise<IntegrationGapRecord | null> {
  if (!id) return null;
  try {
    const row = await db.integrationGapRecord.findUnique({ where: { id } });
    return (row as IntegrationGapRecord) || null;
  } catch (err) {
    logger.error("[gap-analysis] getGapRecord DB error", { error: String(err), id });
    return null;
  }
}

// ============ §4.3 getGapByGapId ============

/**
 * Get a gap record by its human-readable `GAP-YYYYMMDD-NNNNN` gap id.
 * Returns null if not found or on DB error. Never throws.
 */
export async function getGapByGapId(
  gapId: string,
): Promise<IntegrationGapRecord | null> {
  if (!gapId) return null;
  try {
    const row = await db.integrationGapRecord.findUnique({ where: { gapId } });
    return (row as IntegrationGapRecord) || null;
  } catch (err) {
    logger.error("[gap-analysis] getGapByGapId DB error", { error: String(err), gapId });
    return null;
  }
}

// ============ §4.4 listGapRecords ============

/**
 * List gap records by filter. Returns [] on DB error. Never throws.
 */
export async function listGapRecords(
  filters?: ListGapFilters,
): Promise<IntegrationGapRecord[]> {
  const where: any = {};
  if (filters?.jurisdictionCode) where.jurisdictionCode = filters.jurisdictionCode;
  if (filters?.authority) where.authority = filters.authority;
  if (filters?.status) where.status = filters.status;
  if (typeof filters?.priority === "number") where.priority = filters.priority;
  if (filters?.procedure) where.procedure = filters.procedure;
  if (filters?.transportMode) where.transportMode = filters.transportMode;

  try {
    const rows = await db.integrationGapRecord.findMany({
      where,
      orderBy: [{ priority: "desc" }, { jurisdictionCode: "asc" }, { authority: "asc" }],
    });
    return (rows as IntegrationGapRecord[]) || [];
  } catch (err) {
    logger.error("[gap-analysis] listGapRecords DB error", { error: String(err), filters });
    return [];
  }
}

// ============ §4.5 getGapsByJurisdiction ============

/**
 * Get ALL gap records for a jurisdiction. Returns [] on DB error.
 * Never throws.
 */
export async function getGapsByJurisdiction(
  jurisdictionCode: string,
): Promise<IntegrationGapRecord[]> {
  if (!jurisdictionCode) return [];
  try {
    const rows = await db.integrationGapRecord.findMany({
      where: { jurisdictionCode },
      orderBy: [{ priority: "desc" }, { authority: "asc" }],
    });
    return (rows as IntegrationGapRecord[]) || [];
  } catch (err) {
    logger.error("[gap-analysis] getGapsByJurisdiction DB error", {
      error: String(err),
      jurisdictionCode,
    });
    return [];
  }
}

// ============ §4.6 getGapsByStatus ============

/**
 * Get all gap records with a specific status (e.g. all MISSING gaps).
 * Returns [] on DB error. Never throws.
 */
export async function getGapsByStatus(
  status: string,
): Promise<IntegrationGapRecord[]> {
  if (!status) return [];
  try {
    const rows = await db.integrationGapRecord.findMany({
      where: { status },
      orderBy: [{ priority: "desc" }, { jurisdictionCode: "asc" }, { authority: "asc" }],
    });
    return (rows as IntegrationGapRecord[]) || [];
  } catch (err) {
    logger.error("[gap-analysis] getGapsByStatus DB error", { error: String(err), status });
    return [];
  }
}

// ============ §4.7 updateGapStatus ============

/**
 * Update a gap record's status. Recomputes the priority via
 * `computeGapPriority` (since status drives the base priority).
 *
 * The optional `notes` param is appended to the existing notes field.
 *
 * Throws if the gap is not found or if newStatus is invalid.
 */
export async function updateGapStatus(
  id: string,
  newStatus: string,
  notes?: string,
): Promise<IntegrationGapRecord> {
  if (!id) throw new Error("id is required");
  if (!isValidGapStatus(newStatus)) {
    throw new Error(`invalid status: ${newStatus}`);
  }

  const existing = await getGapRecord(id);
  if (!existing) throw new Error(`gap record not found: ${id}`);

  // Reconstruct a draft gap with the new status to recompute priority.
  const draft = { ...existing, status: newStatus };
  const recomputedPriority = computeGapPriority(draft);

  const notePrefix = `[${new Date().toISOString()}] status → ${newStatus}`;
  const appendedNotes = notes
    ? `${notePrefix}: ${notes}${existing.notes ? "\n" + existing.notes : ""}`
    : `${notePrefix}${existing.notes ? "\n" + existing.notes : ""}`;

  try {
    const row = await db.integrationGapRecord.update({
      where: { id },
      data: { status: newStatus, priority: recomputedPriority, notes: appendedNotes },
    });
    logger.info("[gap-analysis] gap status updated", {
      id,
      gapId: existing.gapId,
      previousStatus: existing.status,
      newStatus,
      recomputedPriority,
    });
    return row as IntegrationGapRecord;
  } catch (err) {
    logger.error("[gap-analysis] updateGapStatus DB error", {
      error: String(err),
      id,
      newStatus,
    });
    throw err;
  }
}

// ============ §4.8 updateGapPriority ============

/**
 * Override a gap record's priority. Use sparingly — the priority should
 * normally be derived from `computeGapPriority` via `updateGapStatus`. This
 * function is for manual overrides (e.g. an operator flags a particular
 * gap as business-critical regardless of the formula).
 *
 * The optional `reason` is appended to the notes.
 *
 * Throws if the gap is not found.
 */
export async function updateGapPriority(
  id: string,
  priority: number,
  reason?: string,
): Promise<IntegrationGapRecord> {
  if (!id) throw new Error("id is required");
  const clamped = Math.max(0, Math.min(100, Math.round(Number(priority) || 0)));

  const existing = await getGapRecord(id);
  if (!existing) throw new Error(`gap record not found: ${id}`);

  const notePrefix = `[${new Date().toISOString()}] priority → ${clamped}`;
  const appendedNotes = reason
    ? `${notePrefix}: ${reason}${existing.notes ? "\n" + existing.notes : ""}`
    : `${notePrefix}${existing.notes ? "\n" + existing.notes : ""}`;

  try {
    const row = await db.integrationGapRecord.update({
      where: { id },
      data: { priority: clamped, notes: appendedNotes },
    });
    logger.info("[gap-analysis] gap priority updated", {
      id,
      gapId: existing.gapId,
      previousPriority: existing.priority,
      newPriority: clamped,
    });
    return row as IntegrationGapRecord;
  } catch (err) {
    logger.error("[gap-analysis] updateGapPriority DB error", {
      error: String(err),
      id,
      priority: clamped,
    });
    throw err;
  }
}

// ============ §4.9 assignGapOwner ============

/**
 * Assign an owner to a gap record + set the next action + optional due
 * date. Used by the SGTX onboarding team to triage gaps surfaced by the
 * discovery engine.
 *
 * Throws if the gap is not found.
 */
export async function assignGapOwner(
  id: string,
  owner: string,
  nextAction: string,
  dueDate?: Date,
): Promise<IntegrationGapRecord> {
  if (!id) throw new Error("id is required");
  if (!owner) throw new Error("owner is required");
  if (!nextAction) throw new Error("nextAction is required");

  const existing = await getGapRecord(id);
  if (!existing) throw new Error(`gap record not found: ${id}`);

  const notePrefix = `[${new Date().toISOString()}] assigned to ${owner}: ${nextAction}`;
  const appendedNotes = `${notePrefix}${existing.notes ? "\n" + existing.notes : ""}`;

  try {
    const row = await db.integrationGapRecord.update({
      where: { id },
      data: {
        owner,
        nextAction,
        dueDate: dueDate || null,
        notes: appendedNotes,
      },
    });
    logger.info("[gap-analysis] gap owner assigned", {
      id,
      gapId: existing.gapId,
      owner,
      nextAction,
      dueDate: dueDate || null,
    });
    return row as IntegrationGapRecord;
  } catch (err) {
    logger.error("[gap-analysis] assignGapOwner DB error", {
      error: String(err),
      id,
      owner,
    });
    throw err;
  }
}

// ============ §4.10 addAffectedUstn ============

/**
 * Append a USTN to the gap record's `affectedUstns` JSON array. Dedupes
 * against existing entries. Recomputes the priority via
 * `computeGapPriority` (since affectedUstns count drives the priority).
 *
 * Throws if the gap is not found.
 */
export async function addAffectedUstn(
  id: string,
  ustn: string,
): Promise<IntegrationGapRecord> {
  if (!id) throw new Error("id is required");
  if (!ustn) throw new Error("ustn is required");

  const existing = await getGapRecord(id);
  if (!existing) throw new Error(`gap record not found: ${id}`);

  const arr = parseStringArray(existing.affectedUstns);
  if (!arr.includes(ustn)) arr.push(ustn);

  const draft = {
    ...existing,
    affectedUstns: serializeStringArray(arr),
  };
  const recomputedPriority = computeGapPriority(draft);

  try {
    const row = await db.integrationGapRecord.update({
      where: { id },
      data: {
        affectedUstns: serializeStringArray(arr),
        priority: recomputedPriority,
      },
    });
    logger.info("[gap-analysis] affected USTN added", {
      id,
      gapId: existing.gapId,
      ustn,
      affectedUstnsCount: arr.length,
      recomputedPriority,
    });
    return row as IntegrationGapRecord;
  } catch (err) {
    logger.error("[gap-analysis] addAffectedUstn DB error", {
      error: String(err),
      id,
      ustn,
    });
    throw err;
  }
}

// ============ §4.11 addAffectedTradeLane ============

/**
 * Append a trade lane id to the gap record's `affectedTradeLanes` JSON
 * array. Dedupes against existing entries. Recomputes the priority via
 * `computeGapPriority`.
 *
 * Throws if the gap is not found.
 */
export async function addAffectedTradeLane(
  id: string,
  laneId: string,
): Promise<IntegrationGapRecord> {
  if (!id) throw new Error("id is required");
  if (!laneId) throw new Error("laneId is required");

  const existing = await getGapRecord(id);
  if (!existing) throw new Error(`gap record not found: ${id}`);

  const arr = parseStringArray(existing.affectedTradeLanes);
  if (!arr.includes(laneId)) arr.push(laneId);

  const draft = {
    ...existing,
    affectedTradeLanes: serializeStringArray(arr),
  };
  const recomputedPriority = computeGapPriority(draft);

  try {
    const row = await db.integrationGapRecord.update({
      where: { id },
      data: {
        affectedTradeLanes: serializeStringArray(arr),
        priority: recomputedPriority,
      },
    });
    logger.info("[gap-analysis] affected trade lane added", {
      id,
      gapId: existing.gapId,
      laneId,
      affectedTradeLanesCount: arr.length,
      recomputedPriority,
    });
    return row as IntegrationGapRecord;
  } catch (err) {
    logger.error("[gap-analysis] addAffectedTradeLane DB error", {
      error: String(err),
      id,
      laneId,
    });
    throw err;
  }
}

// ============ §4.12 resolveGap ============

/**
 * Resolve a gap by setting status=CONNECTED. Records who resolved it +
 * the resolution notes. Use this when the underlying catalog connector
 * has been promoted to PRODUCTION_CONNECTED (or when SGTX has manually
 * bridged the gap).
 *
 * Throws if the gap is not found.
 */
export async function resolveGap(
  id: string,
  resolvedBy: string,
  notes: string,
): Promise<IntegrationGapRecord> {
  if (!id) throw new Error("id is required");
  if (!resolvedBy) throw new Error("resolvedBy is required");
  if (!notes) throw new Error("notes is required");

  const existing = await getGapRecord(id);
  if (!existing) throw new Error(`gap record not found: ${id}`);

  const draft = { ...existing, status: "CONNECTED" };
  const recomputedPriority = computeGapPriority(draft);

  const notePrefix = `[${new Date().toISOString()}] RESOLVED by ${resolvedBy}: ${notes}`;
  const appendedNotes = `${notePrefix}${existing.notes ? "\n" + existing.notes : ""}`;

  try {
    const row = await db.integrationGapRecord.update({
      where: { id },
      data: {
        status: "CONNECTED",
        priority: recomputedPriority,
        notes: appendedNotes,
        nextAction: null,
        dueDate: null,
      },
    });
    logger.info("[gap-analysis] gap resolved → CONNECTED", {
      id,
      gapId: existing.gapId,
      resolvedBy,
      recomputedPriority,
    });
    return row as IntegrationGapRecord;
  } catch (err) {
    logger.error("[gap-analysis] resolveGap DB error", {
      error: String(err),
      id,
      resolvedBy,
    });
    throw err;
  }
}

// ============ §4.13 getMissingGaps (CRITICAL query) ============

/**
 * THE CRITICAL QUERY — return every gap with status=MISSING for a
 * jurisdiction (or worldwide if no jurisdictionCode). These are the
 * gaps SGTX has identified but not yet integrated — the onboarding
 * team's to-do list.
 *
 * Results are ordered by priority DESC (most urgent first).
 *
 * Returns [] on DB error or if no MISSING gaps exist. Never throws.
 */
export async function getMissingGaps(
  jurisdictionCode?: string,
): Promise<IntegrationGapRecord[]> {
  const where: any = { status: "MISSING" };
  if (jurisdictionCode) where.jurisdictionCode = jurisdictionCode;

  try {
    const rows = await db.integrationGapRecord.findMany({
      where,
      orderBy: [{ priority: "desc" }, { jurisdictionCode: "asc" }, { authority: "asc" }],
    });
    return (rows as IntegrationGapRecord[]) || [];
  } catch (err) {
    logger.error("[gap-analysis] getMissingGaps DB error", {
      error: String(err),
      jurisdictionCode,
    });
    return [];
  }
}

// ============ §4.14 getGapSummary ============

/**
 * Get a summary of gap statuses for a jurisdiction (or worldwide if no
 * jurisdictionCode). Returns counts by status + the average priority.
 *
 * Returns zeros on DB error. Never throws.
 */
export async function getGapSummary(
  jurisdictionCode?: string,
): Promise<GapSummary> {
  const summary: GapSummary = {
    total: 0,
    connected: 0,
    partial: 0,
    manual: 0,
    missing: 0,
    deprecated: 0,
    avgPriority: 0,
  };

  const where: any = {};
  if (jurisdictionCode) where.jurisdictionCode = jurisdictionCode;

  let rows: IntegrationGapRecord[] = [];
  try {
    rows = (await db.integrationGapRecord.findMany({ where })) as IntegrationGapRecord[];
  } catch (err) {
    logger.error("[gap-analysis] getGapSummary DB error", {
      error: String(err),
      jurisdictionCode,
    });
    return summary;
  }

  if (!Array.isArray(rows) || rows.length === 0) return summary;

  let prioritySum = 0;
  for (const row of rows) {
    summary.total++;
    prioritySum += Number(row.priority) || 0;
    if (row.status === "CONNECTED") summary.connected++;
    else if (row.status === "PARTIAL") summary.partial++;
    else if (row.status === "MANUAL") summary.manual++;
    else if (row.status === "MISSING") summary.missing++;
    else if (row.status === "DEPRECATED") summary.deprecated++;
  }
  summary.avgPriority = Math.round(prioritySum / rows.length);
  return summary;
}

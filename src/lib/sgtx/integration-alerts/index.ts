// @ts-nocheck
/**
 * SGTX Phase 8 — §10 Integration Alerts
 * ===========================================================================
 *
 * Implements the integration alerting system on top of the new
 * `IntegrationAlert` Prisma model. SGTX alerts the admin team when 9 types
 * of integration event happen:
 *
 *   CERTIFICATE_EXPIRES    — a connector's certification is expired or
 *                            about to expire (< 30 days).
 *   API_EXPIRES            — an API credential is about to expire.
 *   CREDENTIAL_EXPIRES     — a connector's authentication credential is
 *                            about to expire.
 *   SCHEMA_CHANGES         — the authority's API/schema version changed.
 *   CONNECTOR_OUTAGE       — a connector's status = OUTAGE.
 *   COUNTRY_LAW_CHANGES    — a country's regulatory profile changed.
 *   REQUIRED_MISSING       — a required IntegrationGapRecord with status=
 *                            MISSING.
 *   LANE_NON_READY         — a TradeLaneReadiness with overallReadiness < 0.5.
 *   CONNECTOR_DEPRECATED   — a connector's status = DEPRECATED.
 *
 * Alert lifecycle: OPEN → ACKNOWLEDGED → RESOLVED (or DISMISSED).
 *
 *   OPEN         — newly created; not yet triaged.
 *   ACKNOWLEDGED — an admin has acknowledged (seen + assigned).
 *   RESOLVED     — an admin has resolved + recorded resolution notes.
 *   DISMISSED    — an admin dismissed as invalid / not actionable.
 *
 * Severity levels (3): INFO | WARN | CRITICAL.
 *
 * `alertId` follows the canonical SGTX ID format `ALT-YYYYMMDD-NNNNN`.
 *
 * Pure helpers (`generateAlertId`, `computeSeverity`) have no DB calls + no
 * side effects.
 *
 * `checkAndGenerateAlerts()` is the main scan function — it scans the
 * system for alert conditions and creates new alerts (deduplicated against
 * existing OPEN alerts).
 *
 * All DB calls are try/catch-wrapped with safe defaults — the engine never
 * throws synchronously into API routes.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ §10 Constants ============

/**
 * §10 — the 9 alert types. Each type triggers a different admin action.
 */
export const ALERT_TYPES = [
  "CERTIFICATE_EXPIRES",
  "API_EXPIRES",
  "CREDENTIAL_EXPIRES",
  "SCHEMA_CHANGES",
  "CONNECTOR_OUTAGE",
  "COUNTRY_LAW_CHANGES",
  "REQUIRED_MISSING",
  "LANE_NON_READY",
  "CONNECTOR_DEPRECATED",
] as const;

/**
 * §10 — the 4 alert statuses.
 */
export const ALERT_STATUSES = [
  "OPEN",
  "ACKNOWLEDGED",
  "RESOLVED",
  "DISMISSED",
] as const;

/**
 * §10 — the 3 severity levels.
 */
export const ALERT_SEVERITIES = ["INFO", "WARN", "CRITICAL"] as const;

/**
 * §10 — alert sources.
 */
export const ALERT_SOURCES = [
  "AUTOMATIC",
  "MANUAL",
  "GOVERNMENT_NOTIFICATION",
] as const;

/**
 * Default lead time (days) for "expires soon" alerts.
 */
const DEFAULT_EXPIRY_LEAD_DAYS = 30;

// ============ Types ============

export interface IntegrationAlert {
  id: string;
  alertId: string;
  alertType: string;
  severity: string;
  jurisdictionCode?: string | null;
  authority?: string | null;
  systemName?: string | null;
  connectorId?: string | null;
  laneId?: string | null;
  title: string;
  description?: string | null;
  actionRequired?: string | null;
  dueDate?: Date | null;
  status: string;
  acknowledgedBy?: string | null;
  acknowledgedAt?: Date | null;
  resolvedBy?: string | null;
  resolvedAt?: Date | null;
  resolutionNotes?: string | null;
  affectedUstns?: string | null;
  source?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAlertInput {
  alertType: string;
  severity?: string;
  jurisdictionCode?: string;
  authority?: string;
  systemName?: string;
  connectorId?: string;
  laneId?: string;
  title: string;
  description?: string;
  actionRequired?: string;
  dueDate?: Date;
  affectedUstns?: string[];
  source?: string;
}

export interface ListAlertFilters {
  alertType?: string;
  severity?: string;
  status?: string;
  jurisdictionCode?: string;
  connectorId?: string;
  laneId?: string;
}

export interface AlertSummary {
  total: number;
  open: number;
  acknowledged: number;
  resolved: number;
  dismissed: number;
  critical: number;
  byType: Record<string, number>;
}

export interface CheckResult {
  checked: number;
  generated: number;
  alerts: IntegrationAlert[];
}

// ============ §10.0 Pure helpers ============

/**
 * Pure: generate an `ALT-YYYYMMDD-NNNNN` alert id. 5-digit zero-padded
 * random suffix per UTC day. No DB, no side effects.
 */
export function generateAlertId(): string {
  const d = new Date();
  const ymd =
    `${d.getUTCFullYear()}` +
    `${String(d.getUTCMonth() + 1).padStart(2, "0")}` +
    `${String(d.getUTCDate()).padStart(2, "0")}`;
  const n = Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, "0");
  return `ALT-${ymd}-${n}`;
}

/**
 * Pure: compute the severity for an alert given its type + optional priority.
 *
 *   REQUIRED_MISSING + priority >= 80     → CRITICAL
 *   CONNECTOR_OUTAGE                       → CRITICAL
 *   COUNTRY_LAW_CHANGES                    → CRITICAL
 *   CERTIFICATE_EXPIRES                    → WARN
 *   CREDENTIAL_EXPIRES                     → WARN
 *   SCHEMA_CHANGES                         → WARN
 *   LANE_NON_READY                         → WARN
 *   API_EXPIRES                            → WARN
 *   CONNECTOR_DEPRECATED                   → INFO
 *   (unknown type)                         → WARN
 *
 * No DB, no side effects.
 */
export function computeSeverity(alertType: string, priority?: number): string {
  const t = String(alertType || "").toUpperCase();
  if (t === "REQUIRED_MISSING") {
    const p = Number(priority) || 0;
    return p >= 80 ? "CRITICAL" : "WARN";
  }
  if (t === "CONNECTOR_OUTAGE") return "CRITICAL";
  if (t === "COUNTRY_LAW_CHANGES") return "CRITICAL";
  if (t === "CERTIFICATE_EXPIRES") return "WARN";
  if (t === "CREDENTIAL_EXPIRES") return "WARN";
  if (t === "API_EXPIRES") return "WARN";
  if (t === "SCHEMA_CHANGES") return "WARN";
  if (t === "LANE_NON_READY") return "WARN";
  if (t === "CONNECTOR_DEPRECATED") return "INFO";
  return "WARN";
}

/**
 * Pure: validate an alert type.
 */
function isValidAlertType(t?: string | null): boolean {
  return !!t && (ALERT_TYPES as readonly string[]).includes(t);
}

/**
 * Pure: validate an alert status.
 */
function isValidStatus(s?: string | null): boolean {
  return !!s && (ALERT_STATUSES as readonly string[]).includes(s);
}

/**
 * Pure: validate a severity.
 */
function isValidSeverity(s?: string | null): boolean {
  return !!s && (ALERT_SEVERITIES as readonly string[]).includes(s);
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

// ============ §10.1 createAlert ============

/**
 * Create a new IntegrationAlert. Generates an `ALT-YYYYMMDD-NNNNN` alert id.
 * The status defaults to OPEN.
 *
 * If `severity` is omitted, it is computed via `computeSeverity(alertType)`.
 *
 * Throws on DB error — callers should wrap if needed.
 */
export async function createAlert(
  input: CreateAlertInput,
): Promise<IntegrationAlert> {
  if (!input) throw new Error("input is required");
  if (!isValidAlertType(input.alertType)) {
    throw new Error(`invalid alertType: ${input.alertType}`);
  }
  if (!input.title) throw new Error("title is required");

  const severity = isValidSeverity(input.severity)
    ? input.severity!
    : computeSeverity(input.alertType);

  const data: any = {
    alertId: generateAlertId(),
    alertType: input.alertType,
    severity,
    jurisdictionCode: input.jurisdictionCode || null,
    authority: input.authority || null,
    systemName: input.systemName || null,
    connectorId: input.connectorId || null,
    laneId: input.laneId || null,
    title: input.title,
    description: input.description || null,
    actionRequired: input.actionRequired || null,
    dueDate: input.dueDate || null,
    status: "OPEN",
    acknowledgedBy: null,
    acknowledgedAt: null,
    resolvedBy: null,
    resolvedAt: null,
    resolutionNotes: null,
    affectedUstns: serializeStringArray(input.affectedUstns),
    source: input.source || "AUTOMATIC",
  };

  try {
    const row = await db.integrationAlert.create({ data });
    logger.info("[integration-alerts] alert created", {
      id: row.id,
      alertId: row.alertId,
      alertType: row.alertType,
      severity,
      status: "OPEN",
    });
    return row as IntegrationAlert;
  } catch (err) {
    logger.error("[integration-alerts] createAlert DB error", {
      error: String(err),
      alertType: input.alertType,
      title: input.title,
    });
    throw err;
  }
}

// ============ §10.2 getAlert ============

/**
 * Get an alert by its DB `id`. Returns null if not found or on DB error.
 * Never throws.
 */
export async function getAlert(id: string): Promise<IntegrationAlert | null> {
  if (!id) return null;
  try {
    const row = await db.integrationAlert.findUnique({ where: { id } });
    return (row as IntegrationAlert) || null;
  } catch (err) {
    logger.error("[integration-alerts] getAlert DB error", {
      error: String(err),
      id,
    });
    return null;
  }
}

// ============ §10.3 getAlertByAlertId ============

/**
 * Get an alert by its human-readable `ALT-YYYYMMDD-NNNNN` alert id. Returns
 * null if not found or on DB error. Never throws.
 */
export async function getAlertByAlertId(
  alertId: string,
): Promise<IntegrationAlert | null> {
  if (!alertId) return null;
  try {
    const row = await db.integrationAlert.findUnique({
      where: { alertId },
    });
    return (row as IntegrationAlert) || null;
  } catch (err) {
    logger.error("[integration-alerts] getAlertByAlertId DB error", {
      error: String(err),
      alertId,
    });
    return null;
  }
}

// ============ §10.4 listAlerts ============

/**
 * List alerts by filter. All filter fields are optional — omit them to
 * fetch all alerts. Returns [] on DB error. Never throws.
 */
export async function listAlerts(
  filters?: ListAlertFilters,
): Promise<IntegrationAlert[]> {
  const where: any = {};
  if (filters?.alertType) where.alertType = filters.alertType;
  if (filters?.severity) where.severity = filters.severity;
  if (filters?.status) where.status = filters.status;
  if (filters?.jurisdictionCode) where.jurisdictionCode = filters.jurisdictionCode;
  if (filters?.connectorId) where.connectorId = filters.connectorId;
  if (filters?.laneId) where.laneId = filters.laneId;

  try {
    const rows = await db.integrationAlert.findMany({
      where,
      orderBy: [
        { status: "asc" }, // OPEN first, then ACKNOWLEDGED, etc.
        { severity: "desc" }, // CRITICAL first
        { createdAt: "desc" },
      ],
    });
    return (rows as IntegrationAlert[]) || [];
  } catch (err) {
    logger.error("[integration-alerts] listAlerts DB error", {
      error: String(err),
      filters,
    });
    return [];
  }
}

// ============ §10.5 getOpenAlerts ============

/**
 * THE CRITICAL QUERY — all OPEN alerts (the admin dashboard's primary
 * inbox). Returns [] on DB error. Never throws.
 */
export async function getOpenAlerts(): Promise<IntegrationAlert[]> {
  try {
    const rows = await db.integrationAlert.findMany({
      where: { status: "OPEN" },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    });
    return (rows as IntegrationAlert[]) || [];
  } catch (err) {
    logger.error("[integration-alerts] getOpenAlerts DB error", {
      error: String(err),
    });
    return [];
  }
}

// ============ §10.6 getCriticalAlerts ============

/**
 * All OPEN + CRITICAL alerts — the urgent admin queue. Returns [] on DB
 * error. Never throws.
 */
export async function getCriticalAlerts(): Promise<IntegrationAlert[]> {
  try {
    const rows = await db.integrationAlert.findMany({
      where: {
        status: "OPEN",
        severity: "CRITICAL",
      },
      orderBy: [{ createdAt: "desc" }],
    });
    return (rows as IntegrationAlert[]) || [];
  } catch (err) {
    logger.error("[integration-alerts] getCriticalAlerts DB error", {
      error: String(err),
    });
    return [];
  }
}

// ============ §10.7 getAlertsByJurisdiction ============

/**
 * Get all alerts for a jurisdiction (any status). Returns [] on DB error.
 * Never throws.
 */
export async function getAlertsByJurisdiction(
  jurisdictionCode: string,
): Promise<IntegrationAlert[]> {
  if (!jurisdictionCode) return [];
  try {
    const rows = await db.integrationAlert.findMany({
      where: { jurisdictionCode },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
    return (rows as IntegrationAlert[]) || [];
  } catch (err) {
    logger.error("[integration-alerts] getAlertsByJurisdiction DB error", {
      error: String(err),
      jurisdictionCode,
    });
    return [];
  }
}

// ============ §10.8 acknowledgeAlert ============

/**
 * Acknowledge an alert — OPEN → ACKNOWLEDGED. Sets `acknowledgedBy` +
 * `acknowledgedAt` to now.
 *
 * Throws if the alert is not found or already in a terminal state
 * (RESOLVED/DISMISSED).
 */
export async function acknowledgeAlert(
  id: string,
  acknowledgedBy: string,
): Promise<IntegrationAlert> {
  if (!id) throw new Error("id is required");
  if (!acknowledgedBy) throw new Error("acknowledgedBy is required");

  const existing = await getAlert(id);
  if (!existing) throw new Error(`alert not found: ${id}`);

  const currentStatus = (existing.status || "").toUpperCase();
  if (currentStatus === "RESOLVED" || currentStatus === "DISMISSED") {
    throw new Error(
      `alert ${existing.alertId} is already ${currentStatus} — cannot acknowledge`,
    );
  }

  try {
    const row = await db.integrationAlert.update({
      where: { id },
      data: {
        status: "ACKNOWLEDGED",
        acknowledgedBy,
        acknowledgedAt: new Date(),
      },
    });
    logger.info("[integration-alerts] alert acknowledged", {
      id,
      alertId: existing.alertId,
      acknowledgedBy,
    });
    return row as IntegrationAlert;
  } catch (err) {
    logger.error("[integration-alerts] acknowledgeAlert DB error", {
      error: String(err),
      id,
      acknowledgedBy,
    });
    throw err;
  }
}

// ============ §10.9 resolveAlert ============

/**
 * Resolve an alert — ACKNOWLEDGED → RESOLVED. Sets `resolvedBy` +
 * `resolvedAt` + `resolutionNotes`.
 *
 * Throws if the alert is not found or already DISMISSED.
 */
export async function resolveAlert(
  id: string,
  resolvedBy: string,
  notes: string,
): Promise<IntegrationAlert> {
  if (!id) throw new Error("id is required");
  if (!resolvedBy) throw new Error("resolvedBy is required");

  const existing = await getAlert(id);
  if (!existing) throw new Error(`alert not found: ${id}`);

  const currentStatus = (existing.status || "").toUpperCase();
  if (currentStatus === "DISMISSED") {
    throw new Error(
      `alert ${existing.alertId} is DISMISSED — cannot resolve`,
    );
  }

  try {
    const row = await db.integrationAlert.update({
      where: { id },
      data: {
        status: "RESOLVED",
        resolvedBy,
        resolvedAt: new Date(),
        resolutionNotes: notes || "",
      },
    });
    logger.info("[integration-alerts] alert resolved", {
      id,
      alertId: existing.alertId,
      resolvedBy,
    });
    return row as IntegrationAlert;
  } catch (err) {
    logger.error("[integration-alerts] resolveAlert DB error", {
      error: String(err),
      id,
      resolvedBy,
    });
    throw err;
  }
}

// ============ §10.10 dismissAlert ============

/**
 * Dismiss an alert — → DISMISSED. Records the dismissal reason in
 * `resolutionNotes` (the alert is invalid / not actionable).
 *
 * Throws if the alert is not found.
 */
export async function dismissAlert(
  id: string,
  reason: string,
): Promise<IntegrationAlert> {
  if (!id) throw new Error("id is required");

  const existing = await getAlert(id);
  if (!existing) throw new Error(`alert not found: ${id}`);

  try {
    const row = await db.integrationAlert.update({
      where: { id },
      data: {
        status: "DISMISSED",
        resolutionNotes: reason || "dismissed without reason",
        resolvedAt: new Date(),
      },
    });
    logger.info("[integration-alerts] alert dismissed", {
      id,
      alertId: existing.alertId,
      reason,
    });
    return row as IntegrationAlert;
  } catch (err) {
    logger.error("[integration-alerts] dismissAlert DB error", {
      error: String(err),
      id,
      reason,
    });
    throw err;
  }
}

// ============ §10.11 checkAndGenerateAlerts (main) ============

/**
 * THE MAIN SCAN FUNCTION — scans the system for alert conditions and
 * creates new alerts (deduplicated against existing OPEN alerts).
 *
 * Alert conditions checked:
 *   1. CERTIFICATE_EXPIRES  — catalog entries where certification = EXPIRED
 *      OR certification validUntil < 30 days.
 *   2. CONNECTOR_OUTAGE     — catalog entries with status = OUTAGE.
 *   3. CONNECTOR_DEPRECATED — catalog entries with status = DEPRECATED.
 *   4. REQUIRED_MISSING     — IntegrationGapRecord with status = MISSING +
 *      required = true. CRITICAL if priority >= 80.
 *   5. LANE_NON_READY       — TradeLaneReadiness with overallReadiness < 0.5.
 *
 * Deduplication: if an OPEN alert with the same (alertType, connectorId
 * or laneId, jurisdictionCode) exists, no new alert is created.
 *
 * Returns `{ checked, generated, alerts }` — the count of conditions
 * checked, the count of new alerts generated, and the new alerts.
 * Never throws.
 */
export async function checkAndGenerateAlerts(): Promise<CheckResult> {
  const result: CheckResult = { checked: 0, generated: 0, alerts: [] };

  // 1. CERTIFICATE_EXPIRES — catalog entries with expired/about-to-expire certification.
  try {
    const catalogRows = await db.integrationCatalog.findMany({
      where: {
        OR: [
          { certification: "EXPIRED" },
        ],
      },
    });
    result.checked += Array.isArray(catalogRows) ? catalogRows.length : 0;

    // Plus entries with certification = GRANTED but lastVerifiedAt > 30 days ago.
    const thirtyDaysAgo = new Date(Date.now() - DEFAULT_EXPIRY_LEAD_DAYS * 24 * 60 * 60 * 1000);
    let olderRows: any[] = [];
    try {
      olderRows = await db.integrationCatalog.findMany({
        where: {
          certification: "GRANTED",
          lastVerifiedAt: { lt: thirtyDaysAgo },
        },
      });
      result.checked += olderRows.length;
    } catch {
      // ignore
    }

    for (const row of [...(catalogRows || []), ...olderRows]) {
      const existing = await findOpenAlert(
        "CERTIFICATE_EXPIRES",
        row.connectorId,
        undefined,
        row.jurisdictionCode,
      );
      if (existing) continue;

      try {
        const alert = await createAlert({
          alertType: "CERTIFICATE_EXPIRES",
          severity: computeSeverity("CERTIFICATE_EXPIRES"),
          jurisdictionCode: row.jurisdictionCode,
          authority: row.authority,
          systemName: row.systemName,
          connectorId: row.connectorId,
          title: `Certification ${row.certification} for ${row.systemName} (${row.jurisdictionCode}/${row.authority})`,
          description: `Connector ${row.connectorId} (${row.systemName}) has certification = ${row.certification}. Last verified: ${row.lastVerifiedAt ? new Date(row.lastVerifiedAt).toISOString() : "never"}.`,
          actionRequired: "Renew certification before the integration is marked OUTAGE.",
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
          source: "AUTOMATIC",
        });
        result.alerts.push(alert);
        result.generated++;
      } catch (err) {
        logger.warn("[integration-alerts] CERTIFICATE_EXPIRES alert creation failed", {
          error: String(err),
          connectorId: row.connectorId,
        });
      }
    }
  } catch (err) {
    logger.warn("[integration-alerts] CERTIFICATE_EXPIRES scan failed", {
      error: String(err),
    });
  }

  // 2. CONNECTOR_OUTAGE — catalog entries with status = OUTAGE.
  try {
    const outageRows = await db.integrationCatalog.findMany({
      where: { status: "OUTAGE" },
    });
    result.checked += Array.isArray(outageRows) ? outageRows.length : 0;

    for (const row of outageRows || []) {
      const existing = await findOpenAlert(
        "CONNECTOR_OUTAGE",
        row.connectorId,
        undefined,
        row.jurisdictionCode,
      );
      if (existing) continue;

      try {
        const alert = await createAlert({
          alertType: "CONNECTOR_OUTAGE",
          severity: computeSeverity("CONNECTOR_OUTAGE"),
          jurisdictionCode: row.jurisdictionCode,
          authority: row.authority,
          systemName: row.systemName,
          connectorId: row.connectorId,
          title: `Connector OUTAGE: ${row.systemName} (${row.jurisdictionCode}/${row.authority})`,
          description: `Connector ${row.connectorId} (${row.systemName}) is in OUTAGE state. Trades relying on this integration will fail until the outage is resolved.`,
          actionRequired: "Verify the connector is back online + restore to PRODUCTION_CONNECTED.",
          dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // 1 day from now
          source: "AUTOMATIC",
        });
        result.alerts.push(alert);
        result.generated++;
      } catch (err) {
        logger.warn("[integration-alerts] CONNECTOR_OUTAGE alert creation failed", {
          error: String(err),
          connectorId: row.connectorId,
        });
      }
    }
  } catch (err) {
    logger.warn("[integration-alerts] CONNECTOR_OUTAGE scan failed", {
      error: String(err),
    });
  }

  // 3. CONNECTOR_DEPRECATED — catalog entries with status = DEPRECATED.
  try {
    const deprecatedRows = await db.integrationCatalog.findMany({
      where: { status: "DEPRECATED" },
    });
    result.checked += Array.isArray(deprecatedRows) ? deprecatedRows.length : 0;

    for (const row of deprecatedRows || []) {
      const existing = await findOpenAlert(
        "CONNECTOR_DEPRECATED",
        row.connectorId,
        undefined,
        row.jurisdictionCode,
      );
      if (existing) continue;

      try {
        const alert = await createAlert({
          alertType: "CONNECTOR_DEPRECATED",
          severity: computeSeverity("CONNECTOR_DEPRECATED"),
          jurisdictionCode: row.jurisdictionCode,
          authority: row.authority,
          systemName: row.systemName,
          connectorId: row.connectorId,
          title: `Connector DEPRECATED: ${row.systemName} (${row.jurisdictionCode}/${row.authority})`,
          description: `Connector ${row.connectorId} (${row.systemName}) has been DEPRECATED by the authority. Plan migration to the replacement system.`,
          actionRequired: "Identify the replacement system + update the catalog entry.",
          source: "AUTOMATIC",
        });
        result.alerts.push(alert);
        result.generated++;
      } catch (err) {
        logger.warn("[integration-alerts] CONNECTOR_DEPRECATED alert creation failed", {
          error: String(err),
          connectorId: row.connectorId,
        });
      }
    }
  } catch (err) {
    logger.warn("[integration-alerts] CONNECTOR_DEPRECATED scan failed", {
      error: String(err),
    });
  }

  // 4. REQUIRED_MISSING — IntegrationGapRecord with status = MISSING + required = true.
  try {
    const missingGaps = await db.integrationGapRecord.findMany({
      where: { status: "MISSING", required: true },
    });
    result.checked += Array.isArray(missingGaps) ? missingGaps.length : 0;

    for (const gap of missingGaps || []) {
      // Dedupe by (alertType, gapId as connectorId surrogate, jurisdictionCode).
      const existing = await findOpenAlert(
        "REQUIRED_MISSING",
        undefined,
        undefined,
        gap.jurisdictionCode,
        gap.gapId,
      );
      if (existing) continue;

      const priority = Number(gap.priority) || 0;
      try {
        const alert = await createAlert({
          alertType: "REQUIRED_MISSING",
          severity: computeSeverity("REQUIRED_MISSING", priority),
          jurisdictionCode: gap.jurisdictionCode,
          authority: gap.authority,
          systemName: gap.systemName || undefined,
          title: `Missing required integration: ${gap.authority} for ${gap.jurisdictionCode}`,
          description: `Gap ${gap.gapId}: required ${gap.authority} integration for ${gap.jurisdictionCode} (procedure=${gap.procedure || "any"}, mode=${gap.transportMode || "any"}) is MISSING. Priority=${priority}.`,
          actionRequired: `Investigate + onboard the missing ${gap.authority} integration. Next action: ${gap.nextAction || "(none set)"}.`,
          dueDate: gap.dueDate || undefined,
          affectedUstns: parseStringArray(gap.affectedUstns),
          source: "AUTOMATIC",
        });
        result.alerts.push(alert);
        result.generated++;
      } catch (err) {
        logger.warn("[integration-alerts] REQUIRED_MISSING alert creation failed", {
          error: String(err),
          gapId: gap.gapId,
        });
      }
    }
  } catch (err) {
    logger.warn("[integration-alerts] REQUIRED_MISSING scan failed", {
      error: String(err),
    });
  }

  // 5. LANE_NON_READY — TradeLaneReadiness with overallReadiness < 0.5.
  try {
    const nonReadyLanes = await db.tradeLaneReadiness.findMany({
      where: { overallReadiness: { lt: 0.5 } },
    });
    result.checked += Array.isArray(nonReadyLanes) ? nonReadyLanes.length : 0;

    for (const lane of nonReadyLanes || []) {
      const existing = await findOpenAlert(
        "LANE_NON_READY",
        undefined,
        lane.laneId,
        undefined,
      );
      if (existing) continue;

      try {
        const alert = await createAlert({
          alertType: "LANE_NON_READY",
          severity: computeSeverity("LANE_NON_READY"),
          laneId: lane.laneId,
          title: `Non-ready trade lane: ${lane.originCountry} → ${lane.destinationCountry} (${lane.transportMode})`,
          description: `Lane ${lane.laneId} (${lane.originCountry}→${lane.destinationCountry}, mode=${lane.transportMode}, hs6=${lane.hs6 || "any"}) has overallReadiness=${(Number(lane.overallReadiness) || 0).toFixed(3)} (< 0.5). manualTouchpoints=${lane.manualTouchpoints}, missingIntegrations=${lane.missingIntegrations}, blockers=${parseStringArray(lane.blockers).length}.`,
          actionRequired: `Address ${lane.missingIntegrations} missing integration(s) + reduce ${lane.manualTouchpoints} manual touchpoint(s).`,
          source: "AUTOMATIC",
        });
        result.alerts.push(alert);
        result.generated++;
      } catch (err) {
        logger.warn("[integration-alerts] LANE_NON_READY alert creation failed", {
          error: String(err),
          laneId: lane.laneId,
        });
      }
    }
  } catch (err) {
    logger.warn("[integration-alerts] LANE_NON_READY scan failed", {
      error: String(err),
    });
  }

  logger.info("[integration-alerts] scan complete", {
    checked: result.checked,
    generated: result.generated,
  });

  return result;
}

/**
 * Internal: find an existing OPEN alert with the same (alertType,
 * connectorId OR laneId, jurisdictionCode). Used by `checkAndGenerateAlerts`
 * to deduplicate.
 *
 * Returns the first OPEN alert found, or null. Never throws.
 */
async function findOpenAlert(
  alertType: string,
  connectorId?: string | null,
  laneId?: string | null,
  jurisdictionCode?: string | null,
  gapId?: string | null,
): Promise<IntegrationAlert | null> {
  const where: any = { alertType, status: "OPEN" };
  if (connectorId) where.connectorId = connectorId;
  if (laneId) where.laneId = laneId;
  if (jurisdictionCode) where.jurisdictionCode = jurisdictionCode;
  if (gapId) {
    // gapId is not a column — match by description containing the gapId.
    where.description = { contains: gapId };
  }
  try {
    const row = await db.integrationAlert.findFirst({ where });
    return (row as IntegrationAlert) || null;
  } catch (err) {
    logger.warn("[integration-alerts] findOpenAlert DB error", {
      error: String(err),
      alertType,
      connectorId,
      laneId,
      jurisdictionCode,
    });
    return null;
  }
}

// ============ §10.12 getAlertSummary ============

/**
 * Get a high-level alert summary for the admin dashboard:
 *   - total: all alerts ever created.
 *   - open / acknowledged / resolved / dismissed: counts by status.
 *   - critical: count of OPEN + CRITICAL alerts.
 *   - byType: count of OPEN alerts per alert type.
 *
 * Returns zeros on DB error. Never throws.
 */
export async function getAlertSummary(): Promise<AlertSummary> {
  const summary: AlertSummary = {
    total: 0,
    open: 0,
    acknowledged: 0,
    resolved: 0,
    dismissed: 0,
    critical: 0,
    byType: {},
  };

  try {
    summary.total = await db.integrationAlert.count();
    summary.open = await db.integrationAlert.count({ where: { status: "OPEN" } });
    summary.acknowledged = await db.integrationAlert.count({
      where: { status: "ACKNOWLEDGED" },
    });
    summary.resolved = await db.integrationAlert.count({
      where: { status: "RESOLVED" },
    });
    summary.dismissed = await db.integrationAlert.count({
      where: { status: "DISMISSED" },
    });
    summary.critical = await db.integrationAlert.count({
      where: { status: "OPEN", severity: "CRITICAL" },
    });

    // byType: count of OPEN alerts per alert type.
    const openAlerts = await db.integrationAlert.findMany({
      where: { status: "OPEN" },
      select: { alertType: true },
    });
    const counts: Record<string, number> = {};
    for (const a of openAlerts || []) {
      counts[a.alertType] = (counts[a.alertType] || 0) + 1;
    }
    summary.byType = counts;
  } catch (err) {
    logger.error("[integration-alerts] getAlertSummary DB error", {
      error: String(err),
    });
  }

  return summary;
}

// ============ §10.13 getExpiringCertificates ============

/**
 * Get catalog entries with certification expiring within `daysAhead` days.
 *
 * The catalog model does NOT have a `validUntil` field for certification
 * (it has `certification` which is REQUIRED | PENDING | GRANTED | EXPIRED |
 * NOT_REQUIRED). We approximate "expiring soon" using `lastVerifiedAt`:
 * if lastVerifiedAt is older than (today - daysAhead) days + certification
 * is GRANTED, the certification is considered stale (expiring soon).
 *
 * Also includes all entries where certification = EXPIRED.
 *
 * Returns an array of catalog entries (with derived `daysUntilExpiry` field).
 * Returns [] on DB error. Never throws.
 */
export async function getExpiringCertificates(daysAhead = 30): Promise<any[]> {
  const cutoff = new Date(Date.now() - daysAhead * 24 * 60 * 60 * 1000);

  try {
    const expired = await db.integrationCatalog.findMany({
      where: { certification: "EXPIRED" },
      orderBy: [{ jurisdictionCode: "asc" }, { authority: "asc" }],
    });

    const staleGranted = await db.integrationCatalog.findMany({
      where: {
        certification: "GRANTED",
        lastVerifiedAt: { lt: cutoff },
      },
      orderBy: [{ jurisdictionCode: "asc" }, { authority: "asc" }],
    });

    const expiredArr = (expired as any[]) || [];
    const staleArr = (staleGranted as any[]) || [];

    // Annotate each entry with a derived `daysUntilExpiry` (negative for
    // already-expired; positive for stale entries based on lastVerifiedAt).
    const annotated = [...expiredArr, ...staleArr].map((row) => {
      const lv = row.lastVerifiedAt ? new Date(row.lastVerifiedAt).getTime() : 0;
      const daysSince = lv > 0
        ? Math.floor((Date.now() - lv) / (24 * 60 * 60 * 1000))
        : 0;
      return {
        ...row,
        daysSinceLastVerified: daysSince,
        daysUntilExpiry: row.certification === "EXPIRED" ? -daysSince : daysAhead - daysSince,
        expiryReason: row.certification === "EXPIRED"
          ? "certification already EXPIRED"
          : `last verified ${daysSince} days ago (cutoff = ${daysAhead} days)`,
      };
    });

    return annotated;
  } catch (err) {
    logger.error("[integration-alerts] getExpiringCertificates DB error", {
      error: String(err),
      daysAhead,
    });
    return [];
  }
}

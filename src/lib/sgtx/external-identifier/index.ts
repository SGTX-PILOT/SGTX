// @ts-nocheck
/**
 * SGTX Master Amendment — §57 External Identifier Registry
 * ===========================================================================
 *
 * Implements the §57 External Identifier Registry — a single canonical
 * store for every external identifier attached to a USTN:
 *
 *   - bank reference numbers (UTR, RRN, bankTxnId)
 *   - NAFEZA ACID / UCR (Egyptian customs)
 *   - CargoX references
 *   - customs declarations (SAD, DMS, C88, etc.)
 *   - ERP document numbers (buyer/seller side)
 *   - marketplace order IDs (Alibaba, TradeKey, EC21)
 *   - invoice numbers
 *   - bill of lading numbers
 *   - contract IDs
 *   - document IDs (LC, CoO, inspection)
 *
 * §57 — Each identifier is globally unique within its type. An identifier
 * can be linked to one USTN. The registry is bi-directional: lookup by
 * type+value finds the USTN; lookup by USTN returns all linked identifiers.
 *
 * Lifecycle: ACTIVE | EXPIRED | REVOKED. The registry tracks the issuing
 * authority + issuer system + evidence references for every identifier.
 *
 * All DB calls are try/catch-wrapped with safe defaults — the engine
 * never throws synchronously into API routes.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ §57 Constants — identifier types ============

/**
 * §57 — the canonical external identifier types. Each type maps to a
 * distinct external system's identifier scheme.
 */
export const IDENTIFIER_TYPES = [
  "BANK_REFERENCE",     // bank-side transaction reference (UTR, RRN)
  "NAFEZA_ACID",        // Egyptian NAFEZA Advance Cargo Information
  "NAFEZA_UCR",         // NAFEZA Unique Consignment Reference
  "CARGOX_REF",         // CargoX blockchain document reference
  "CUSTOMS_REF",        // customs declaration (SAD/DMS/C88)
  "ERP_REF",            // buyer/seller ERP document number
  "MARKETPLACE_REF",    // marketplace order ID (Alibaba, TradeKey)
  "INVOICE_NUMBER",     // commercial invoice number
  "BL_NUMBER",          // bill of lading number
  "CONTRACT_ID",        // contract ID
  "DOCUMENT_ID",       // generic document ID (LC, CoO, inspection)
  "LC_NUMBER",          // letter of credit number
  "CONTAINER_NUMBER",   // container number (ISO 6346)
  "BOOKING_NUMBER",     // shipping line booking number
  "VESSEL_VOYAGE",      // vessel + voyage reference
  "HS_CODE",            // HS code (product identifier)
  "GTD_ID",             // global trade document ID
] as const;

export type IdentifierType = (typeof IDENTIFIER_TYPES)[number];

/**
 * §57 — Identifier lifecycle states.
 */
export const IDENTIFIER_LIFECYCLE = [
  "ACTIVE",
  "EXPIRED",
  "REVOKED",
] as const;

/**
 * Common issuing authorities (informational — any string is accepted).
 */
export const ISSUING_AUTHORITIES = [
  "BANK",
  "CUSTOMS",
  "NAFEZA",
  "CARGOX",
  "ERP",
  "MARKETPLACE",
  "SGTX",
  "SHIPPING_LINE",
  "INSURER",
  "LABORATORY",
  "GOVERNMENT",
] as const;

// ============ Types ============

export interface ExternalIdentifierRow {
  id: string;
  ustn?: string | null;
  identifierType: string;
  identifierValue: string;
  issuingAuthority?: string | null;
  issuerSystem?: string | null;
  relatedEntity?: string | null;
  relatedEventId?: string | null;
  validity?: string | null;
  lifecycleStatus: string;
  source?: string | null;
  evidence?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RegisterIdentifierInput {
  ustn?: string | null;
  identifierType: string;
  identifierValue: string;
  issuingAuthority?: string | null;
  issuerSystem?: string | null;
  relatedEntity?: string | null;
  relatedEventId?: string | null;
  validity?: string | null;
  source?: string | null;
  evidence?: Record<string, any> | null;
}

// ============ §57.0 Pure helpers ============

/**
 * Pure: validate that an identifier type is one of the canonical types.
 * Returns true if valid, false otherwise.
 */
export function isValidIdentifierType(type: string): boolean {
  return IDENTIFIER_TYPES.includes(type as IdentifierType);
}

/**
 * Pure: normalize an identifier value (uppercase, trim, collapse whitespace).
 * Some types (BANK_REFERENCE, BL_NUMBER) need normalization to prevent
 * duplicate registrations of the same identifier with different cases.
 */
export function normalizeIdentifierValue(
  type: string,
  value: string,
): string {
  if (typeof value !== "string") return "";
  const v = value.trim();
  // Some types are case-sensitive (HS_CODE, container numbers)
  if (type === "HS_CODE" || type === "CONTAINER_NUMBER" || type === "LC_NUMBER") {
    return v.toUpperCase();
  }
  return v;
}

/**
 * Pure: parse the evidence JSON object. Defensive — returns {} on
 * parse error or non-object input.
 */
export function parseEvidence(raw: unknown): Record<string, any> {
  if (raw && typeof raw === "object") return raw as Record<string, any>;
  if (typeof raw !== "string" || !raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

// ============ §57.1 registerIdentifier ============

/**
 * Register a new external identifier. If the (type, value) pair already
 * exists, returns the existing row (idempotent — useful when an external
 * system replays the same registration).
 *
 * Returns the identifier row, or null on error.
 */
export async function registerIdentifier(
  input: RegisterIdentifierInput,
): Promise<ExternalIdentifierRow | null> {
  if (!input || !input.identifierType || !input.identifierValue) {
    logger.warn("[external-identifier] register rejected: missing required fields");
    return null;
  }
  const type = input.identifierType;
  const value = normalizeIdentifierValue(type, input.identifierValue);
  if (!value) {
    logger.warn("[external-identifier] register rejected: empty value after normalization", {
      type,
    });
    return null;
  }

  // Idempotency: try find first
  try {
    const existing = await db.externalIdentifier.findUnique({
      where: {
        identifierType_identifierValue: { identifierType: type, identifierValue: value },
      },
    });
    if (existing) {
      logger.info("[external-identifier] idempotent hit — returning existing", {
        type,
        value,
      });
      return existing as ExternalIdentifierRow;
    }
  } catch (err) {
    logger.warn("[external-identifier] findUnique failed — will attempt create", {
      error: String(err),
      type,
      value,
    });
  }

  try {
    const row = await db.externalIdentifier.create({
      data: {
        ustn: input.ustn || null,
        identifierType: type,
        identifierValue: value,
        issuingAuthority: input.issuingAuthority || null,
        issuerSystem: input.issuerSystem || null,
        relatedEntity: input.relatedEntity || null,
        relatedEventId: input.relatedEventId || null,
        validity: input.validity || "ACTIVE",
        lifecycleStatus: "ACTIVE",
        source: input.source || null,
        evidence: input.evidence ? JSON.stringify(input.evidence) : null,
      },
    });
    logger.info("[external-identifier] identifier registered", {
      id: row.id,
      type,
      value,
      ustn: input.ustn || null,
      authority: input.issuingAuthority || null,
    });
    return row as ExternalIdentifierRow;
  } catch (err) {
    // Race: another worker inserted between our find and create
    try {
      const existing = await db.externalIdentifier.findUnique({
        where: {
          identifierType_identifierValue: { identifierType: type, identifierValue: value },
        },
      });
      if (existing) return existing as ExternalIdentifierRow;
    } catch (err2) {
      logger.error("[external-identifier] fallback findUnique failed", {
        error: String(err2),
        type,
        value,
      });
    }
    logger.error("[external-identifier] register create failed", {
      error: String(err),
      type,
      value,
    });
    return null;
  }
}

// ============ §57.2 getIdentifier ============

/**
 * Get an external identifier by its type + value. Returns null if not
 * found.
 */
export async function getIdentifier(
  type: string,
  value: string,
): Promise<ExternalIdentifierRow | null> {
  if (!type || !value) return null;
  const normalized = normalizeIdentifierValue(type, value);
  try {
    const row = await db.externalIdentifier.findUnique({
      where: {
        identifierType_identifierValue: {
          identifierType: type,
          identifierValue: normalized,
        },
      },
    });
    return (row as ExternalIdentifierRow) || null;
  } catch (err) {
    logger.error("[external-identifier] getIdentifier failed", {
      error: String(err),
      type,
      value,
    });
    return null;
  }
}

// ============ §57.3 getIdentifiersByUstn ============

/**
 * Get all external identifiers linked to a USTN. Returns [] on error.
 */
export async function getIdentifiersByUstn(
  ustn: string,
): Promise<ExternalIdentifierRow[]> {
  if (!ustn) return [];
  try {
    const rows = await db.externalIdentifier.findMany({
      where: { ustn },
      orderBy: { createdAt: "asc" },
    });
    return (rows as ExternalIdentifierRow[]) || [];
  } catch (err) {
    logger.error("[external-identifier] getIdentifiersByUstn failed", {
      error: String(err),
      ustn,
    });
    return [];
  }
}

/**
 * Get all external identifiers of a specific type (across all USTNs).
 * Useful for bulk lookups (e.g. "all NAFEZA ACID identifiers").
 */
export async function getIdentifiersByType(
  type: string,
): Promise<ExternalIdentifierRow[]> {
  if (!type) return [];
  try {
    const rows = await db.externalIdentifier.findMany({
      where: { identifierType: type },
      orderBy: { createdAt: "desc" },
    });
    return (rows as ExternalIdentifierRow[]) || [];
  } catch (err) {
    logger.error("[external-identifier] getIdentifiersByType failed", {
      error: String(err),
      type,
    });
    return [];
  }
}

// ============ §57.4 linkToUstn ============

/**
 * Link an existing external identifier to a USTN. If the identifier
 * doesn't exist, it is registered first. If it already has a different
 * USTN, returns null (don't silently steal it).
 *
 * Returns the updated identifier row, or null on error or conflict.
 */
export async function linkToUstn(
  type: string,
  value: string,
  ustn: string,
): Promise<ExternalIdentifierRow | null> {
  if (!type || !value || !ustn) return null;
  const normalized = normalizeIdentifierValue(type, value);
  // Try fetch first
  let existing = await getIdentifier(type, normalized);
  if (!existing) {
    // Register then link
    existing = await registerIdentifier({
      identifierType: type,
      identifierValue: normalized,
      ustn,
    });
    return existing;
  }
  // If already linked to a different USTN, refuse
  if (existing.ustn && existing.ustn !== ustn) {
    logger.warn("[external-identifier] link conflict — already linked to different USTN", {
      type,
      value: normalized,
      currentUstn: existing.ustn,
      requestedUstn: ustn,
    });
    return null;
  }
  if (existing.ustn === ustn) return existing;
  try {
    const updated = await db.externalIdentifier.update({
      where: {
        identifierType_identifierValue: {
          identifierType: type,
          identifierValue: normalized,
        },
      },
      data: { ustn },
    });
    logger.info("[external-identifier] linked to USTN", {
      type,
      value: normalized,
      ustn,
    });
    return updated as ExternalIdentifierRow;
  } catch (err) {
    logger.error("[external-identifier] linkToUstn update failed", {
      error: String(err),
      type,
      value: normalized,
      ustn,
    });
    return null;
  }
}

/**
 * Update the lifecycle status of an identifier (ACTIVE / EXPIRED / REVOKED).
 */
export async function updateLifecycleStatus(
  type: string,
  value: string,
  status: string,
): Promise<ExternalIdentifierRow | null> {
  if (!type || !value || !status) return null;
  if (!IDENTIFIER_LIFECYCLE.includes(status as any)) {
    logger.warn("[external-identifier] unknown lifecycle status", { status });
    return null;
  }
  const normalized = normalizeIdentifierValue(type, value);
  try {
    const updated = await db.externalIdentifier.update({
      where: {
        identifierType_identifierValue: {
          identifierType: type,
          identifierValue: normalized,
        },
      },
      data: { lifecycleStatus: status, validity: status },
    });
    logger.info("[external-identifier] lifecycle updated", {
      type,
      value: normalized,
      status,
    });
    return updated as ExternalIdentifierRow;
  } catch (err) {
    logger.error("[external-identifier] updateLifecycleStatus failed", {
      error: String(err),
      type,
      value: normalized,
      status,
    });
    return null;
  }
}

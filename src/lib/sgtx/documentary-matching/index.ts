// @ts-nocheck
/**
 * SGTX Phase 6 — §4 Documentary Matching Engine
 * ===========================================================================
 *
 * Matches 7 trade document types against each other and flags discrepancies
 * BEFORE the documents are presented to a bank. The match row is persisted
 * on the new `DocumentaryMatch` table (prisma schema line 6527); it links
 * to existing rows on `LetterOfCredit`, `TradeFinanceDocument`,
 * `TransportDocument`, `Certificate`, and `CustomsDeclaration` via JSON-
 * encoded reference arrays stored on the `documents` field.
 *
 * The 7 document types (§4):
 *
 *   LC            — Letter of Credit (db.letterOfCredit)
 *   CONTRACT      — Trade Finance Document with documentType = CONTRACT (db.tradeFinanceDocument)
 *   INVOICE       — Trade Finance Document with documentType = COMMERCIAL_INVOICE (db.tradeFinanceDocument)
 *   PACKING_LIST  — Trade Finance Document with documentType = PACKING_LIST (db.tradeFinanceDocument)
 *   TRANSPORT_DOC — Transport Document (db.transportDocument)
 *   CERTIFICATE   — Certificate of Origin / phytosanitary / etc. (db.certificateOfOrigin OR db.tradeFinanceDocument)
 *   CUSTOMS       — Customs Declaration (db.customsDeclaration)
 *
 * Field comparison:
 *   - amount        — invoice total vs LC amount vs contract value  (CRITICAL)
 *   - hsCode        — HS code across all docs                       (CRITICAL)
 *   - quantity      — quantity / weight across docs                 (CRITICAL)
 *   - origin        — origin / portOfLoading                        (MAJOR)
 *   - destination   — destination / portOfDischarge                 (MAJOR)
 *   - consignor     — applicant / exporter                         (MAJOR)
 *   - consignee     — beneficiary / importer                       (MAJOR)
 *   - shipmentDate  — actual shipment date vs LC latest shipment   (CRITICAL if late)
 *   - incoterm      — Incoterm across docs                         (MAJOR)
 *   - currency      — Currency across docs                         (CRITICAL)
 *   - description   — commodity description wording                (MINOR)
 *
 * Severity levels: CRITICAL | MAJOR | MINOR
 *   - CRITICAL differences block presentation
 *   - MAJOR differences are blocking unless explicitly waived
 *   - MINOR differences do NOT block presentation
 *
 * `readyForPresentation = true` if matchStatus = MATCHED OR all
 * discrepancies are MINOR.
 *
 * `confidence = matchedFields / totalFieldsChecked`
 *
 * All DB calls are try/catch-wrapped with safe defaults. Pure helpers
 * (`getFieldValue`, `compareValues`) never touch the DB.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ §4 Constants ============

export const DOCUMENT_TYPES = [
  "LC",
  "CONTRACT",
  "INVOICE",
  "PACKING_LIST",
  "TRANSPORT_DOC",
  "CERTIFICATE",
  "CUSTOMS",
] as const;

export const MATCH_STATUSES = [
  "PENDING",
  "MATCHED",
  "DISCREPANT",
  "WAIVED",
] as const;

export const SEVERITY_LEVELS = [
  "CRITICAL",
  "MAJOR",
  "MINOR",
] as const;

/**
 * Field definitions compared across documents. The `tolerance` field is the
 * fractional tolerance for numeric comparisons (e.g. 0.005 = 0.5%); strings
 * use exact match; dates use same-day comparison.
 */
const FIELD_DEFINITIONS: Array<{
  field: string;
  severity: string;
  tolerance?: number;
}> = [
  { field: "amount", severity: "CRITICAL", tolerance: 0.005 },
  { field: "hsCode", severity: "CRITICAL" },
  { field: "quantity", severity: "CRITICAL", tolerance: 0.005 },
  { field: "origin", severity: "MAJOR" },
  { field: "destination", severity: "MAJOR" },
  { field: "consignor", severity: "MAJOR" },
  { field: "consignee", severity: "MAJOR" },
  { field: "shipmentDate", severity: "CRITICAL" },
  { field: "incoterm", severity: "MAJOR" },
  { field: "currency", severity: "CRITICAL" },
  { field: "description", severity: "MINOR" },
];

// ============ Types ============

export interface MatchInput {
  ustn?: string;
  tradeId?: string;
  /** L/C number — when provided, the LC is fetched and compared against. */
  lcNumber?: string;
  /** Optional explicit documents to compare (overrides DB lookup). */
  documents?: Array<{
    type: string;
    referenceId: string;
    fields?: Record<string, any>;
  }>;
  /** Optional caller-specified reviewer (stored on first match creation). */
  reviewedBy?: string;
  notes?: string;
}

export interface MatchResult {
  ok: boolean;
  match?: any;
  error?: string;
}

export interface DocumentaryMatchRecord {
  id: string;
  ustn?: string | null;
  tradeId?: string | null;
  lcNumber?: string | null;
  documents?: string | null;
  matchStatus: string;
  discrepancyCount: number;
  discrepancies?: string | null;
  fieldsChecked?: string | null;
  confidence: number;
  readyForPresentation: boolean;
  reviewedBy?: string | null;
  reviewedAt?: Date | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PresentationReadiness {
  ready: boolean;
  blockingDiscrepancies: number;
  minorDiscrepancies: number;
}

// ============ §4.0 Pure helpers ============

/**
 * Extract a value from an object by dot-path. Pure.
 *
 * Examples:
 *   getFieldValue({ a: { b: 5 } }, "a.b")         → 5
 *   getFieldValue({ arr: [{ x: 1 }] }, "arr.0.x") → 1
 *   getFieldValue({ a: 1 }, "b")                  → undefined
 *
 * Returns `undefined` if any segment is missing or the path is invalid.
 * Numeric segments index into arrays; non-numeric segments look up object
 * keys. Supports indexing into arrays with numeric strings.
 */
export function getFieldValue(doc: any, fieldPath: string): any {
  if (doc == null) return undefined;
  if (!fieldPath) return doc;
  const parts = String(fieldPath).split(".");
  let cur: any = doc;
  for (const part of parts) {
    if (cur == null) return undefined;
    if (Array.isArray(cur)) {
      const idx = Number(part);
      if (isNaN(idx)) return undefined;
      cur = cur[idx];
    } else if (typeof cur === "object") {
      cur = cur[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

/**
 * Compare two values with tolerance. Pure.
 *
 *  - Numbers: match if `|a-b| / max(|a|,|b|, 1) <= tolerance` (default 0.5%).
 *    Treats null/undefined as missing (returns match=true if both missing,
 *    match=false with reason "missing value" if only one missing).
 *  - Strings: exact match (case-insensitive, trimmed).
 *  - Dates: match if same calendar day (UTC).
 *  - Mixed types: no match (returns match=false with reason).
 *
 * Returns:
 *   match     — true if values match
 *   severity  — inherited from the field definition (defaults to "MAJOR")
 *   reason    — human-readable explanation
 *
 * Note: severity is a passthrough — the caller knows the field's severity
 * from the FIELD_DEFINITIONS table; `compareValues` returns it for
 * convenience so the caller doesn't have to look it up again.
 */
export function compareValues(
  valueA: any,
  valueB: any,
  tolerance?: number,
): { match: boolean; severity: string; reason: string } {
  const tol = typeof tolerance === "number" && tolerance >= 0 ? tolerance : 0.005;
  const aMissing = valueA == null || valueA === "";
  const bMissing = valueB == null || valueB === "";

  if (aMissing && bMissing) {
    return { match: true, severity: "MINOR", reason: "both values missing" };
  }
  if (aMissing || bMissing) {
    return {
      match: false,
      severity: "MAJOR",
      reason: "one value missing — cannot compare",
    };
  }

  // Date comparison (Date instance OR ISO string).
  const aDate = toDate(valueA);
  const bDate = toDate(valueB);
  if (aDate && bDate) {
    const sameDay =
      aDate.getUTCFullYear() === bDate.getUTCFullYear() &&
      aDate.getUTCMonth() === bDate.getUTCMonth() &&
      aDate.getUTCDate() === bDate.getUTCDate();
    return sameDay
      ? { match: true, severity: "MAJOR", reason: "dates match (same day)" }
      : {
          match: false,
          severity: "CRITICAL",
          reason: `dates differ: ${aDate.toISOString().slice(0, 10)} vs ${bDate.toISOString().slice(0, 10)}`,
        };
  }

  // Numeric comparison.
  const aNum = Number(valueA);
  const bNum = Number(valueB);
  if (!isNaN(aNum) && !isNaN(bNum) && isFinite(aNum) && isFinite(bNum)) {
    const absA = Math.abs(aNum);
    const absB = Math.abs(bNum);
    const max = Math.max(absA, absB, 1);
    const diff = Math.abs(aNum - bNum);
    if (diff / max <= tol) {
      return {
        match: true,
        severity: "CRITICAL",
        reason: `numeric match within ${(tol * 100).toFixed(2)}% tolerance`,
      };
    }
    return {
      match: false,
      severity: "CRITICAL",
      reason: `numeric mismatch: ${aNum} vs ${bNum} (diff ${(diff / max * 100).toFixed(2)}% > ${(tol * 100).toFixed(2)}%)`,
    };
  }

  // String comparison (case-insensitive, trimmed).
  const aStr = String(valueA).trim().toLowerCase();
  const bStr = String(valueB).trim().toLowerCase();
  if (aStr === bStr) {
    return { match: true, severity: "MAJOR", reason: "strings match" };
  }

  return {
    match: false,
    severity: "MAJOR",
    reason: `string mismatch: "${valueA}" vs "${valueB}"`,
  };
}

function toDate(v: any): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === "string") {
    // ISO 8601-ish date — be strict enough to avoid false positives.
    if (/^\d{4}-\d{2}-\d{2}/.test(v) || /^\d{4}\/\d{2}\/\d{2}/.test(v)) {
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    }
  }
  return null;
}

function isValidDocType(t?: string | null): boolean {
  return !!t && (DOCUMENT_TYPES as readonly string[]).includes(t);
}

function isValidMatchStatus(s?: string | null): boolean {
  return !!s && (MATCH_STATUSES as readonly string[]).includes(s);
}

function parseJsonArray(raw: unknown): any[] {
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
 * Compare a single field across N documents. Returns a discrepancy array
 * (empty if all docs agree on the field).
 *
 * The first document with a non-missing value for the field is treated as
 * the reference; every other non-missing value is compared against it.
 */
function compareFieldAcrossDocs(
  field: string,
  severity: string,
  tolerance: number | undefined,
  docs: Array<{ type: string; referenceId: string; fields: Record<string, any> }>,
): any[] {
  const present = docs.filter((d) => {
    const v = getFieldValue(d.fields, field);
    return v != null && v !== "";
  });
  if (present.length < 2) {
    // Fewer than 2 docs carry this field — no comparison possible.
    return [];
  }
  const reference = present[0];
  const refValue = getFieldValue(reference.fields, field);
  const discreps: any[] = [];
  for (let i = 1; i < present.length; i++) {
    const other = present[i];
    const otherValue = getFieldValue(other.fields, field);
    const cmp = compareValues(refValue, otherValue, tolerance);
    if (!cmp.match) {
      discreps.push({
        field,
        docA: reference.type,
        referenceA: reference.referenceId,
        docB: other.type,
        referenceB: other.referenceId,
        valueA: refValue,
        valueB: otherValue,
        severity,
        type: "FIELD_MISMATCH",
        reason: cmp.reason,
        status: "OPEN",
      });
    }
  }
  return discreps;
}

// ============ §4.1 Document loaders ============

/**
 * Load all 7 document types for a USTN / LC number from the existing tables.
 * Each document is normalised to `{ type, referenceId, fields }` where
 * `fields` is a flat dictionary with the keys used by FIELD_DEFINITIONS.
 *
 * Loads (each best-effort, returns [] on error):
 *   - LC            from db.letterOfCredit            (by lcNumber OR ustn)
 *   - CONTRACT      from db.tradeFinanceDocument       (documentType=CONTRACT)
 *   - INVOICE       from db.tradeFinanceDocument       (documentType=COMMERCIAL_INVOICE)
 *   - PACKING_LIST  from db.tradeFinanceDocument       (documentType=PACKING_LIST)
 *   - TRANSPORT_DOC from db.transportDocument           (by ustn)
 *   - CERTIFICATE   from db.certificateOfOrigin        (by ustn) + db.tradeFinanceDocument
 *                  (documentType in CERTIFICATE_*)
 *   - CUSTOMS       from db.customsDeclaration          (by tradeId if known)
 */
async function loadDocumentsForMatch(
  input: MatchInput,
): Promise<Array<{ type: string; referenceId: string; fields: Record<string, any> }>> {
  const docs: Array<{ type: string; referenceId: string; fields: Record<string, any> }> = [];

  const ustn = input.ustn || undefined;
  const tradeId = input.tradeId || undefined;
  const lcNumber = input.lcNumber || undefined;

  // --- LC ---
  try {
    let lc: any = null;
    if (lcNumber) {
      lc = await db.letterOfCredit.findUnique({ where: { lcNumber } });
    } else if (ustn) {
      const rows = await db.letterOfCredit.findMany({
        where: { ustn },
        orderBy: { createdAt: "desc" },
        take: 1,
      });
      lc = rows?.[0] || null;
    }
    if (lc) {
      docs.push({
        type: "LC",
        referenceId: lc.lcNumber || lc.id,
        fields: {
          amount: lc.amount,
          currency: lc.currency,
          hsCode: null, // LC may not carry HS directly; left null
          quantity: null,
          origin: lc.portOfLoading,
          destination: lc.portOfDischarge || lc.placeOfDelivery,
          consignor: lc.applicantGtid || lc.applicantName,
          consignee: lc.beneficiaryGtid || lc.beneficiaryName,
          shipmentDate: lc.latestShipmentDate,
          incoterm: null,
          description: null,
        },
      });
    }
  } catch (err) {
    logger.warn("[documentary-matching] LC load failed", {
      error: String(err),
      lcNumber,
      ustn,
    });
  }

  // --- CONTRACT / INVOICE / PACKING_LIST / CERTIFICATE (from TradeFinanceDocument) ---
  try {
    const where: any = {};
    if (ustn) where.ustn = ustn;
    const rows = await db.tradeFinanceDocument.findMany({ where });
    if (Array.isArray(rows)) {
      for (const r of rows) {
        const t = String(r.documentType || "").toUpperCase();
        let docType: string | null = null;
        if (t === "CONTRACT") docType = "CONTRACT";
        else if (t === "COMMERCIAL_INVOICE" || t === "INVOICE") docType = "INVOICE";
        else if (t === "PACKING_LIST") docType = "PACKING_LIST";
        else if (t.startsWith("CERT") || t === "CERTIFICATE") docType = "CERTIFICATE";
        if (!docType) continue;
        docs.push({
          type: docType,
          referenceId: r.documentReference || r.id,
          fields: {
            amount: r.amount,
            currency: r.currency,
            hsCode: null,
            quantity: null,
            origin: null,
            destination: null,
            consignor: r.beneficiaryGtid,
            consignee: null,
            shipmentDate: r.validFrom,
            incoterm: null,
            description: null,
          },
        });
      }
    }
  } catch (err) {
    logger.warn("[documentary-matching] TradeFinanceDocument load failed", {
      error: String(err),
      ustn,
    });
  }

  // --- TRANSPORT_DOC ---
  try {
    const where: any = {};
    if (ustn) where.ustn = ustn;
    const rows = await db.transportDocument.findMany({ where });
    if (Array.isArray(rows) && rows.length > 0) {
      const td = rows[0]; // use first transport doc as primary
      let payload: any = null;
      try {
        payload = td.payload ? JSON.parse(td.payload) : null;
      } catch {
        payload = null;
      }
      docs.push({
        type: "TRANSPORT_DOC",
        referenceId: td.documentNumber || td.id,
        fields: {
          amount: null,
          currency: null,
          hsCode: getFieldValue(payload, "hsCode"),
          quantity: getFieldValue(payload, "quantity") || getFieldValue(payload, "grossWeight"),
          origin: getFieldValue(payload, "portOfLoading") || getFieldValue(payload, "origin"),
          destination: getFieldValue(payload, "portOfDischarge") || getFieldValue(payload, "destination"),
          consignor: getFieldValue(payload, "consignor") || getFieldValue(payload, "shipper"),
          consignee: getFieldValue(payload, "consignee"),
          shipmentDate: td.issuedAt || getFieldValue(payload, "shipmentDate"),
          incoterm: getFieldValue(payload, "incoterm"),
          description: getFieldValue(payload, "goodsDescription") || getFieldValue(payload, "commodity"),
        },
      });
    }
  } catch (err) {
    logger.warn("[documentary-matching] TransportDocument load failed", {
      error: String(err),
      ustn,
    });
  }

  // --- CERTIFICATE (CertificateOfOrigin) ---
  try {
    const where: any = {};
    if (ustn) where.ustn = ustn;
    const rows = await db.certificateOfOrigin.findMany({ where });
    if (Array.isArray(rows) && rows.length > 0) {
      const c = rows[0];
      docs.push({
        type: "CERTIFICATE",
        referenceId: c.certificateNumber || c.id,
        fields: {
          amount: null,
          currency: null,
          hsCode: c.commodityHs,
          quantity: null,
          origin: c.originCountry,
          destination: c.destinationCountry,
          consignor: null,
          consignee: null,
          shipmentDate: null,
          incoterm: null,
          description: c.commodity,
        },
      });
    }
  } catch (err) {
    logger.warn("[documentary-matching] CertificateOfOrigin load failed", {
      error: String(err),
      ustn,
    });
  }

  // --- CUSTOMS ---
  try {
    const where: any = {};
    if (tradeId) where.tradeId = tradeId;
    else if (ustn) {
      // CustomsDeclaration has no direct ustn column — skip if no tradeId.
      // The caller can pass tradeId via MatchInput to enable customs matching.
    }
    if (Object.keys(where).length > 0) {
      const rows = await db.customsDeclaration.findMany({ where });
      if (Array.isArray(rows) && rows.length > 0) {
        const cd = rows[0];
        docs.push({
          type: "CUSTOMS",
          referenceId: cd.declarationNo || cd.id,
          fields: {
            amount: cd.dutyUsd,
            currency: "USD",
            hsCode: null,
            quantity: null,
            origin: null,
            destination: null,
            consignor: null,
            consignee: null,
            shipmentDate: cd.clearedAt,
            incoterm: null,
            description: null,
          },
        });
      }
    }
  } catch (err) {
    logger.warn("[documentary-matching] CustomsDeclaration load failed", {
      error: String(err),
      tradeId,
    });
  }

  return docs;
}

// ============ §4.2 runDocumentaryMatch ============

/**
 * The main matching function. Loads all 7 document types for a USTN / LC
 * number (or uses the caller-supplied `documents` array), compares each
 * field across documents, and persists a `DocumentaryMatch` row with the
 * result. Returns `{ ok, match }` (or `{ ok: false, error }`).
 *
 * Result fields:
 *   matchStatus         — "MATCHED" if no discrepancies, else "DISCREPANT"
 *   discrepancyCount   — number of OPEN discrepancies
 *   discrepancies       — JSON array of { field, docA, docB, valueA, valueB,
 *                          severity, type, reason, status }
 *   fieldsChecked       — JSON array of field paths actually checked
 *   confidence          — matchedFields / totalFieldsChecked (0..1)
 *   readyForPresentation — true if matchStatus=MATCHED OR all discrepancies
 *                          are MINOR
 */
export async function runDocumentaryMatch(
  input: MatchInput,
): Promise<MatchResult> {
  if (!input) {
    return { ok: false, error: "input is required" };
  }

  // Use caller-supplied documents OR load from DB.
  let docs: Array<{ type: string; referenceId: string; fields: Record<string, any> }> = [];
  if (Array.isArray(input.documents) && input.documents.length > 0) {
    docs = input.documents.map((d) => ({
      type: d.type,
      referenceId: d.referenceId,
      fields: d.fields || {},
    }));
  } else {
    try {
      docs = await loadDocumentsForMatch(input);
    } catch (err) {
      logger.error("[documentary-matching] document load failed", {
        error: String(err),
        ustn: input.ustn,
        lcNumber: input.lcNumber,
      });
      return { ok: false, error: `document load failed: ${String(err)}` };
    }
  }

  if (docs.length < 2) {
    return {
      ok: false,
      error: `At least 2 documents are required to run a match (got ${docs.length}). Provide ustn/lcNumber or pass explicit documents.`,
    };
  }

  // Run field comparisons.
  const allDiscrepancies: any[] = [];
  const fieldsChecked: string[] = [];
  let matchedFields = 0;
  let totalComparisons = 0;

  for (const def of FIELD_DEFINITIONS) {
    const present = docs.filter((d) => {
      const v = getFieldValue(d.fields, def.field);
      return v != null && v !== "";
    });
    if (present.length < 2) continue;
    fieldsChecked.push(def.field);
    const discreps = compareFieldAcrossDocs(
      def.field,
      def.severity,
      def.tolerance,
      docs,
    );
    // Count one comparison per pair (so matchedFields reflects per-pair).
    const pairCount = present.length - 1;
    totalComparisons += pairCount;
    matchedFields += pairCount - discreps.length;
    if (discreps.length > 0) {
      allDiscrepancies.push(...discreps);
    }
  }

  const matchStatus = allDiscrepancies.length === 0 ? "MATCHED" : "DISCREPANT";
  const confidence =
    totalComparisons > 0
      ? Math.round((matchedFields / totalComparisons) * 1000) / 1000
      : 1.0;

  // readyForPresentation = MATCHED OR all discrepancies are MINOR.
  const blockingDiscreps = allDiscrepancies.filter(
    (d) => d.severity === "CRITICAL" || d.severity === "MAJOR",
  );
  const readyForPresentation =
    matchStatus === "MATCHED" || blockingDiscreps.length === 0;

  const documentsJson = JSON.stringify(
    docs.map((d) => ({
      type: d.type,
      referenceId: d.referenceId,
    })),
  );

  const data: any = {
    ustn: input.ustn || null,
    tradeId: input.tradeId || null,
    lcNumber: input.lcNumber || null,
    documents: documentsJson,
    matchStatus,
    discrepancyCount: allDiscrepancies.length,
    discrepancies: JSON.stringify(allDiscrepancies),
    fieldsChecked: JSON.stringify(fieldsChecked),
    confidence,
    readyForPresentation,
    notes: input.notes || null,
  };
  if (input.reviewedBy) {
    data.reviewedBy = input.reviewedBy;
    data.reviewedAt = new Date();
  }

  try {
    const row = await db.documentaryMatch.create({ data });
    logger.info("[documentary-matching] match run", {
      id: row.id,
      ustn: input.ustn,
      lcNumber: input.lcNumber,
      matchStatus,
      discrepancyCount: allDiscrepancies.length,
      confidence,
      readyForPresentation,
    });
    return { ok: true, match: row };
  } catch (err) {
    logger.error("[documentary-matching] create DB error", {
      error: String(err),
      ustn: input.ustn,
      lcNumber: input.lcNumber,
    });
    return { ok: false, error: `DB error: ${String(err)}` };
  }
}

// ============ §4.3 getDocumentaryMatch ============

/** Fetch a DocumentaryMatch by its database id. Null-safe. */
export async function getDocumentaryMatch(
  id: string,
): Promise<DocumentaryMatchRecord | null> {
  if (!id) return null;
  try {
    const row = await db.documentaryMatch.findUnique({ where: { id } });
    return (row as DocumentaryMatchRecord) || null;
  } catch (err) {
    logger.error("[documentary-matching] getDocumentaryMatch failed", {
      error: String(err),
      id,
    });
    return null;
  }
}

// ============ §4.4 getMatchByUstn ============

/** Fetch the most recent DocumentaryMatch for a USTN. Null-safe. */
export async function getMatchByUstn(
  ustn: string,
): Promise<DocumentaryMatchRecord | null> {
  if (!ustn) return null;
  try {
    const rows = await db.documentaryMatch.findMany({
      where: { ustn },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    if (!rows || rows.length === 0) return null;
    return rows[0] as DocumentaryMatchRecord;
  } catch (err) {
    logger.error("[documentary-matching] getMatchByUstn failed", {
      error: String(err),
      ustn,
    });
    return null;
  }
}

// ============ §4.5 listDocumentaryMatches ============

/** List DocumentaryMatches with optional filters. Ordered by createdAt desc. */
export async function listDocumentaryMatches(
  filters?: {
    ustn?: string;
    lcNumber?: string;
    matchStatus?: string;
    readyForPresentation?: boolean;
  },
): Promise<DocumentaryMatchRecord[]> {
  const where: any = {};
  if (filters?.ustn) where.ustn = filters.ustn;
  if (filters?.lcNumber) where.lcNumber = filters.lcNumber;
  if (filters?.matchStatus) where.matchStatus = filters.matchStatus;
  if (filters?.readyForPresentation != null) {
    where.readyForPresentation = filters.readyForPresentation;
  }

  try {
    const rows = await db.documentaryMatch.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    return (rows as DocumentaryMatchRecord[]) || [];
  } catch (err) {
    logger.error("[documentary-matching] listDocumentaryMatches failed", {
      error: String(err),
      filters,
    });
    return [];
  }
}

// ============ §4.6 reviewMatch ============

/**
 * Mark a match as reviewed by a user. Sets `reviewedBy` + `reviewedAt` and
 * appends the reviewer's notes (if any) to the existing notes field.
 */
export async function reviewMatch(
  id: string,
  reviewedBy: string,
  notes?: string,
): Promise<DocumentaryMatchRecord> {
  if (!id) {
    throw new Error("id is required");
  }
  if (!reviewedBy) {
    throw new Error("reviewedBy is required");
  }

  let row: any = null;
  try {
    row = await db.documentaryMatch.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[documentary-matching] reviewMatch lookup failed", {
      error: String(err),
      id,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`DocumentaryMatch not found: ${id}`);
  }

  const existingNotes = row.notes || "";
  const stampedNote = notes
    ? `[${new Date().toISOString()} review by ${reviewedBy}] ${notes}`
    : `[${new Date().toISOString()} reviewed by ${reviewedBy}]`;
  const newNotes = existingNotes
    ? `${existingNotes}\n${stampedNote}`
    : stampedNote;

  try {
    const updated = await db.documentaryMatch.update({
      where: { id },
      data: {
        reviewedBy,
        reviewedAt: new Date(),
        notes: newNotes,
      },
    });
    logger.info("[documentary-matching] match reviewed", { id, reviewedBy });
    return updated as DocumentaryMatchRecord;
  } catch (err) {
    logger.error("[documentary-matching] reviewMatch DB error", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §4.7 waiveDiscrepancy ============

/**
 * Waive a discrepancy (the reviewer accepts the mismatch). The discrepancy
 * at the given index is marked `status: WAIVED` with `waivedBy`. If all
 * discrepancies are then WAIVED, `matchStatus` becomes `WAIVED`. If at least
 * one OPEN discrepancy remains, `matchStatus` stays `DISCREPANT`.
 */
export async function waiveDiscrepancy(
  matchId: string,
  discrepancyIndex: number,
  waivedBy: string,
): Promise<DocumentaryMatchRecord> {
  if (!matchId) {
    throw new Error("matchId is required");
  }
  if (discrepancyIndex == null || isNaN(Number(discrepancyIndex))) {
    throw new Error("discrepancyIndex is required and must be a number");
  }
  if (!waivedBy) {
    throw new Error("waivedBy is required");
  }

  let row: any = null;
  try {
    row = await db.documentaryMatch.findUnique({ where: { id: matchId } });
  } catch (err) {
    logger.error("[documentary-matching] waiveDiscrepancy lookup failed", {
      error: String(err),
      matchId,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`DocumentaryMatch not found: ${matchId}`);
  }

  const discs = parseJsonArray(row.discrepancies);
  if (discrepancyIndex < 0 || discrepancyIndex >= discs.length) {
    throw new Error(
      `discrepancyIndex ${discrepancyIndex} out of range (0..${discs.length - 1})`,
    );
  }

  const nowIso = new Date().toISOString();
  discs[discrepancyIndex] = {
    ...discs[discrepancyIndex],
    status: "WAIVED",
    waivedBy,
    waivedAt: nowIso,
  };

  const openCount = discs.filter(
    (d) => !d?.status || d.status === "OPEN",
  ).length;
  const matchStatus = openCount === 0 ? "WAIVED" : "DISCREPANT";
  // Re-evaluate readiness — a waived CRITICAL/MAJOR is no longer blocking.
  const blockingOpen = discs.filter(
    (d) =>
      (!d?.status || d.status === "OPEN") &&
      (d.severity === "CRITICAL" || d.severity === "MAJOR"),
  ).length;
  const readyForPresentation = blockingOpen === 0;

  try {
    const updated = await db.documentaryMatch.update({
      where: { id: matchId },
      data: {
        discrepancies: JSON.stringify(discs),
        matchStatus,
        readyForPresentation,
      },
    });
    logger.info("[documentary-matching] discrepancy waived", {
      id: matchId,
      index: discrepancyIndex,
      waivedBy,
      remainingOpen: openCount,
    });
    return updated as DocumentaryMatchRecord;
  } catch (err) {
    logger.error("[documentary-matching] waiveDiscrepancy DB error", {
      error: String(err),
      id: matchId,
    });
    throw err;
  }
}

// ============ §4.8 isReadyForPresentation ============

/**
 * Check presentation readiness for a match.
 *   ready                — true if matchStatus = MATCHED OR no blocking
 *                          (CRITICAL / MAJOR) OPEN discrepancies remain
 *   blockingDiscrepancies — number of OPEN CRITICAL/MAJOR discrepancies
 *   minorDiscrepancies    — number of OPEN MINOR discrepancies
 */
export async function isReadyForPresentation(
  matchId: string,
): Promise<PresentationReadiness> {
  const empty: PresentationReadiness = {
    ready: false,
    blockingDiscrepancies: 0,
    minorDiscrepancies: 0,
  };
  if (!matchId) return empty;

  let row: any = null;
  try {
    row = await db.documentaryMatch.findUnique({ where: { id: matchId } });
  } catch (err) {
    logger.error("[documentary-matching] isReadyForPresentation lookup failed", {
      error: String(err),
      matchId,
    });
    return empty;
  }
  if (!row) return empty;

  const discs = parseJsonArray(row.discrepancies);
  let blocking = 0;
  let minor = 0;
  for (const d of discs) {
    if (d?.status && d.status !== "OPEN") continue; // WAIVED / RESOLVED don't block
    if (d.severity === "MINOR") minor++;
    else blocking++; // CRITICAL or MAJOR
  }
  const ready = row.matchStatus === "MATCHED" || blocking === 0;
  return {
    ready,
    blockingDiscrepancies: blocking,
    minorDiscrepancies: minor,
  };
}

// ============ Module exports ============
// All exports are named — no default export (matches existing SGTX lib
// convention, avoids `import/no-anonymous-default-export` warning).

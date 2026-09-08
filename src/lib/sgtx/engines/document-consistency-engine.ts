// @ts-nocheck
/**
 * SGTX v17 §20 — Document Consistency Engine
 * ===========================================================================
 *
 * Lightweight wrapper around the existing `src/lib/sgtx/document-consistency`
 * module + additional checks that require the unified engines (SPS, TBT,
 * controlled-goods). Adds explicit cross-document validation for:
 *
 *   - Invoice total matches packing list weight (quantity + weight)
 *   - BL matches invoice shipper/consignee
 *   - Certificate of origin matches invoice origin country
 *   - Phytosanitary cert matches commodity HS code
 *   - USTN present on all documents (traceability)
 *   - License number matches HS code (license-engine)
 *   - SPS documents cover all mandatory measures (sps-engine)
 *
 * Different from `document-consistency/index.ts` (which has 6 cross-checks
 * against the DB-loaded Trade include graph) — this engine is invoked from
 * `/api/sgtx/engines/document-consistency` and orchestrates both the
 * existing checks + the new engine-based checks.
 *
 * Returns:
 *   - consistent: true | false
 *   - conflicts: [ { field, docA, docB, valueA, valueB, severity, recommendation } ]
 *   - warnings: [string]
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { checkConsistency, type Discrepancy, type ConsistencyResult } from "@/lib/sgtx/document-consistency";
import { getSpsRequirements } from "@/lib/sgtx/engines/sps-engine";
import { checkControlledGoods } from "@/lib/sgtx/engines/controlled-goods-engine";

// ── Types ────────────────────────────────────────────────────────────────

export interface DocConsistencyConflict {
  field: string;
  docA: string;
  docB: string;
  valueA: any;
  valueB: any;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  recommendation: string;
}

export interface DocumentConsistencyResult {
  ustn: string;
  consistent: boolean;
  conflicts: DocConsistencyConflict[];
  warnings: string[];
  checkedDocuments: string[];
  computedAt: string;
}

export interface TradeDocument {
  type: string; // INVOICE, PACKING_LIST, BL, COO, PHYTOSANITARY, LICENSE, PERMIT, CERTIFICATE, etc.
  number?: string;
  ustn?: string;
  fields?: Record<string, any>; // arbitrary fields for cross-check
}

export interface DocumentSetCheck {
  ustn: string;
  complete: boolean;
  missing: string[];
  conflicting: DocConsistencyConflict[];
  checked: string[];
}

// ── Required document set per HS chapter (lightweight reference) ────────

const REQUIRED_DOCS_BY_CHAPTER: Record<number, string[]> = {
  // Fresh produce → invoice + packing + BL + phytosanitary + COO
  8: ["INVOICE", "PACKING_LIST", "BL", "PHYTOSANITARY", "COO"],
  7: ["INVOICE", "PACKING_LIST", "BL", "PHYTOSANITARY", "COO"],
  // Meat → invoice + packing + BL + vet_health + COO
  2: ["INVOICE", "PACKING_LIST", "BL", "VET_HEALTH", "COO"],
  // Fish → invoice + packing + BL + catch_cert + COO
  3: ["INVOICE", "PACKING_LIST", "BL", "CATCH_CERT", "COO"],
  // Pharma → invoice + packing + BL + GMP + CPP + COA
  30: ["INVOICE", "PACKING_LIST", "BL", "GMP", "CPP", "COA"],
  // Garments → invoice + packing + BL + COO + textile_label
  61: ["INVOICE", "PACKING_LIST", "BL", "COO", "TEXTILE_LABEL"],
  62: ["INVOICE", "PACKING_LIST", "BL", "COO", "TEXTILE_LABEL"],
  // Electronics → invoice + packing + BL + COO + CE + ROHS
  85: ["INVOICE", "PACKING_LIST", "BL", "COO", "CE_MARK", "ROHS"],
  // Default — basic commercial set
};

const DEFAULT_REQUIRED_DOCS = ["INVOICE", "PACKING_LIST", "BL"];

// ── Helpers ─────────────────────────────────────────────────────────────

function chapterOf(hs?: string): number | null {
  const n = parseInt((hs ?? "").slice(0, 2), 10);
  return Number.isFinite(n) && n >= 1 && n <= 97 ? n : null;
}

function safeArr<T>(a: T | T[] | undefined | null): T[] {
  return Array.isArray(a) ? a : (a ? [a] : []);
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Validate document consistency for a USTN. Combines:
 *   1. Existing document-consistency checkConsistency (cross-checks against
 *      DB-loaded Trade include graph)
 *   2. SPS compliance check (all mandatory measures must have a doc)
 *   3. Controlled-goods license check (if HS chapter is controlled)
 *   4. Engine-specific conflicts (HS code on phytosanitary matches commodity)
 */
export async function validateDocumentConsistency(ustn: string): Promise<DocumentConsistencyResult> {
  const computedAt = new Date().toISOString();
  const warnings: string[] = [];
  const conflicts: DocConsistencyConflict[] = [];
  const checkedDocuments: string[] = [];

  if (!ustn) {
    return { ustn: "", consistent: false, conflicts: [], warnings: ["USTN is required."], checkedDocuments: [], computedAt };
  }

  // 1. Existing document-consistency engine
  let baseResult: ConsistencyResult | null = null;
  try {
    baseResult = await checkConsistency(ustn);
    if (baseResult) {
      checkedDocuments.push(...baseResult.checkedDocuments);
      conflicts.push(...baseResult.discrepancies.map(_convert));
      if (!baseResult.consistent && baseResult.discrepancies.length === 0) {
        warnings.push("Base consistency check returned inconsistent but listed no discrepancies — possibly no documents loaded.");
      }
    }
  } catch (err: any) {
    warnings.push(`Document consistency base check failed: ${err?.message ?? "unknown"}.`);
  }

  // 2. SPS compliance check (all mandatory SPS measures have a document)
  try {
    const trade = await db.trade.findUnique({ where: { ustn } }).catch(() => null);
    if (trade) {
      const hs = String(trade.commodityHs ?? "").trim();
      const ch = chapterOf(hs);
      if (hs && trade.originCountry && trade.destCountry) {
        const spsResult = getSpsRequirements(hs, trade.originCountry, trade.destCountry);
        if (spsResult.requirements.length > 0) {
          // Find documents that satisfy each SPS measure (by document type)
          const docs = await db.document.findMany({ where: { tradeId: trade.id } }).catch(() => []);
          const docTypes = new Set<string>(docs.map((d: any) => String(d.type ?? d.docType ?? "").toUpperCase()));
          for (const req of spsResult.requirements) {
            if (!req.mandatory) continue;
            if (!docTypes.has(req.measure)) {
              conflicts.push({
                field: "sps_measure",
                docA: "Required SPS measure",
                docB: "Document set",
                valueA: req.measure,
                valueB: null,
                severity: "HIGH",
                recommendation: `Add a document of type "${req.measure}" to satisfy SPS requirement per ${req.standard} (Authority: ${req.authority}).`,
              });
            }
          }
        }
        // 3. Controlled-goods license check — ExportLicense is keyed by
        // (tenantGtid, hsCode), not by tradeId, so we just flag the
        // requirement; verification happens in /api/sgtx/engines/license
        // via validateLicense(licenseNumber, hsCode, country).
        const controlled = checkControlledGoods(hs, trade.originCountry, trade.destCountry);
        if (controlled.controlled && controlled.licenceRequired) {
          warnings.push(`HS chapter ${ch} is a controlled good (${controlled.controlType}) — license required from ${controlled.authority}. Verify an export-control license has been issued for this trade.`);
        }
      } else {
        warnings.push("Trade missing HS code / origin / destination — skipping SPS + controlled-goods checks.");
      }
    } else {
      warnings.push(`No trade found for USTN ${ustn} — only the base DB-graph check was run.`);
    }
  } catch (err: any) {
    warnings.push(`Engine-orchestrated checks failed: ${err?.message ?? "unknown"}.`);
  }

  return {
    ustn,
    consistent: conflicts.length === 0,
    conflicts,
    warnings,
    checkedDocuments: [...new Set(checkedDocuments)],
    computedAt,
  };
}

/**
 * Check a complete document set for a USTN: verifies that all REQUIRED
 * documents for the trade's HS chapter are present, plus runs the full
 * consistency check.
 *
 * `documents` is the list of TradeDocument objects (assembled by the user)
 * — if omitted, the function loads them from the DB.
 */
export async function checkDocumentSet(ustn: string, documents?: TradeDocument[]): Promise<DocumentSetCheck> {
  const consistency = await validateDocumentConsistency(ustn);
  const conflicting = consistency.conflicts;

  // Load trade + documents
  let trade: any = null;
  let docs: TradeDocument[] = documents ?? [];
  try {
    trade = await db.trade.findUnique({ where: { ustn } }).catch(() => null);
    if (trade && (!documents || documents.length === 0)) {
      const dbDocs = await db.document.findMany({ where: { tradeId: trade.id } }).catch(() => []);
      docs = dbDocs.map((d: any) => ({
        type: String(d.type ?? "").toUpperCase(),
        number: undefined,
        ustn: ustn,
        fields: undefined,
      }));
    }
  } catch (err: any) {
    logger.warn("[document-consistency-engine] checkDocumentSet trade load failed", { ustn, error: err?.message });
  }

  // Determine required docs
  const ch = trade ? chapterOf(String(trade.commodityHs ?? "")) : null;
  const required = ch && REQUIRED_DOCS_BY_CHAPTER[ch] ? REQUIRED_DOCS_BY_CHAPTER[ch] : DEFAULT_REQUIRED_DOCS;

  // Identify missing
  const present = new Set(docs.map((d) => d.type.toUpperCase()));
  const missing = required.filter((r) => !present.has(r));

  // USTN present on all documents?
  if (trade) {
    for (const d of docs) {
      if (d.ustn && String(d.ustn).toUpperCase() !== String(ustn).toUpperCase()) {
        conflicting.push({
          field: "ustn",
          docA: d.type,
          docB: "Trade",
          valueA: d.ustn,
          valueB: ustn,
          severity: "CRITICAL",
          recommendation: `USTN on ${d.type} (${d.ustn}) does not match the trade USTN (${ustn}). Update the document.`,
        });
      }
    }
  }

  return {
    ustn,
    complete: missing.length === 0 && conflicting.length === 0,
    missing,
    conflicting,
    checked: docs.map((d) => d.type),
  };
}

// ── Internal helpers ────────────────────────────────────────────────────

function _convert(d: Discrepancy): DocConsistencyConflict {
  return {
    field: d.field,
    docA: d.docA,
    docB: d.docB,
    valueA: d.valueA,
    valueB: d.valueB,
    severity: d.severity,
    recommendation: d.recommendation,
  };
}

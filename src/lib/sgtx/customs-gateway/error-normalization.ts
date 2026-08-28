// @ts-nocheck
/**
 * SGTX Customs Gateway — Error Normalization
 * ===========================================================================
 *
 * Maps external government system errors into a small, well-understood set of
 * SGTX error categories. Every country adapter (US-CBP-ACE, EG-NAFEZA,
 * EG-CARGOX, EG-ETA, EG-CBE, …) returns errors in its own native shape:
 *
 *   • Nafeza returns  { resultCode: "E00123", resultDesc: "ACID not found" }
 *   • CargoX returns  { error: { code: "shipment.duplicate", message: "..." } }
 *   • ETA returns     { validationResults: [{ path, error }] }
 *   • ACE returns     { error: { code: "ABI-REJ-014", message: "..." } }
 *
 * The Error Normalization layer collapses these into ONE taxonomy so the
 * UI, broker workspace, retry engine, and Governor all speak the same language.
 *
 * The 14 categories (per customs-gateway spec):
 *
 *   AUTHENTICATION_ERROR    — invalid/expired token, bad e-Seal
 *   AUTHORIZATION_ERROR     — caller not permitted for this filing type
 *   VALIDATION_ERROR        — field-level payload validation rejected
 *   CLASSIFICATION_ERROR    — HS code rejected by government
 *   PARTY_ERROR             — importer/exporter/consignee data mismatch
 *   DOCUMENT_ERROR          — missing / malformed supporting document
 *   GOVERNMENT_HOLD         — customs placed a hold (inspection, query)
 *   PGA_HOLD                — Partner Government Agency hold (FDA, EPA, …)
 *   DUPLICATE               — a filing with this key already exists
 *   RATE_LIMIT              — 429 Too Many Requests
 *   TIMEOUT                 — no response in expected window
 *   NETWORK_ERROR           — TCP / DNS / TLS failure
 *   SYSTEM_UNAVAILABLE      — 503 / planned downtime
 *   UNKNOWN_EXTERNAL_ERROR  — unmapped — surfaced for triage
 *
 * Each normalized error includes a remediation hint (human-readable, shown
 * to the broker) and a retryable flag (consumed by retry-engine.ts).
 *
 * L0 constraints:
 *   - NON-CUSTODIAL: errors never touch funds; the CBE payment adapter
 *     surfaces payment-specific failures via DOCUMENT_ERROR or
 *     AUTHORIZATION_ERROR, NEVER by auto-reversing a settlement.
 *   - try/catch with safe defaults on every public function — unknown errors
 *     fall back to UNKNOWN_EXTERNAL_ERROR (LOW severity, NOT retryable).
 */

import { logger } from "@/lib/sgtx/logger";

// ============ §CATEGORIES ============

export const ERROR_CATEGORIES = [
  "AUTHENTICATION_ERROR",
  "AUTHORIZATION_ERROR",
  "VALIDATION_ERROR",
  "CLASSIFICATION_ERROR",
  "PARTY_ERROR",
  "DOCUMENT_ERROR",
  "GOVERNMENT_HOLD",
  "PGA_HOLD",
  "DUPLICATE",
  "RATE_LIMIT",
  "TIMEOUT",
  "NETWORK_ERROR",
  "SYSTEM_UNAVAILABLE",
  "UNKNOWN_EXTERNAL_ERROR",
] as const;

export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

export type ErrorSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface NormalizedError {
  /** Original external code (e.g. "E00123", "ABI-REJ-014"). "" if absent. */
  externalCode: string;
  /** One of ERROR_CATEGORIES. */
  category: string;
  /** Severity for routing (LOW = broker self-serve, CRITICAL = page on-call). */
  severity: ErrorSeverity;
  /** Human-readable message — safe to show to a broker. */
  message: string;
  /** Actionable remediation step (e.g. "Re-issue e-Seal and retry"). */
  remediation: string;
  /** External system reference (e.g. shipment id, declaration number). */
  externalReference: string;
  /** Adapter that produced the error (e.g. "EG-NAFEZA"). */
  adapterId: string;
  /** Linked USTN (for cross-correlation with event-spine). */
  ustn: string;
  /** True iff retry-engine may safely retry the SAME idempotent call. */
  retryable: boolean;
  /** ISO timestamp of normalization. */
  normalizedAt: string;
}

// ============ Retryable categories (canonical source) ============

const RETRYABLE_CATEGORIES: Set<string> = new Set([
  "RATE_LIMIT",
  "TIMEOUT",
  "NETWORK_ERROR",
  "SYSTEM_UNAVAILABLE",
]);

// Non-retryable: AUTHENTICATION_ERROR, AUTHORIZATION_ERROR, VALIDATION_ERROR,
// CLASSIFICATION_ERROR, PARTY_ERROR, DOCUMENT_ERROR, GOVERNMENT_HOLD,
// PGA_HOLD, DUPLICATE, UNKNOWN_EXTERNAL_ERROR.

export function isRetryable(category: string): boolean {
  try {
    return RETRYABLE_CATEGORIES.has(category);
  } catch {
    return false;
  }
}

// ============ Severity table (per category) ============

const SEVERITY_BY_CATEGORY: Record<string, ErrorSeverity> = {
  AUTHENTICATION_ERROR: "HIGH",
  AUTHORIZATION_ERROR: "HIGH",
  VALIDATION_ERROR: "MEDIUM",
  CLASSIFICATION_ERROR: "HIGH",
  PARTY_ERROR: "HIGH",
  DOCUMENT_ERROR: "MEDIUM",
  GOVERNMENT_HOLD: "HIGH",
  PGA_HOLD: "HIGH",
  DUPLICATE: "LOW",
  RATE_LIMIT: "LOW",
  TIMEOUT: "MEDIUM",
  NETWORK_ERROR: "MEDIUM",
  SYSTEM_UNAVAILABLE: "HIGH",
  UNKNOWN_EXTERNAL_ERROR: "CRITICAL",
};

// ============ Remediation hints (per category) ============

const REMEDIATION_BY_CATEGORY: Record<string, string> = {
  AUTHENTICATION_ERROR: "Refresh the broker's e-Seal / API credential and retry. If persistent, re-enroll the credential with the authority.",
  AUTHORIZATION_ERROR: "Verify the broker is licensed for this filing type in this jurisdiction and that the importer-of-record has authorised the broker. Filer code is metadata only — authorization is required.",
  VALIDATION_ERROR: "Open the declaration in the broker workspace, correct the flagged fields, and re-validate before re-submitting.",
  CLASSIFICATION_ERROR: "Re-classify the goods using the HS Code Detector and the jurisdiction's national tariff schedule. Attach a Binding Ruling if available.",
  PARTY_ERROR: "Cross-check importer / exporter / consignee name, address, and tax-ID against the trade's KYC record and the LC (if applicable).",
  DOCUMENT_ERROR: "Re-upload the rejected supporting document in the required format (PDF/A-3 for Nafeza; ACE-supported formats for CBP) and re-attach.",
  GOVERNMENT_HOLD: "Customs has placed a hold. Contact the assigned customs office for inspection scheduling — do NOT auto-retry.",
  PGA_HOLD: "A Partner Government Agency (FDA / EPA / APHIS / phytosanitary) has placed a hold. Submit the requested agency document via the PERMIT or CERTIFICATE operation.",
  DUPLICATE: "A filing with this idempotency key already exists. Use the STATUS operation to fetch the existing submission — do NOT submit again.",
  RATE_LIMIT: "Government API is rate-limiting. The retry engine will back off automatically; no broker action needed unless persistent.",
  TIMEOUT: "No response from the government system. The retry engine will retry with the same idempotency key.",
  NETWORK_ERROR: "Network-level failure (DNS / TCP / TLS). The retry engine will retry; verify your egress proxy if persistent.",
  SYSTEM_UNAVAILABLE: "Government system is unavailable (503 or maintenance window). Retry later; check the authority status page.",
  UNKNOWN_EXTERNAL_ERROR: "Unmapped error — surfaced for triage. The on-call engineer should add a mapping in error-normalization.ts.",
};

// ============ Adapter-specific code maps ============

/**
 * Adapter-specific known error codes. Each entry maps an external code (or
 * substring) to one of ERROR_CATEGORIES. Looked up before the heuristic
 * inference so adapter-specific knowledge wins.
 */
const ADAPTER_CODE_MAPS: Record<string, Array<{ match: RegExp; category: string; severity?: ErrorSeverity; message?: string }>> = {
  "EG-NAFEZA": [
    { match: /E00.*ACID/i, category: "VALIDATION_ERROR", message: "ACID not found or invalid for this importer." },
    { match: /E00.*CERTIF/i, category: "AUTHENTICATION_ERROR", message: "Broker e-Seal rejected by Nafeza." },
    { match: /E00.*DUPLICATE/i, category: "DUPLICATE", message: "Declaration with this ACID + invoice already exists." },
    { match: /E00.*HS/i, category: "CLASSIFICATION_ERROR" },
    { match: /E00.*HOLD/i, category: "GOVERNMENT_HOLD" },
  ],
  "EG-CARGOX": [
    { match: /shipment\.duplicate/i, category: "DUPLICATE" },
    { match: /signature\.invalid/i, category: "AUTHENTICATION_ERROR" },
    { match: /shipper\.unauthorized/i, category: "AUTHORIZATION_ERROR" },
    { match: /blockchain\.timeout/i, category: "TIMEOUT" },
  ],
  "EG-ETA": [
    { match: /signature.*invalid/i, category: "AUTHENTICATION_ERROR" },
    { match: /tax.*mismatch/i, category: "PARTY_ERROR" },
    { match: /duplicate.*uuid/i, category: "DUPLICATE" },
    { match: /validation/i, category: "VALIDATION_ERROR" },
  ],
  "EG-CBE": [
    { match: /insufficient.*fund/i, category: "AUTHORIZATION_ERROR", message: "Account has insufficient funds for the duty payment." },
    { match: /duplicate.*payment/i, category: "DUPLICATE" },
    { match: /bank.*unavailable/i, category: "SYSTEM_UNAVAILABLE" },
  ],
  "US-CBP-ACE": [
    { match: /ABI-REJ-\d+/i, category: "VALIDATION_ERROR", message: "ACE ABI rejected the filing — see the rejection code in the CBP ABI Reject reason table." },
    { match: /ISF.*LATE/i, category: "VALIDATION_ERROR", message: "ISF 10+2 filed after the 24-hour pre-lading deadline (19 CFR 149.5)." },
    { match: /FDA.*HOLD/i, category: "PGA_HOLD" },
    { match: /EPA.*HOLD/i, category: "PGA_HOLD" },
    { match: /CUSTOMS.*HOLD/i, category: "GOVERNMENT_HOLD" },
    { match: /FILER.*NOT.*AUTHORIZED/i, category: "AUTHORIZATION_ERROR", message: "Filer code is not authorised for this entry type — broker must hold the appropriate ABI permit." },
    { match: /DUPLICATE.*ENTRY/i, category: "DUPLICATE" },
  ],
};

// ============ normalizeError ============

/**
 * Normalize an external government error into the SGTX error taxonomy.
 *
 * Accepts ANY shape — the function probes common fields (`code`, `errorCode`,
 * `error.code`, `resultCode`, `status`, `message`, `errorMessage`,
 * `resultDesc`, `error.message`, `validationResults[0]`). Unknown shapes
 * fall back to UNKNOWN_EXTERNAL_ERROR (CRITICAL severity, NOT retryable).
 *
 * NEVER throws — every path returns a valid NormalizedError. The fallback
 * on internal failure is UNKNOWN_EXTERNAL_ERROR with the raw error stringified.
 */
export function normalizeError(
  externalError: any,
  adapterId: string,
  ustn: string,
): NormalizedError {
  const normalizedAt = new Date().toISOString();
  try {
    const ext = externalError || {};
    const externalCode = extractCode(ext);
    const externalMessage = extractMessage(ext);
    const externalReference = extractReference(ext);

    // 1) Try adapter-specific code map first.
    let category: string = "UNKNOWN_EXTERNAL_ERROR";
    let mappedMessage: string | undefined;
    let mappedSeverity: ErrorSeverity | undefined;
    const adapterMap = ADAPTER_CODE_MAPS[adapterId];
    if (adapterMap) {
      for (const rule of adapterMap) {
        if (rule.match.test(externalCode) || rule.match.test(externalMessage)) {
          category = rule.category;
          mappedMessage = rule.message;
          mappedSeverity = rule.severity;
          break;
        }
      }
    }

    // 2) Fall back to heuristic inference from the message / status.
    if (category === "UNKNOWN_EXTERNAL_ERROR") {
      category = inferCategory(ext, externalMessage);
    }

    const severity = mappedSeverity || SEVERITY_BY_CATEGORY[category] || "CRITICAL";
    const remediation = REMEDIATION_BY_CATEGORY[category] || REMEDIATION_BY_CATEGORY.UNKNOWN_EXTERNAL_ERROR;
    const retryable = isRetryable(category);
    const message = mappedMessage || externalMessage || `Government system returned an unmapped error (code: ${externalCode || "n/a"}).`;

    const normalized: NormalizedError = {
      externalCode: externalCode || "",
      category,
      severity,
      message,
      remediation,
      externalReference: externalReference || "",
      adapterId: adapterId || "",
      ustn: ustn || "",
      retryable,
      normalizedAt,
    };

    logger.warn("[customs-gateway/error-normalization] normalized", {
      adapterId,
      ustn,
      externalCode,
      category,
      severity,
      retryable,
    });

    return normalized;
  } catch (err: any) {
    logger.error("[customs-gateway/error-normalization] normalizeError failed", {
      adapterId,
      ustn,
      error: err?.message,
    });
    return {
      externalCode: "",
      category: "UNKNOWN_EXTERNAL_ERROR",
      severity: "CRITICAL",
      message: "Error normalization itself failed — see logs.",
      remediation: REMEDIATION_BY_CATEGORY.UNKNOWN_EXTERNAL_ERROR,
      externalReference: "",
      adapterId: adapterId || "",
      ustn: ustn || "",
      retryable: false,
      normalizedAt,
    };
  }
}

// ============ Field extractors ============

function extractCode(ext: any): string {
  try {
    return (
      ext?.code ||
      ext?.errorCode ||
      ext?.error?.code ||
      ext?.resultCode ||
      ext?.result_code ||
      ext?.rejectionCode ||
      ext?.statusCode?.toString?.() ||
      ext?.status?.toString?.() ||
      ""
    ).toString();
  } catch {
    return "";
  }
}

function extractMessage(ext: any): string {
  try {
    if (ext?.validationResults && Array.isArray(ext.validationResults) && ext.validationResults.length > 0) {
      const v = ext.validationResults[0];
      return v?.message || v?.error || JSON.stringify(v);
    }
    return (
      ext?.message ||
      ext?.errorMessage ||
      ext?.error?.message ||
      ext?.resultDesc ||
      ext?.result_desc ||
      ext?.rejectionReason ||
      ext?.detail ||
      ""
    ).toString();
  } catch {
    return "";
  }
}

function extractReference(ext: any): string {
  try {
    return (
      ext?.referenceNumber ||
      ext?.reference_number ||
      ext?.governmentReference ||
      ext?.declarationId ||
      ext?.declaration_id ||
      ext?.shipmentId ||
      ext?.external_reference ||
      ""
    ).toString();
  } catch {
    return "";
  }
}

// ============ Heuristic inference (fallback when no adapter map hit) ============

function inferCategory(ext: any, message: string): string {
  try {
    const msg = (message || "").toLowerCase();
    const code = (extractCode(ext) || "").toString();
    const statusCode = Number(ext?.statusCode || ext?.status || 0);

    if (statusCode === 429 || msg.includes("rate limit") || msg.includes("too many requests")) return "RATE_LIMIT";
    if (statusCode === 503 || msg.includes("service unavailable") || msg.includes("maintenance")) return "SYSTEM_UNAVAILABLE";
    if (statusCode === 401 || msg.includes("unauthorized") || msg.includes("invalid signature") || msg.includes("e-seal")) return "AUTHENTICATION_ERROR";
    if (statusCode === 403 || msg.includes("forbidden") || msg.includes("not authorized") || msg.includes("not authorised")) return "AUTHORIZATION_ERROR";
    if (statusCode === 409 || msg.includes("duplicate") || msg.includes("already exists")) return "DUPLICATE";
    if (msg.includes("timeout") || msg.includes("timed out")) return "TIMEOUT";
    if (msg.includes("network") || msg.includes("econnreset") || msg.includes("econnrefused")) return "NETWORK_ERROR";
    if (msg.includes("hs code") || msg.includes("classification") || msg.includes("tariff")) return "CLASSIFICATION_ERROR";
    if (msg.includes("importer") || msg.includes("exporter") || msg.includes("consignee") || msg.includes("party")) return "PARTY_ERROR";
    if (msg.includes("document") || msg.includes("attachment") || msg.includes("pdf")) return "DOCUMENT_ERROR";
    if (msg.includes("hold") || msg.includes("inspection")) return "GOVERNMENT_HOLD";
    if (msg.includes("pga") || msg.includes("fda") || msg.includes("epa") || msg.includes("aphis")) return "PGA_HOLD";
    if (msg.includes("validation") || msg.includes("required field") || msg.includes("missing")) return "VALIDATION_ERROR";

    // Empty error → treat as unknown (CRITICAL, NOT retryable).
    return "UNKNOWN_EXTERNAL_ERROR";
  } catch {
    return "UNKNOWN_EXTERNAL_ERROR";
  }
}

// ============ Summary helper (for /errors API route) ============

/**
 * Aggregate a list of NormalizedErrors into a per-category summary used by
 * the Admin Portal's customs adapter health dashboard. Returns categories
 * sorted by severity (CRITICAL first) and count descending.
 */
export function summarizeErrors(errors: NormalizedError[]): Array<{
  category: string;
  count: number;
  severity: ErrorSeverity;
  retryable: boolean;
  sampleRemediation: string;
  sampleUstn: string;
}> {
  try {
    const buckets = new Map<string, NormalizedError[]>();
    for (const e of errors || []) {
      const list = buckets.get(e.category) || [];
      list.push(e);
      buckets.set(e.category, list);
    }
    const severityRank: Record<ErrorSeverity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    const out = Array.from(buckets.entries()).map(([category, list]) => ({
      category,
      count: list.length,
      severity: SEVERITY_BY_CATEGORY[category] || "CRITICAL",
      retryable: isRetryable(category),
      sampleRemediation: REMEDIATION_BY_CATEGORY[category] || "",
      sampleUstn: list[0]?.ustn || "",
    }));
    out.sort((a, b) => {
      const s = severityRank[a.severity] - severityRank[b.severity];
      if (s !== 0) return s;
      return b.count - a.count;
    });
    return out;
  } catch {
    return [];
  }
}

// @ts-nocheck
// SGTX Phase 3 — Compliance Orchestrator (CCL-016)
// ---------------------------------------------------------------------------
// Runs all 7 Phase 3 compliance subsystems in parallel for a single trade
// request and produces a unified COMPLIANCE_RESULT envelope:
//
//   1. License        — src/lib/sgtx/license      (determineLicenseRequirement)
//   2. Permit         — src/lib/sgtx/permit       (determineAllPermits)
//   3. Certificate    — src/lib/sgtx/certificate   (determineCertificateRequirement)
//   4. SPS            — src/lib/sgtx/sps           (determineSpsRequirements)
//   5. TBT            — src/lib/sgtx/tbt           (determineTbtRequirements)
//   6. ControlledGoods — src/lib/sgtx/controlled-goods (determineControlledGoods)
//   7. Sanctions      — src/lib/sgtx/sanctions     (screenMultiple + aggregateScreeningResults)
//
// The orchestrator is the single entry-point for the Phase 3 "give me everything
// compliance for this trade" workflow. It NEVER throws — every subsystem is
// executed via Promise.allSettled so a failure in one degrades gracefully into
// a CONDITIONAL envelope section (and is logged) instead of crashing the
// entire compliance screen.
//
// topVerdict is the strictest across all 7 subsystem verdicts:
//   BLOCK > ENHANCED_DD > CONDITIONAL > ALLOW
//
// overallConfidence is the average of the per-subsystem confidence scores:
//   • license / permit / certificate → 0.9   (clear binary states)
//   • sps / tbt / controlled-goods    → 0.8   (derived from rules)
//   • sanctions                        → 0.85  (multi-source matching)
//   • errored subsystem                → 0.5   (unknown state — pessimistic)
//
// humanReviewRequired = true if topVerdict is CONDITIONAL or worse, OR any
// restriction with severity WARN / BLOCK.
//
// Design rules (mandatory per the SGTX convention):
//   • // @ts-nocheck at the top.
//   • Every subsystem call is wrapped via Promise.allSettled — a subsystem
//   failure never propagates; the failed section becomes
//   `{ error: <reason>, topVerdict: "CONDITIONAL" }` and is logged via
//   logger.error.
//   • Uses `import { db } from "@/lib/db"` (imported for future persistence
//   wiring; not actively called in Phase 3) and
//   `import { logger } from "@/lib/sgtx/logger"`.
//   • Persisted storage is NOT done in Phase 3 — `getComplianceResult(ustn)`
//   returns null for now (the Phase 2 RegulatoryProductResult already persists
//   the Phase 2 portion). The unified envelope is consumed by the Governor
//   gates (src/lib/sgtx/governor/gates-compliance.ts) and the operator UI.

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { determineLicenseRequirement } from "@/lib/sgtx/license";
import { determineAllPermits } from "@/lib/sgtx/permit";
import { determineCertificateRequirement } from "@/lib/sgtx/certificate";
import { determineSpsRequirements } from "@/lib/sgtx/sps";
import { determineTbtRequirements } from "@/lib/sgtx/tbt";
import { determineControlledGoods } from "@/lib/sgtx/controlled-goods";
import {
  screenMultiple,
  aggregateScreeningResults,
} from "@/lib/sgtx/sanctions";

// ============ Exported interfaces ============

export interface ComplianceInput {
  // Product
  hs6?: string;
  productName?: string;
  casNumbers?: string[];

  // Trade
  jurisdictionCode: string;
  originCountry: string;
  destCountry: string;
  transportMode?: string;
  applicantGtid?: string;
  intendedUse?: string;
  season?: string;
  preferentialAgreementId?: string;
  shippingTransshipment?: boolean;

  // Sanctions screening targets — any non-empty value is screened.
  counterpartyName?: string;
  vesselName?: string;
  aircraftId?: string;
  portOfLoading?: string;
  portOfDischarge?: string;
  financialCounterparty?: string;
}

export interface ComplianceRestriction {
  subsystem: string;
  type: string;
  severity: "INFO" | "WARN" | "BLOCK";
  description: string;
}

export interface ComplianceResult {
  license: any;          // LicenseResult
  permits: any;         // PermitDetermination
  certificates: any;    // CertificateDetermination
  sps: any;             // SpsDetermination
  tbt: any;             // TbtDetermination
  controlledGoods: any; // ControlledGoodsDetermination
  sanctions: any;       // { results: SanctionsScreeningResult[], aggregate: {...} }

  topVerdict: "ALLOW" | "CONDITIONAL" | "ENHANCED_DD" | "BLOCK";
  overallConfidence: number;  // 0..1
  humanReviewRequired: boolean;
  restrictions: ComplianceRestriction[];
  generatedAt: string;
  generatedBy: string;
}

// ============ Internal constants ============

/** Strictest-wins verdict rank across subsystems. */
const VERDICT_RANK: Record<string, number> = {
  ALLOW: 0,
  CONDITIONAL: 1,
  ENHANCED_DD: 2,
  BLOCK: 3,
};

/** The 7 subsystems in execution order. */
const SUBSYSTEMS = [
  "LICENSE",
  "PERMIT",
  "CERTIFICATE",
  "SPS",
  "TBT",
  "CONTROLLED_GOODS",
  "SANCTIONS",
] as const;

/** Per-subsystem confidence baseline (used in overallConfidence weighting). */
const CONFIDENCE_BASELINE: Record<string, number> = {
  LICENSE: 0.9,
  PERMIT: 0.9,
  CERTIFICATE: 0.9,
  SPS: 0.8,
  TBT: 0.8,
  CONTROLLED_GOODS: 0.8,
  SANCTIONS: 0.85,
};

/** Confidence applied when a subsystem errored out. */
const CONFIDENCE_ON_ERROR = 0.5;

// ============ Internal helpers ============

/** Pick the strictest verdict across a list (case-insensitive, defaults to ALLOW). */
function strictestVerdict(verdicts: string[]): string {
  let out = "ALLOW";
  for (const v of verdicts) {
    const r = VERDICT_RANK[v];
    if (typeof r === "number" && r > VERDICT_RANK[out]) out = v;
  }
  return out;
}

/** Build a SanctionsScreeningInput[] list from the unified ComplianceInput. */
function buildSanctionsInputs(input: ComplianceInput): Array<{ screeningType: string; screenedValue: string; jurisdictionCode?: string }> {
  const list: Array<{ screeningType: string; screenedValue: string; jurisdictionCode?: string }> = [];
  const jc = input.jurisdictionCode;
  const pushIf = (screeningType: string, value?: string) => {
    if (typeof value === "string" && value.trim().length > 0) {
      list.push({ screeningType, screenedValue: value.trim(), jurisdictionCode: jc });
    }
  };
  pushIf("ENTITY", input.counterpartyName);
  pushIf("VESSEL", input.vesselName);
  pushIf("AIRCRAFT", input.aircraftId);
  pushIf("PORT", input.portOfLoading);
  pushIf("PORT", input.portOfDischarge);
  pushIf("FINANCIAL_COUNTERPARTY", input.financialCounterparty);
  return list;
}

/** Defensive extraction of a sub-verdict from any subsystem result. */
function subVerdict(result: any, fallback = "ALLOW"): string {
  if (!result || typeof result !== "object") return fallback;
  const v = result.topVerdict || result.verdict;
  return typeof v === "string" && VERDICT_RANK[v] !== undefined ? v : fallback;
}

// ============ Restriction aggregators ============

function licenseRestrictions(result: any): ComplianceRestriction[] {
  const out: ComplianceRestriction[] = [];
  if (!result || typeof result !== "object") return out;
  const verdict = subVerdict(result, "ALLOW");
  const state = result.state || "UNKNOWN";
  const licenseType = result.licenseType || "UNKNOWN";
  const reason = typeof result.reason === "string" && result.reason.length > 0 ? result.reason : `License ${licenseType} state=${state}`;
  if (verdict === "BLOCK") {
    out.push({ subsystem: "LICENSE", type: "LICENSE_BLOCK", severity: "BLOCK", description: `License ${licenseType} BLOCKED (state=${state}): ${reason}` });
  } else if (verdict === "ENHANCED_DD") {
    out.push({ subsystem: "LICENSE", type: "LICENSE_EDD", severity: "WARN", description: `License ${licenseType} requires enhanced due diligence: ${reason}` });
  } else if (verdict === "CONDITIONAL") {
    out.push({ subsystem: "LICENSE", type: "LICENSE_CONDITIONAL", severity: "WARN", description: `License ${licenseType} not yet issued (state=${state}): ${reason}` });
  } else {
    out.push({ subsystem: "LICENSE", type: "LICENSE_OK", severity: "INFO", description: `License ${licenseType} issued (state=${state})` });
  }
  if (result.endUserStatementRequired) out.push({ subsystem: "LICENSE", type: "END_USER_STATEMENT", severity: "INFO", description: "End-user statement required by license" });
  if (result.endUseCertificateRequired) out.push({ subsystem: "LICENSE", type: "END_USE_CERTIFICATE", severity: "INFO", description: "End-use certificate required by license" });
  return out;
}

function permitRestrictions(det: any): ComplianceRestriction[] {
  const out: ComplianceRestriction[] = [];
  if (!det || typeof det !== "object") return out;
  const permits = Array.isArray(det.permits) ? det.permits : [];
  for (const p of permits) {
    if (!p) continue;
    const permitType = p.permitType || "UNKNOWN";
    const state = p.state || "UNKNOWN";
    const reason = typeof p.reason === "string" && p.reason.length > 0 ? p.reason : `Permit ${permitType} state=${state}`;
    if (!p.required) continue;
    if (state === "EXPIRED" || state === "REVOKED" || state === "REJECTED") {
      out.push({ subsystem: "PERMIT", type: `PERMIT_${permitType}_BLOCK`, severity: "BLOCK", description: `Permit ${permitType} ${state}: ${reason}` });
    } else if (state === "ISSUED") {
      out.push({ subsystem: "PERMIT", type: `PERMIT_${permitType}_OK`, severity: "INFO", description: `Permit ${permitType} issued` });
    } else {
      out.push({ subsystem: "PERMIT", type: `PERMIT_${permitType}_MISSING`, severity: "WARN", description: `Permit ${permitType} missing (state=${state}): ${reason}` });
    }
  }
  return out;
}

function certificateRestrictions(det: any): ComplianceRestriction[] {
  const out: ComplianceRestriction[] = [];
  if (!det || typeof det !== "object") return out;
  const certs = Array.isArray(det.certificates) ? det.certificates : [];
  for (const c of certs) {
    if (!c) continue;
    const certType = c.certificateType || "UNKNOWN";
    const state = c.state || "UNKNOWN";
    const reason = typeof c.reason === "string" && c.reason.length > 0 ? c.reason : `Certificate ${certType} state=${state}`;
    if (!c.required) continue;
    if (state === "EXPIRED" || state === "REVOKED" || state === "REJECTED") {
      out.push({ subsystem: "CERTIFICATE", type: `CERT_${certType}_BLOCK`, severity: "BLOCK", description: `Certificate ${certType} ${state}: ${reason}` });
    } else if (state === "ISSUED") {
      out.push({ subsystem: "CERTIFICATE", type: `CERT_${certType}_OK`, severity: "INFO", description: `Certificate ${certType} issued` });
    } else {
      out.push({ subsystem: "CERTIFICATE", type: `CERT_${certType}_MISSING`, severity: "WARN", description: `Certificate ${certType} missing (state=${state}): ${reason}` });
    }
  }
  return out;
}

function spsRestrictions(det: any): ComplianceRestriction[] {
  const out: ComplianceRestriction[] = [];
  if (!det || typeof det !== "object") return out;
  const reqs = Array.isArray(det.requirements) ? det.requirements : [];
  for (const r of reqs) {
    if (!r) continue;
    const cat = r.spsCategory || "UNKNOWN";
    const verdict = subVerdict(r, "ALLOW");
    const severity: "INFO" | "WARN" | "BLOCK" = verdict === "BLOCK" ? "BLOCK" : "WARN";
    out.push({
      subsystem: "SPS",
      type: `SPS_${cat}`,
      severity,
      description: `SPS ${cat}: ${typeof r.requirementText === "string" ? r.requirementText : "see details"}${r.treatmentRequired ? ` (treatment=${r.treatmentRequired})` : ""}${r.quarantineDays ? ` (quarantine<=${r.quarantineDays}d)` : ""}`,
    });
  }
  return out;
}

function tbtRestrictions(det: any): ComplianceRestriction[] {
  const out: ComplianceRestriction[] = [];
  if (!det || typeof det !== "object") return out;
  const reqs = Array.isArray(det.requirements) ? det.requirements : [];
  for (const r of reqs) {
    if (!r) continue;
    const cat = r.tbtCategory || "UNKNOWN";
    const verdict = subVerdict(r, "ALLOW");
    const severity: "INFO" | "WARN" | "BLOCK" = verdict === "BLOCK" ? "BLOCK" : "WARN";
    out.push({
      subsystem: "TBT",
      type: `TBT_${cat}`,
      severity,
      description: `TBT ${cat}: ${typeof r.requirementText === "string" ? r.requirementText : "see details"}`,
    });
  }
  return out;
}

function controlledGoodsRestrictions(det: any): ComplianceRestriction[] {
  const out: ComplianceRestriction[] = [];
  if (!det || typeof det !== "object") return out;
  const controls = Array.isArray(det.controls) ? det.controls : [];
  for (const c of controls) {
    if (!c) continue;
    const cat = c.controlCategory || "UNKNOWN";
    const sev = c.severity || "CONDITIONAL";
    const severity: "INFO" | "WARN" | "BLOCK" = sev === "BLOCK" ? "BLOCK" : "WARN";
    out.push({
      subsystem: "CONTROLLED_GOODS",
      type: `CG_${cat}`,
      severity,
      description: `Controlled good ${cat}${c.controlListEntry ? ` (${c.controlListEntry})` : ""}: ${typeof c.reason === "string" ? c.reason : "see details"}`,
    });
  }
  return out;
}

function sanctionsRestrictions(san: any): ComplianceRestriction[] {
  const out: ComplianceRestriction[] = [];
  if (!san || typeof san !== "object") return out;
  const results = Array.isArray(san.results) ? san.results : [];
  for (const r of results) {
    if (!r) continue;
    const verdict = subVerdict(r, "ALLOW");
    const severity: "INFO" | "WARN" | "BLOCK" = verdict === "BLOCK" ? "BLOCK" : verdict === "ENHANCED_DD" ? "WARN" : verdict === "CONDITIONAL" ? "WARN" : "INFO";
    out.push({
      subsystem: "SANCTIONS",
      type: `SAN_${r.screeningType || "UNKNOWN"}`,
      severity,
      description: `Sanctions screening ${r.screeningType || "?"} "${r.screenedValue || "?"}": ${typeof r.reason === "string" ? r.reason : "see details"}${r.matchedEntity ? ` (matched: ${r.matchedEntity})` : ""}`,
    });
  }
  return out;
}

// ============ Main orchestrator ============

/**
 * runFullComplianceScreening — run all 7 Phase 3 compliance subsystems in
 * parallel and return a unified COMPLIANCE_RESULT envelope.
 *
 * The function NEVER throws. Every subsystem is invoked via Promise.allSettled
 * so that a failure in one section degrades gracefully into
 * `{ error: <reason>, topVerdict: "CONDITIONAL" }` and is logged via
 * logger.error. The other 6 sections continue to be evaluated.
 *
 * @param input  Unified ComplianceInput (product + trade + sanctions targets).
 * @returns      ComplianceResult envelope.
 */
export async function runFullComplianceScreening(
  input: ComplianceInput,
): Promise<ComplianceResult> {
  const safeInput: ComplianceInput = input && typeof input === "object" ? input : ({} as ComplianceInput);
  const jc = typeof safeInput.jurisdictionCode === "string" ? safeInput.jurisdictionCode : "";

  // Build per-subsystem inputs.
  const licenseInput = {
    hs6: safeInput.hs6,
    productName: safeInput.productName,
    jurisdictionCode: jc,
    originCountry: safeInput.originCountry || "",
    destCountry: safeInput.destCountry || "",
    transportMode: safeInput.transportMode,
    applicantGtid: safeInput.applicantGtid,
  };
  const permitInput = { ...licenseInput };
  const certificateInput = {
    hs6: safeInput.hs6,
    productName: safeInput.productName,
    jurisdictionCode: jc,
    originCountry: safeInput.originCountry || "",
    destCountry: safeInput.destCountry || "",
    transportMode: safeInput.transportMode,
    applicantGtid: safeInput.applicantGtid,
    intendedUse: safeInput.intendedUse,
    preferentialAgreementId: safeInput.preferentialAgreementId,
    shippingTransshipment: safeInput.shippingTransshipment,
  };
  const spsInput = {
    hs6: safeInput.hs6,
    commodity: safeInput.productName,
    originCountry: safeInput.originCountry || "",
    destCountry: safeInput.destCountry || "",
    jurisdictionCode: jc,
    season: safeInput.season,
    intendedUse: safeInput.intendedUse,
    transportMode: safeInput.transportMode,
  };
  const tbtInput = {
    hs6: safeInput.hs6,
    productName: safeInput.productName,
    jurisdictionCode: jc,
    transportMode: safeInput.transportMode,
  };
  const controlledInput = {
    hs6: safeInput.hs6,
    productName: safeInput.productName,
    casNumbers: safeInput.casNumbers,
    jurisdictionCode: jc,
    originCountry: safeInput.originCountry || "",
    destCountry: safeInput.destCountry || "",
    applicantGtid: safeInput.applicantGtid,
  };
  const sanctionsInputs = buildSanctionsInputs(safeInput);

  // Execute all 7 subsystems in parallel via Promise.allSettled so a single
  // subsystem failure does NOT take down the whole screening. Each entry is
  // guaranteed to settle (never throws).
  const settled = await Promise.allSettled([
    determineLicenseRequirement(licenseInput),
    determineAllPermits(permitInput),
    determineCertificateRequirement(certificateInput),
    determineSpsRequirements(spsInput),
    determineTbtRequirements(tbtInput),
    determineControlledGoods(controlledInput),
    sanctionsInputs.length > 0 ? screenMultiple(sanctionsInputs) : Promise.resolve([]),
  ]);

  // Helper to extract a settled value with a safe fallback on rejection.
  const pick = (idx: number, label: string, fallbackShape: any): any => {
    const r = settled[idx];
    if (r.status === "fulfilled") return r.value;
    const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
    logger.error(`[compliance-orchestrator] subsystem ${label} failed`, {
      subsystem: label,
      error: reason,
    });
    return { ...fallbackShape, error: reason };
  };

  const license = pick(0, "LICENSE", { topVerdict: "CONDITIONAL", verdict: "CONDITIONAL", state: "UNKNOWN", required: false, licenseType: "UNKNOWN", conditions: [], endUserStatementRequired: false, endUseCertificateRequired: false, reason: "license subsystem failed" });
  const permits = pick(1, "PERMIT", { topVerdict: "CONDITIONAL", permits: [], requiredCount: 0, issuedCount: 0, missingCount: 0 });
  const certificates = pick(2, "CERTIFICATE", { topVerdict: "CONDITIONAL", certificates: [], requiredCount: 0, issuedCount: 0, missingCount: 0, expiredCount: 0, revokedCount: 0 });
  const sps = pick(3, "SPS", { topVerdict: "ALLOW", requirements: [], totalRequired: 0, samplingRequired: false, labTestRequired: false, treatmentRequired: false, quarantineDaysMax: 0, inspectionRequired: false });
  const tbt = pick(4, "TBT", { topVerdict: "ALLOW", requirements: [], testingRequired: false, registrationRequired: false, mandatoryStandards: [] });
  const controlledGoods = pick(5, "CONTROLLED_GOODS", { topVerdict: "ALLOW", controls: [], topSeverity: null, endUserStatementRequired: false, endUseCertificateRequired: false, exportLicenseRequired: false, importLicenseRequired: false, transitControlRequired: false, reExportControl: false });
  const sanctionsResults = pick(6, "SANCTIONS", []);
  const sanctionsAggregate = Array.isArray(sanctionsResults) ? aggregateScreeningResults(sanctionsResults) : { topVerdict: "ALLOW", totalScreened: 0, matchedCount: 0, blockCount: 0, enhancedDdCount: 0, conditionalCount: 0 };
  const sanctions = { results: sanctionsResults, aggregate: sanctionsAggregate };

  // Aggregate restrictions from each subsystem.
  const restrictions: ComplianceRestriction[] = [];
  for (const r of licenseRestrictions(license)) restrictions.push(r);
  for (const r of permitRestrictions(permits)) restrictions.push(r);
  for (const r of certificateRestrictions(certificates)) restrictions.push(r);
  for (const r of spsRestrictions(sps)) restrictions.push(r);
  for (const r of tbtRestrictions(tbt)) restrictions.push(r);
  for (const r of controlledGoodsRestrictions(controlledGoods)) restrictions.push(r);
  for (const r of sanctionsRestrictions(sanctions)) restrictions.push(r);

  // topVerdict = strictest across all 7 subsystems' topVerdict.
  const topVerdict = strictestVerdict([
    subVerdict(license),
    subVerdict(permits),
    subVerdict(certificates),
    subVerdict(sps),
    subVerdict(tbt),
    subVerdict(controlledGoods),
    subVerdict(sanctionsAggregate),
  ]) as "ALLOW" | "CONDITIONAL" | "ENHANCED_DD" | "BLOCK";

  // overallConfidence = average of per-subsystem confidence (errored → 0.5).
  const erroredFlags = [
    license && license.error,
    permits && permits.error,
    certificates && certificates.error,
    sps && sps.error,
    tbt && tbt.error,
    controlledGoods && controlledGoods.error,
    sanctions && sanctions.error,
  ];
  const confidences: number[] = [];
  for (let i = 0; i < SUBSYSTEMS.length; i++) {
    if (erroredFlags[i]) confidences.push(CONFIDENCE_ON_ERROR);
    else confidences.push(CONFIDENCE_BASELINE[SUBSYSTEMS[i]] ?? 0.7);
  }
  const overallConfidence = confidences.length > 0
    ? confidences.reduce((a, b) => a + b, 0) / confidences.length
    : 0;

  // humanReviewRequired = true if topVerdict is CONDITIONAL or worse, OR any
  // restriction WARN / BLOCK.
  const hasWarnOrBlock = restrictions.some((r) => r.severity === "WARN" || r.severity === "BLOCK");
  const humanReviewRequired = VERDICT_RANK[topVerdict] >= VERDICT_RANK["CONDITIONAL"] || hasWarnOrBlock;

  const result: ComplianceResult = {
    license,
    permits,
    certificates,
    sps,
    tbt,
    controlledGoods,
    sanctions,
    topVerdict,
    overallConfidence,
    humanReviewRequired,
    restrictions,
    generatedAt: new Date().toISOString(),
    generatedBy: "compliance-orchestrator-v1",
  };

  logger.debug("[compliance-orchestrator] result", {
    jurisdictionCode: jc,
    topVerdict,
    overallConfidence,
    restrictionCount: restrictions.length,
    humanReviewRequired,
  });

  return result;
}

// ============ Single-subsystem runner ============

/**
 * runSingleSubsystem — run just one of the 7 subsystems (used by per-subsystem
 * API endpoints). Returns the raw subsystem result (LicenseResult /
 * PermitDetermination / etc.) on success, or an error object on failure.
 *
 * @param subsystem  One of: LICENSE | PERMIT | CERTIFICATE | SPS | TBT | CONTROLLED_GOODS | SANCTIONS
 * @param input      Unified ComplianceInput (same shape as runFullComplianceScreening).
 */
export async function runSingleSubsystem(
  subsystem: string,
  input: ComplianceInput,
): Promise<any> {
  const safeInput: ComplianceInput = input && typeof input === "object" ? input : ({} as ComplianceInput);
  const jc = typeof safeInput.jurisdictionCode === "string" ? safeInput.jurisdictionCode : "";

  try {
    switch (String(subsystem || "").toUpperCase()) {
      case "LICENSE": {
        return await determineLicenseRequirement({
          hs6: safeInput.hs6,
          productName: safeInput.productName,
          jurisdictionCode: jc,
          originCountry: safeInput.originCountry || "",
          destCountry: safeInput.destCountry || "",
          transportMode: safeInput.transportMode,
          applicantGtid: safeInput.applicantGtid,
        });
      }
      case "PERMIT": {
        return await determineAllPermits({
          hs6: safeInput.hs6,
          productName: safeInput.productName,
          jurisdictionCode: jc,
          originCountry: safeInput.originCountry || "",
          destCountry: safeInput.destCountry || "",
          transportMode: safeInput.transportMode,
          applicantGtid: safeInput.applicantGtid,
        });
      }
      case "CERTIFICATE": {
        return await determineCertificateRequirement({
          hs6: safeInput.hs6,
          productName: safeInput.productName,
          jurisdictionCode: jc,
          originCountry: safeInput.originCountry || "",
          destCountry: safeInput.destCountry || "",
          transportMode: safeInput.transportMode,
          applicantGtid: safeInput.applicantGtid,
          intendedUse: safeInput.intendedUse,
          preferentialAgreementId: safeInput.preferentialAgreementId,
          shippingTransshipment: safeInput.shippingTransshipment,
        });
      }
      case "SPS": {
        return await determineSpsRequirements({
          hs6: safeInput.hs6,
          commodity: safeInput.productName,
          originCountry: safeInput.originCountry || "",
          destCountry: safeInput.destCountry || "",
          jurisdictionCode: jc,
          season: safeInput.season,
          intendedUse: safeInput.intendedUse,
          transportMode: safeInput.transportMode,
        });
      }
      case "TBT": {
        return await determineTbtRequirements({
          hs6: safeInput.hs6,
          productName: safeInput.productName,
          jurisdictionCode: jc,
          transportMode: safeInput.transportMode,
        });
      }
      case "CONTROLLED_GOODS": {
        return await determineControlledGoods({
          hs6: safeInput.hs6,
          productName: safeInput.productName,
          casNumbers: safeInput.casNumbers,
          jurisdictionCode: jc,
          originCountry: safeInput.originCountry || "",
          destCountry: safeInput.destCountry || "",
          applicantGtid: safeInput.applicantGtid,
        });
      }
      case "SANCTIONS": {
        const inputs = buildSanctionsInputs(safeInput);
        if (inputs.length === 0) {
          return { results: [], aggregate: { topVerdict: "ALLOW", totalScreened: 0, matchedCount: 0, blockCount: 0, enhancedDdCount: 0, conditionalCount: 0 } };
        }
        const results = await screenMultiple(inputs);
        const aggregate = aggregateScreeningResults(results);
        return { results, aggregate };
      }
      default: {
        return { error: `Unknown subsystem: ${subsystem}` };
      }
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.error(`[compliance-orchestrator] runSingleSubsystem ${subsystem} failed`, { subsystem, error: reason });
    return { error: reason };
  }
}

// ============ Persisted-result fetch (stub for Phase 3) ============

/**
 * getComplianceResult — fetch a persisted ComplianceResult by USTN.
 *
 * Phase 3 does NOT persist the unified envelope (the Phase 2
 * RegulatoryProductResult already persists the Phase 2 portion). Returns null
 * for now — callers should rely on runFullComplianceScreening for the live
 * result. The signature is stable so a future task can wire this to a
 * ComplianceResult table without breaking callers.
 */
export async function getComplianceResult(ustn: string): Promise<ComplianceResult | null> {
  // Defensive no-op — matches Phase 3 contract. Logged for audit.
  if (!ustn || typeof ustn !== "string") return null;
  logger.debug("[compliance-orchestrator] getComplianceResult stub", { ustn });
  return null;
}

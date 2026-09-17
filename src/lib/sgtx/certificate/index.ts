// @ts-nocheck
// SGTX Phase 3 — §3 Certificate Engine (CCL-016)
// ---------------------------------------------------------------------------
// Regulatory Certificate determination: given a product + lane + applicant,
// enumerate ALL certificates required across the 17-type catalogue, load any
// existing RegulatoryCertificate rows, and return one CertificateResult per
// required type plus a topVerdict = strictest across all (BLOCK > ENHANCED_DD >
// CONDITIONAL > ALLOW) that the Governor gates (separate task) will merge with
// the License / Permit / SPS / TBT / controlled-goods / sanctions verdicts.
//
// 17 certificate types:
//   COO              — non-preferential Certificate of Origin (chamber-issued).
//   PREFERENTIAL_COO — preferential COO under an FTA / GPS scheme.
//   EUR1             — EUR.1 movement certificate (EU / Pan-Euro-Med origin).
//   PHYTOSANITARY    — plant-health certificate (IPPC, issued by origin NPPO).
//   HEALTH           — health / sanitary certificate for food of animal origin.
//   VETERINARY       — veterinary certificate for live animals / products.
//   ANALYSIS        — laboratory analysis / composition certificate.
//   CONFORMITY      — conformity-assessment / GMP / type-examination cert.
//   INSPECTION      — pre-shipment inspection (PSI / VOC) certificate.
//   FUMIGATION      — fumigation / quarantine treatment certificate.
//   TREATMENT       — generic treatment (hot-water / irradiation) certificate.
//   COLD_TREATMENT  — cold-treatment chain for perishable sea shipments.
//   HALAL           — Halal slaughter / process certification (EG/SA/AE...).
//   ORGANIC         — organic production / NOP / EU-organic certificate.
//   LABORATORY      — independent laboratory test report (per-batch).
//   SECURITY        — high-value shipment security / escort certificate.
//   INSURANCE       — marine / air / cargo insurance certificate.
//
// 9-state lifecycle (identical to licenses / permits):
//   NOT_REQUIRED → REQUIRED → APPLICATION_READY → SUBMITTED → PENDING →
//   ISSUED → (EXPIRED | REVOKED | REJECTED)
//
//   • NOT_REQUIRED     no certificate needed for this product/lane.
//   • REQUIRED         certificate required, not yet prepared.
//   • APPLICATION_READY documents gathered, ready to submit.
//   • SUBMITTED         application filed with the issuing authority.
//   • PENDING           application is under review.
//   • ISSUED            certificate granted; validFrom..validUntil.
//   • EXPIRED           validity window elapsed (terminal).
//   • REVOKED           issuing authority cancelled the certificate (terminal).
//   • REJECTED          application was refused (terminal — re-apply as a new row).
//
// Verdict semantics (advisory — the Governor merges with the other Phase 3
// subsystem verdicts):
//
//   ALLOW        — state = ISSUED and `isCertificateValid(cert)` true at the
//                  reference instant. Trade may proceed on this dimension.
//
//   CONDITIONAL  — certificate is in-flight (APPLICATION_READY / SUBMITTED /
//                  PENDING) OR required but not yet applied for (non-sensitive
//                  types — all certificate types are non-sensitive, so a bare
//                  REQUIRED state yields CONDITIONAL here, never ENHANCED_DD;
//                  the ENHANCED_DD verdict is reserved for STRATEGIC_GOODS-
//                  related conditions which are handled by the license engine
//                  and the controlled-goods engine, NOT this certificate engine
//                  — but we still implement the verdict in the union for
//                  forward compatibility (the Governor gates may override a
//                  SECURITY-certificate verdict to ENHANCED_DD when a
//                  STRATEGIC_GOODS license is also REQUIRED on the same
//                  shipment).
//
//   ENHANCED_DD  — RESERVED in this engine; not emitted by default. Provided
//                  in the verdict union for forward compatibility.
//
//   BLOCK        — state is EXPIRED, REVOKED, or REJECTED. The certificate is
//                  invalid; the trade must NOT proceed on this dimension.
//
// Design rules (mandatory per the SGTX convention):
//   • // @ts-nocheck at the top.
//   • Every DB call wrapped in try/catch — a persistence failure never
//     propagates; the function returns a degraded CONDITIONAL result.
//   • Uses `import { db } from "@/lib/db"` and
//     `import { logger } from "@/lib/sgtx/logger"`.
//   • If the ProductRegulatoryProfile lookup fails, the engine still returns
//     the always-required trio (COO + INSURANCE + SECURITY) with verdict
//     CONDITIONAL — never throws, never silently ALLOWs a cross-border trade
//     without surfacing it for human review.
//   • State transitions: invalid transitions are logged but still applied
//     (the operator may be correcting a data-entry mistake). The Governor
//     gates (separate task) surface these for audit.

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { getProductProfile } from "@/lib/sgtx/classification";

// Re-export the Prisma model type so callers don't need to import @prisma/client.
import type { RegulatoryCertificate } from "@prisma/client";
export type { RegulatoryCertificate };

// ============ Exported constants ============

/** The 17 regulatory certificate types handled by this engine. */
export const CERTIFICATE_TYPES = [
  "COO",
  "PREFERENTIAL_COO",
  "EUR1",
  "PHYTOSANITARY",
  "HEALTH",
  "VETERINARY",
  "ANALYSIS",
  "CONFORMITY",
  "INSPECTION",
  "FUMIGATION",
  "TREATMENT",
  "COLD_TREATMENT",
  "HALAL",
  "ORGANIC",
  "LABORATORY",
  "SECURITY",
  "INSURANCE",
] as const;

/** The nine lifecycle states a RegulatoryCertificate may occupy. */
export const CERTIFICATE_STATES = [
  "NOT_REQUIRED",
  "REQUIRED",
  "APPLICATION_READY",
  "SUBMITTED",
  "PENDING",
  "ISSUED",
  "EXPIRED",
  "REVOKED",
  "REJECTED",
] as const;

// ============ Exported interfaces ============

export interface CertificateInput {
  hs6?: string;
  productName?: string;
  jurisdictionCode: string;
  originCountry: string;
  destCountry: string;
  transportMode?: string;
  applicantGtid?: string;
  intendedUse?: string;
  preferentialAgreementId?: string;
  shippingTransshipment?: boolean;
}

export interface CertificateResult {
  required: boolean;
  certificateType: string;
  state: string;
  certificateId?: string;
  certificateNumber?: string;
  validUntil?: string;
  issuingBody?: string;
  conditions: string[];
  verdict: "ALLOW" | "CONDITIONAL" | "ENHANCED_DD" | "BLOCK";
  reason: string;
}

export interface CertificateDetermination {
  certificates: CertificateResult[];
  topVerdict: "ALLOW" | "CONDITIONAL" | "ENHANCED_DD" | "BLOCK";
  requiredCount: number;
  issuedCount: number;
  missingCount: number;
  expiredCount: number;
  revokedCount: number;
}

export interface UpsertCertificateInput {
  certificateType: string;
  hs6?: string;
  productName?: string;
  jurisdictionId?: string;
  originCountry?: string;
  destCountry?: string;
  applicantGtid?: string;
  issuingBody?: string;
  certificateNumber?: string;
  state?: string;
  validFrom?: Date;
  validUntil?: Date;
  scopeNotes?: string;
  attachments?: string[];
  sourceId?: string;
  connectorId?: string;
  notes?: string;
}

// ============ Internal constants ============

/**
 * Allowed forward transitions. Self-transitions are always permitted
 * (idempotent re-writes). Any transition NOT in this map (and not a
 * self-transition) is logged as invalid but still applied — see
 * `transitionCertificateState`.
 */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  NOT_REQUIRED: ["REQUIRED"],
  REQUIRED: ["APPLICATION_READY", "SUBMITTED", "PENDING", "ISSUED", "REJECTED"],
  APPLICATION_READY: ["SUBMITTED", "PENDING", "ISSUED", "REJECTED"],
  SUBMITTED: ["PENDING", "ISSUED", "REJECTED"],
  PENDING: ["ISSUED", "REJECTED"],
  ISSUED: ["EXPIRED", "REVOKED"],
  EXPIRED: [],
  REVOKED: [],
  REJECTED: [],
};

/** Verdict rank for "strictest wins" aggregation across certificate results. */
const VERDICT_RANK: Record<string, number> = {
  ALLOW: 0,
  CONDITIONAL: 1,
  ENHANCED_DD: 2,
  BLOCK: 3,
};

/**
 * Destinations where a HALAL certificate may be required for food destined
 * for human consumption. Conservative default list — extended per
 * jurisdiction policy via the ProductRegulatoryProfile / SPS engine in
 * future phases.
 */
const HALAL_DESTINATIONS = new Set(["EG", "SA", "AE", "BH", "KW", "QA", "OM", "MY", "ID", "PK"]);

/**
 * Map from a `requiredDocuments` token emitted by the Phase 2 origin engine
 * (OriginResult.requiredDocuments) into one of our 17 certificate types. This
 * lets the certificate engine cross-reference the origin determination so
 * we never miss a EUR.1 / Form A / Approved-Exporter authorization when the
 * origin engine already demanded it.
 *
 * Notes:
 *   - APPROVED_EXPORTER_AUTH is an authorization, not a certificate per se,
 *     but is surfaced here as EUR1 because the approved-exporter status
 *     substitutes for a per-shipment EUR.1 in EU / Pan-Euro-Med origin.
 *   - COO_FORM_A is the GSP Form A — a PREFERENTIAL_COO under the
 *     generalized system of preferences (non-EU FTA).
 */
const ORIGIN_DOC_TO_CERT: Record<string, string> = {
  EUR_MED: "EUR1",
  EUR1: "EUR1",
  COO_FORM_A: "PREFERENTIAL_COO",
  FORM_A: "PREFERENTIAL_COO",
  APPROVED_EXPORTER_AUTH: "EUR1",
  COO: "COO",
};

// ============ Internal helpers ============

/** Safe upper-case for an optional country / code string. */
function upper(s: string | undefined | null): string {
  return typeof s === "string" ? s.toUpperCase() : "";
}

/** Safe JSON.parse — returns `fallback` on any error. */
function safeJsonParse<T>(raw: unknown, fallback: T): T {
  if (raw == null) return fallback;
  if (typeof raw !== "string" || raw.length === 0) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Read a JSON classification field off the ProductRegulatoryProfile row. */
function profileField(profile: any, name: string): any | undefined {
  if (!profile) return undefined;
  const raw = profile[name];
  if (raw == null) return undefined;
  if (typeof raw === "object") return raw;
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  return safeJsonParse<any>(raw, undefined) ?? undefined;
}

/** Parse an attachments field (JSON array stored as a string) — never throws. */
function parseAttachments(raw: any): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.filter((x) => typeof x === "string");
  if (typeof raw === "string") {
    const parsed = safeJsonParse<string[]>(raw, []);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  }
  return [];
}

/**
 * Resolve jurisdictionCode → jurisdictionId (defensive — null on any error
 * or when the jurisdiction is not found).
 */
async function resolveJurisdictionId(code: string): Promise<string | null> {
  if (!code) return null;
  try {
    const j = await db.jurisdictionFabric.findFirst({
      where: { code: upper(code) },
      select: { id: true },
    });
    return j?.id ?? null;
  } catch (e: any) {
    logger.error("[certificate/resolveJurisdictionId] failed", {
      code,
      error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Load all RegulatoryCertificate rows matching a (certificateType, hs6,
 * jurisdictionId, applicantGtid) tuple. Defensive — returns [] on any error.
 */
async function loadMatchingCertificates(params: {
  certificateType: string;
  hs6?: string;
  jurisdictionId?: string | null;
  applicantGtid?: string;
}): Promise<RegulatoryCertificate[]> {
  try {
    const where: any = { certificateType: params.certificateType };
    if (params.hs6) where.hs6 = params.hs6;
    if (params.jurisdictionId) where.jurisdictionId = params.jurisdictionId;
    if (params.applicantGtid) where.applicantGtid = params.applicantGtid;
    const rows = await db.regulatoryCertificate.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });
    return Array.isArray(rows) ? rows : [];
  } catch (e: any) {
    logger.error("[certificate/loadMatchingCertificates] failed", {
      params,
      error: e?.message || String(e),
    });
    return [];
  }
}

/**
 * Pick the "best" RegulatoryCertificate row from a list. ISSUED (and within
 * the validity window) is always preferred; otherwise the most-advanced
 * in-flight state wins; terminal states (EXPIRED / REVOKED / REJECTED) are
 * returned only when nothing else exists (so we can still surface them with
 * a BLOCK verdict).
 */
function pickBestCertificate(rows: RegulatoryCertificate[]): RegulatoryCertificate | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  // First pass: any ISSUED+valid row wins outright.
  for (const r of rows) {
    if (r.state === "ISSUED" && isCertificateValid(r)) return r;
  }
  // Second pass: any ISSUED (even expired window) — still better than terminal.
  for (const r of rows) {
    if (r.state === "ISSUED") return r;
  }

  // Rank in-flight vs terminal states.
  const rank: Record<string, number> = {
    PENDING: 5,
    SUBMITTED: 4,
    APPLICATION_READY: 3,
    REQUIRED: 2,
    NOT_REQUIRED: 1,
    EXPIRED: 0,
    REVOKED: 0,
    REJECTED: 0,
  };
  return [...rows].sort((a, b) => {
    const ra = rank[a.state] ?? 0;
    const rb = rank[b.state] ?? 0;
    if (ra === rb) {
      const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return tb - ta;
    }
    return rb - ra;
  })[0];
}

/**
 * Pure verdict computation from a (state, certificateType) pair.
 *
 * Rules:
 *   • ISSUED + within valid window   → ALLOW
 *   • ISSUED + outside valid window  → BLOCK (effectively expired)
 *   • APPLICATION_READY / SUBMITTED / PENDING → CONDITIONAL
 *   • REQUIRED                       → CONDITIONAL (no certificate type in
 *                                     this engine is ENHANCED_DD by default)
 *   • EXPIRED / REVOKED / REJECTED   → BLOCK
 *   • NOT_REQUIRED                   → ALLOW
 */
function computeCertificateVerdict(
  state: string,
  cert: RegulatoryCertificate | null,
): "ALLOW" | "CONDITIONAL" | "ENHANCED_DD" | "BLOCK" {
  switch (state) {
    case "ISSUED":
      return cert && isCertificateValid(cert) ? "ALLOW" : "BLOCK";
    case "APPLICATION_READY":
    case "SUBMITTED":
    case "PENDING":
      return "CONDITIONAL";
    case "REQUIRED":
      return "CONDITIONAL";
    case "EXPIRED":
    case "REVOKED":
    case "REJECTED":
      return "BLOCK";
    case "NOT_REQUIRED":
    default:
      return "ALLOW";
  }
}

/**
 * Determine the full set of required certificate types for the input. Reads
 * the Phase 2 ProductRegulatoryProfile (agriculture / food / pharma /
 * veterinary / chemical / dg / cites classification families), the
 * transport mode, the preferential agreement, the intended use, and the
 * always-required trio (COO + INSURANCE + SECURITY).
 *
 * Notes:
 *   - citesClassification is intentionally NOT mapped here — CITES is
 *     handled in the controlled-goods engine (separate task).
 *   - The returned list is de-duplicated but unordered. The caller
 *     normalises order to CERTIFICATE_TYPES for stable output.
 *
 * Defensive — never throws; on profile lookup failure returns the
 * always-required trio.
 */
async function determineRequiredCertificateTypes(
  input: CertificateInput,
  jurisdictionId: string | null,
): Promise<{ types: string[]; profile: any | null }> {
  const hs6 = (input.hs6 || "").trim();
  const types = new Set<string>();

  // Always-required trio: non-preferential COO, cross-border INSURANCE,
  // and SECURITY for high-value shipments (we surface SECURITY on every
  // cross-border trade so the operator can mark it NOT_REQUIRED when the
  // shipment value is below the jurisdiction's threshold).
  types.add("COO");
  types.add("INSURANCE");
  types.add("SECURITY");

  // Profile-driven certificate requirements.
  let profile: any | null = null;
  if (hs6) {
    try {
      profile = await getProductProfile(hs6);
    } catch (e: any) {
      logger.error("[certificate/determineRequiredCertificateTypes] getProductProfile failed", {
        hs6,
        error: e?.message || String(e),
      });
      profile = null;
    }
  }

  if (profile) {
    const agri = profileField(profile, "agricultureClassification");
    if (agri) {
      types.add("PHYTOSANITARY");
      types.add("INSPECTION");
    }
    const food = profileField(profile, "foodClassification");
    if (food) {
      types.add("HEALTH");
      types.add("LABORATORY");
      types.add("ANALYSIS");
    }
    const pharma = profileField(profile, "pharmaClassification");
    if (pharma) {
      types.add("ANALYSIS");
      types.add("CONFORMITY"); // GMP
    }
    const vet = profileField(profile, "veterinaryClassification");
    if (vet) {
      types.add("VETERINARY");
    }
    const chem = profileField(profile, "chemicalClassification");
    if (chem) {
      types.add("ANALYSIS");
      types.add("CONFORMITY");
    }
    const dg = profileField(profile, "dgClassification");
    if (dg) {
      types.add("FUMIGATION");
      types.add("INSPECTION");
    }

    // Transport-mode + perishable: cold treatment for sea shipments of
    // agriculture produce with a low temperature minimum (< 4 °C).
    const tempMin = typeof profile.temperatureMinC === "number" ? profile.temperatureMinC : null;
    const transport = upper(input.transportMode);
    if (transport === "SEA" && agri && tempMin != null && tempMin < 4) {
      types.add("COLD_TREATMENT");
    }
    if (transport === "AIR" && agri) {
      // Perishable air shipment — additional inspection certificate.
      types.add("INSPECTION");
    }
  }

  // Preferential agreement: PREFERENTIAL_COO + EUR1 (or COO_FORM_A for
  // non-EU FTAs — surfaced as PREFERENTIAL_COO via the origin-doc map).
  if (input.preferentialAgreementId) {
    types.add("PREFERENTIAL_COO");
    types.add("EUR1");
  }

  // Cross-reference Phase 2 origin engine requiredDocuments. The origin
  // engine may emit EUR_MED / COO_FORM_A / APPROVED_EXPORTER_AUTH tokens;
  // map them onto our certificate types so we never miss an origin cert.
  try {
    if (hs6 && input.originCountry && input.destCountry) {
      // Lazy import to avoid circular module init when origin/index.ts
      // pulls in certificate/index.ts in the future.
      const originMod: any = await import("@/lib/sgtx/origin");
      if (originMod && typeof originMod.determineOrigin === "function") {
        const originResult = await originMod.determineOrigin({
          hs6,
          originCountry: input.originCountry,
          jurisdictionCode: input.jurisdictionCode,
          agreementId: input.preferentialAgreementId,
          shippingTransshipment: input.shippingTransshipment,
        });
        const docs: string[] = Array.isArray(originResult?.requiredDocuments)
          ? originResult.requiredDocuments
          : [];
        for (const d of docs) {
          const t = ORIGIN_DOC_TO_CERT[String(d).toUpperCase()];
          if (t) types.add(t);
        }
      }
    }
  } catch (e: any) {
    // Origin engine is best-effort: never let a failure here degrade the
    // certificate determination. The always-required trio + profile-driven
    // types already cover the common case.
    logger.warn("[certificate/determineRequiredCertificateTypes] origin cross-ref failed", {
      hs6,
      error: e?.message || String(e),
    });
  }

  // Intended use: HALAL (jurisdiction-specific) for human-consumption food
  // destined to EG / SA / AE etc., and ORGANIC for organic-claim shipments.
  const intendedUse = upper(input.intendedUse);
  const dest = upper(input.destCountry);
  if (intendedUse === "HUMAN_CONSUMPTION" && profileField(profile, "foodClassification")) {
    if (HALAL_DESTINATIONS.has(dest)) {
      types.add("HALAL");
    }
  }
  if (intendedUse === "ORGANIC") {
    types.add("ORGANIC");
  }

  // Normalise order to CERTIFICATE_TYPES for stable output.
  const ordered = CERTIFICATE_TYPES.filter((t) => types.has(t));
  return { types: ordered as unknown as string[], profile };
}

// ============ Public API ============

/**
 * Determine ALL required regulatory certificates for the given product /
 * lane / applicant. Combines Phase 2 ProductRegulatoryProfile classification
 * family signals, transport mode, preferential agreement, intended use, and
 * the always-required trio (COO + INSURANCE + SECURITY). For each required
 * type, loads any existing RegulatoryCertificate row matching the natural
 * key (certificateType, hs6, jurisdictionId, applicantGtid) and reports its
 * state + verdict.
 *
 * Defensive — never throws. On any failure (DB error, profile lookup error,
 * origin engine error), the always-required trio is still returned with
 * verdict CONDITIONAL so the trade is surfaced for human review rather than
 * silently allowed.
 *
 * @param input CertificateInput — product + lane + applicant context.
 * @returns CertificateDetermination — one CertificateResult per required
 *          certificate type, plus a topVerdict aggregated strictest-wins.
 */
export async function determineCertificateRequirement(
  input: CertificateInput,
): Promise<CertificateDetermination> {
  const safeInput: CertificateInput = {
    hs6: (input?.hs6 || "").trim() || undefined,
    productName: input?.productName,
    jurisdictionCode: upper(input?.jurisdictionCode),
    originCountry: upper(input?.originCountry),
    destCountry: upper(input?.destCountry),
    transportMode: input?.transportMode,
    applicantGtid: input?.applicantGtid,
    intendedUse: input?.intendedUse,
    preferentialAgreementId: input?.preferentialAgreementId,
    shippingTransshipment: input?.shippingTransshipment,
  };

  // Step 1: resolve jurisdictionId (defensive).
  const jurisdictionId = await resolveJurisdictionId(safeInput.jurisdictionCode);

  // Step 2: determine the required certificate type set.
  let requiredTypes: string[] = [];
  try {
    const detected = await determineRequiredCertificateTypes(safeInput, jurisdictionId);
    requiredTypes = detected.types;
  } catch (e: any) {
    logger.error("[certificate/determineCertificateRequirement] determineRequired failed", {
      hs6: safeInput.hs6,
      error: e?.message || String(e),
    });
    // Defensive fallback: always-required trio.
    requiredTypes = ["COO", "INSURANCE", "SECURITY"];
  }

  // Step 3: for each required type, load any existing RegulatoryCertificate
  // row and compute its verdict.
  const results: CertificateResult[] = [];
  for (const certificateType of requiredTypes) {
    let rows: RegulatoryCertificate[] = [];
    try {
      rows = await loadMatchingCertificates({
        certificateType,
        hs6: safeInput.hs6,
        jurisdictionId,
        applicantGtid: safeInput.applicantGtid,
      });
    } catch (e: any) {
      logger.error(
        "[certificate/determineCertificateRequirement] loadMatchingCertificates failed",
        { certificateType, error: e?.message || String(e) },
      );
      rows = [];
    }

    const existing = pickBestCertificate(rows);
    const state = existing?.state ?? "REQUIRED";
    const verdict = computeCertificateVerdict(state, existing);

    let reason: string;
    switch (verdict) {
      case "ALLOW":
        reason = `certificate ${certificateType} ISSUED and within validity window`;
        break;
      case "CONDITIONAL":
        reason = existing
          ? `certificate ${certificateType} in state ${state} — in progress`
          : `certificate ${certificateType} required — not yet applied for`;
        break;
      case "ENHANCED_DD":
        reason = `certificate ${certificateType} requires enhanced due diligence before application`;
        break;
      case "BLOCK":
        reason = `certificate ${certificateType} state ${state} — certificate invalid; trade must NOT proceed`;
        break;
      default:
        reason = "undetermined";
    }

    results.push({
      required: true,
      certificateType,
      state,
      certificateId: existing?.id ?? undefined,
      certificateNumber: existing?.certificateNumber ?? undefined,
      validUntil: existing?.validUntil ? new Date(existing.validUntil).toISOString() : undefined,
      issuingBody: existing?.issuingBody ?? undefined,
      conditions: existing?.scopeNotes ? [existing.scopeNotes] : [],
      verdict,
      reason,
    });
  }

  // Step 4: aggregate counters + topVerdict (strictest wins).
  let requiredCount = 0;
  let issuedCount = 0;
  let missingCount = 0;
  let expiredCount = 0;
  let revokedCount = 0;
  let topVerdict: "ALLOW" | "CONDITIONAL" | "ENHANCED_DD" | "BLOCK" = "ALLOW";

  for (const r of results) {
    if (r.required) requiredCount++;
    if (r.state === "ISSUED") issuedCount++;
    if (r.required && r.state !== "ISSUED") missingCount++;
    if (r.state === "EXPIRED") expiredCount++;
    if (r.state === "REVOKED") revokedCount++;
    const v = VERDICT_RANK[r.verdict] ?? 0;
    if (v > (VERDICT_RANK[topVerdict] ?? 0)) {
      topVerdict = r.verdict;
    }
  }

  // If no certificates were required at all (shouldn't happen — the trio
  // is always present), default topVerdict to ALLOW.
  if (results.length === 0) {
    topVerdict = "ALLOW";
  }

  return {
    certificates: results,
    topVerdict,
    requiredCount,
    issuedCount,
    missingCount,
    expiredCount,
    revokedCount,
  };
}

/**
 * List RegulatoryCertificate rows filtered by type / state / hs6 /
 * jurisdiction / applicant. Returns [] on any DB error.
 */
export async function listRegulatoryCertificates(filters?: {
  certificateType?: string;
  state?: string;
  hs6?: string;
  jurisdictionId?: string;
  applicantGtid?: string;
}): Promise<RegulatoryCertificate[]> {
  const f = filters || {};
  try {
    const where: any = {};
    if (f.certificateType) where.certificateType = f.certificateType;
    if (f.state) where.state = f.state;
    if (f.hs6) where.hs6 = f.hs6;
    if (f.jurisdictionId) where.jurisdictionId = f.jurisdictionId;
    if (f.applicantGtid) where.applicantGtid = f.applicantGtid;
    const rows = await db.regulatoryCertificate.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });
    return Array.isArray(rows) ? rows : [];
  } catch (e: any) {
    logger.error("[certificate/listRegulatoryCertificates] failed", {
      filters: f,
      error: e?.message || String(e),
    });
    return [];
  }
}

/**
 * Get a single RegulatoryCertificate by its primary key. Returns null on any
 * failure or when the row does not exist.
 */
export async function getRegulatoryCertificate(
  id: string,
): Promise<RegulatoryCertificate | null> {
  if (!id || typeof id !== "string") return null;
  try {
    const row = await db.regulatoryCertificate.findUnique({ where: { id } });
    return row ?? null;
  } catch (e: any) {
    logger.error("[certificate/getRegulatoryCertificate] failed", {
      id,
      error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Upsert a RegulatoryCertificate row. Finds an existing row by the natural
 * key (certificateType, hs6, jurisdictionId, applicantGtid) and updates it,
 * or creates a new row when no match exists.
 *
 * Defensive — on any DB error, returns a minimal in-memory
 * RegulatoryCertificate-like object so the caller can continue (the Governor
 * gates will surface the persistence failure). Never throws.
 */
export async function upsertRegulatoryCertificate(
  input: UpsertCertificateInput,
): Promise<RegulatoryCertificate> {
  const safe: UpsertCertificateInput = input || ({} as UpsertCertificateInput);
  try {
    const where: any = { certificateType: safe.certificateType };
    if (safe.hs6) where.hs6 = safe.hs6;
    if (safe.jurisdictionId) where.jurisdictionId = safe.jurisdictionId;
    if (safe.applicantGtid) where.applicantGtid = safe.applicantGtid;

    const existing = await db.regulatoryCertificate.findFirst({
      where,
      orderBy: { updatedAt: "desc" },
    });

    const attachmentsJson = Array.isArray(safe.attachments)
      ? JSON.stringify(safe.attachments)
      : undefined;

    if (existing) {
      const updated = await db.regulatoryCertificate.update({
        where: { id: existing.id },
        data: {
          certificateType: safe.certificateType ?? existing.certificateType,
          hs6: safe.hs6 ?? existing.hs6,
          productName: safe.productName ?? existing.productName,
          jurisdictionId: safe.jurisdictionId ?? existing.jurisdictionId,
          originCountry: safe.originCountry ?? existing.originCountry,
          destCountry: safe.destCountry ?? existing.destCountry,
          applicantGtid: safe.applicantGtid ?? existing.applicantGtid,
          issuingBody: safe.issuingBody ?? existing.issuingBody,
          certificateNumber: safe.certificateNumber ?? existing.certificateNumber,
          state: safe.state ?? existing.state,
          validFrom: safe.validFrom ?? existing.validFrom,
          validUntil: safe.validUntil ?? existing.validUntil,
          scopeNotes: safe.scopeNotes ?? existing.scopeNotes,
          attachments: attachmentsJson ?? existing.attachments,
          sourceId: safe.sourceId ?? existing.sourceId,
          connectorId: safe.connectorId ?? existing.connectorId,
          notes: safe.notes ?? existing.notes,
        },
      });
      return updated;
    }

    const created = await db.regulatoryCertificate.create({
      data: {
        certificateType: safe.certificateType,
        hs6: safe.hs6,
        productName: safe.productName,
        jurisdictionId: safe.jurisdictionId,
        originCountry: safe.originCountry,
        destCountry: safe.destCountry,
        applicantGtid: safe.applicantGtid,
        issuingBody: safe.issuingBody,
        certificateNumber: safe.certificateNumber,
        state: safe.state || "REQUIRED",
        validFrom: safe.validFrom,
        validUntil: safe.validUntil,
        scopeNotes: safe.scopeNotes,
        attachments: attachmentsJson,
        sourceId: safe.sourceId,
        connectorId: safe.connectorId,
        notes: safe.notes,
      },
    });
    return created;
  } catch (e: any) {
    logger.error("[certificate/upsertRegulatoryCertificate] failed", {
      input: safe,
      error: e?.message || String(e),
    });
    // Return a minimal stub so the caller can keep going. The Governor
    // gates will surface the persistence failure.
    return {
      id: "",
      certificateType: safe.certificateType || "COO",
      hs6: safe.hs6 ?? null,
      productName: safe.productName ?? null,
      jurisdictionId: safe.jurisdictionId ?? null,
      originCountry: safe.originCountry ?? null,
      destCountry: safe.destCountry ?? null,
      applicantGtid: safe.applicantGtid ?? null,
      issuingBody: safe.issuingBody ?? null,
      certificateNumber: safe.certificateNumber ?? null,
      state: safe.state || "REQUIRED",
      validFrom: safe.validFrom ?? null,
      validUntil: safe.validUntil ?? null,
      scopeNotes: safe.scopeNotes ?? null,
      attachments: Array.isArray(safe.attachments) ? JSON.stringify(safe.attachments) : null,
      sourceId: safe.sourceId ?? null,
      connectorId: safe.connectorId ?? null,
      appliedAt: null,
      issuedAt: null,
      expiresAt: null,
      notes: safe.notes ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as RegulatoryCertificate;
  }
}

/**
 * Transition a RegulatoryCertificate to a new state. Validates the
 * transition against `ALLOWED_TRANSITIONS`; self-transitions are always
 * permitted. If the transition is invalid (e.g. ISSUED → SUBMITTED), logs a
 * warning but still applies the update — the operator may be correcting a
 * data-entry mistake. The Governor gates (separate task) surface these audit
 * events.
 *
 * Also stamps the appropriate timestamp: appliedAt on first SUBMITTED,
 * issuedAt on first ISSUED, expiresAt on EXPIRED.
 *
 * Defensive — on DB error, returns the original row (mutated in-memory)
 * without throwing.
 */
export async function transitionCertificateState(
  id: string,
  newState: string,
  notes?: string,
): Promise<RegulatoryCertificate> {
  if (!id || typeof id !== "string") {
    throw new Error("transitionCertificateState: id is required");
  }
  if (!CERTIFICATE_STATES.includes(newState as any)) {
    throw new Error(`transitionCertificateState: invalid newState "${newState}"`);
  }

  let existing: RegulatoryCertificate | null = null;
  try {
    existing = await db.regulatoryCertificate.findUnique({ where: { id } });
  } catch (e: any) {
    logger.error("[certificate/transitionCertificateState] lookup failed", {
      id,
      error: e?.message || String(e),
    });
    throw e;
  }
  if (!existing) {
    throw new Error(`transitionCertificateState: RegulatoryCertificate ${id} not found`);
  }

  const oldState = existing.state;
  const allowed = ALLOWED_TRANSITIONS[oldState] ?? [];
  const isSelf = oldState === newState;
  const isValid = isSelf || allowed.includes(newState);

  if (!isValid) {
    logger.warn("[certificate/transitionCertificateState] invalid transition applied", {
      id,
      oldState,
      newState,
      allowed,
    });
  } else {
    logger.debug("[certificate/transitionCertificateState] transition", {
      id,
      oldState,
      newState,
    });
  }

  // Stamp timestamps based on the new state.
  const now = new Date();
  const patch: any = { state: newState };
  if (newState === "SUBMITTED" && !existing.appliedAt) patch.appliedAt = now;
  if (newState === "ISSUED" && !existing.issuedAt) patch.issuedAt = now;
  if (newState === "EXPIRED" && !existing.expiresAt) patch.expiresAt = now;
  if (typeof notes === "string" && notes.length > 0) {
    patch.notes = existing.notes
      ? `${existing.notes}\n[${now.toISOString()}] ${notes}`
      : `[${now.toISOString()}] ${notes}`;
  }

  try {
    const updated = await db.regulatoryCertificate.update({ where: { id }, data: patch });
    return updated;
  } catch (e: any) {
    logger.error("[certificate/transitionCertificateState] update failed", {
      id,
      newState,
      error: e?.message || String(e),
    });
    // Return the existing row, mutated in-memory, so callers can continue.
    return { ...existing, ...patch } as RegulatoryCertificate;
  }
}

/**
 * Pure function: is a RegulatoryCertificate valid at the given reference
 * instant? A certificate is valid iff state = "ISSUED" AND (validFrom is
 * null OR validFrom ≤ at) AND (validUntil is null OR validUntil ≥ at).
 *
 * Pure — does not touch the DB. Exported so the Governor gates can re-use
 * it without a round-trip.
 */
export function isCertificateValid(
  cert: RegulatoryCertificate,
  at: Date = new Date(),
): boolean {
  if (!cert) return false;
  if (cert.state !== "ISSUED") return false;
  const t = at instanceof Date ? at.getTime() : Date.now();
  if (cert.validFrom) {
    const from = new Date(cert.validFrom).getTime();
    if (Number.isFinite(from) && from > t) return false;
  }
  if (cert.validUntil) {
    const until = new Date(cert.validUntil).getTime();
    if (Number.isFinite(until) && until < t) return false;
  }
  return true;
}

/**
 * Return the subset of a CertificateDetermination's certificates that are
 * required but not yet ISSUED — i.e. the gap the operator must close before
 * the trade can proceed.
 *
 * Pure (operates on the determination returned by
 * `determineCertificateRequirement`).
 */
export function getMissingCertificates(
  determination: CertificateDetermination,
): CertificateResult[] {
  if (!determination || !Array.isArray(determination.certificates)) return [];
  return determination.certificates.filter((c) => c.required && c.state !== "ISSUED");
}

// Export the attachment parser for re-use by callers (e.g. the Governor gates
// or the regulatory-product engine) without exposing internal helpers.
export { parseAttachments };

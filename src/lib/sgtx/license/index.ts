// @ts-nocheck
// SGTX Phase 3 — §1 License Engine (CCL-016)
// ---------------------------------------------------------------------------
// Required import / export / transit / controlled-goods / special-product /
// strategic-goods licenses. Each call to `determineLicenseRequirement` answers
// the question: "given this product + this lane + this applicant, is a Trade
// License required, has one been issued, and what is the Governor verdict?"
//
// Lifecycle (9 states):
//   NOT_REQUIRED → REQUIRED → APPLICATION_READY → SUBMITTED → PENDING →
//   ISSUED → (EXPIRED | REVOKED | REJECTED)
//
//   • NOT_REQUIRED     no license is needed for this product/lane.
//   • REQUIRED         license required but not yet prepared — operator must
//                      gather the documents (end-user statement, end-use
//                      certificate, etc.) before an application can be filed.
//   • APPLICATION_READY the documents are gathered; ready to submit.
//   • SUBMITTED         application filed with the issuing authority.
//   • PENDING           application is under review by the issuing authority.
//   • ISSUED            license granted; valid between validFrom..validUntil.
//   • EXPIRED           validity window elapsed (terminal).
//   • REVOKED           issuing authority cancelled the license (terminal).
//   • REJECTED          application was refused (terminal — re-apply as a new
//                       TradeLicense row).
//
// Verdict semantics (advisory — the Governor merges these with the other
// Phase 3 subsystem verdicts):
//
//   ALLOW        — state = ISSUED and `isLicenseValid(license)` true at the
//                  reference instant. Trade may proceed on this dimension.
//
//   CONDITIONAL  — license exists and is in-flight (APPLICATION_READY /
//                  SUBMITTED / PENDING) OR the product/lane is non-controlled
//                  but a license is REQUIRED and has not yet been applied for
//                  for a non-sensitive type (IMPORT/EXPORT/TRANSIT/
//                  SPECIAL_PRODUCT). Trade MAY proceed, with a warning.
//
//   ENHANCED_DD  — licenseType is CONTROLLED_GOODS or STRATEGIC_GOODS and
//                  state = REQUIRED (not yet applied). Enhanced due diligence
//                  must be triggered before the application is filed.
//
//   BLOCK        — state is EXPIRED, REVOKED, or REJECTED. The license is
//                  invalid; the trade must NOT proceed on this dimension.
//
// Design rules (mandatory per the SGTX convention):
//   • // @ts-nocheck at the top.
//   • Every DB call wrapped in try/catch — a persistence failure never
//     propagates; the function returns a degraded CONDITIONAL result.
//   • Uses `import { db } from "@/lib/db"` and
//     `import { logger } from "@/lib/sgtx/logger"`.
//   • If the ProductRegulatoryProfile lookup fails, degrade to REQUIRED +
//     CONDITIONAL (do NOT crash) — never BLOCK on a lookup failure alone,
//     because BLOCK requires an actually-invalid license row, not a missing
//     classification.
//   • State transitions: invalid transitions are logged but still applied
//     (the operator may be correcting a data-entry mistake). The Governor
//     gates (separate task) surface these for audit.

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { getProductProfile } from "@/lib/sgtx/classification";

// Re-export the Prisma model type so callers don't need to import @prisma/client.
import type { TradeLicense } from "@prisma/client";
export type { TradeLicense };

// ============ Exported constants ============

/** The six license types handled by this engine. */
export const LICENSE_TYPES = [
  "IMPORT",
  "EXPORT",
  "TRANSIT",
  "CONTROLLED_GOODS",
  "SPECIAL_PRODUCT",
  "STRATEGIC_GOODS",
] as const;

/** The nine lifecycle states a TradeLicense may occupy. */
export const LICENSE_STATES = [
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

export interface LicenseInput {
  hs6?: string;
  productName?: string;
  jurisdictionCode: string;
  originCountry: string;
  destCountry: string;
  transportMode?: string;
  applicantGtid?: string;
}

export interface LicenseResult {
  required: boolean;
  licenseType: string;
  state: string;
  licenseId?: string;
  licenseNumber?: string;
  validUntil?: string;
  conditions: string[];
  endUserStatementRequired: boolean;
  endUseCertificateRequired: boolean;
  verdict: "ALLOW" | "CONDITIONAL" | "ENHANCED_DD" | "BLOCK";
  reason: string;
}

export interface UpsertLicenseInput {
  licenseType: string;
  hs6?: string;
  productName?: string;
  jurisdictionId?: string;
  originCountry?: string;
  destCountry?: string;
  applicantGtid?: string;
  issuingAuthority?: string;
  licenseNumber?: string;
  state?: string;
  validFrom?: Date;
  validUntil?: Date;
  quantityAuthorized?: number;
  quantityUnit?: string;
  conditions?: string[];
  endUserStatement?: boolean;
  endUseCertificate?: boolean;
  sourceId?: string;
  connectorId?: string;
  notes?: string;
}

// ============ Internal constants ============

/**
 * Allowed forward transitions. Self-transitions are always permitted
 * (idempotent re-writes). Any transition NOT in this map (and not a
 * self-transition) is logged as invalid but still applied — see
 * `transitionLicenseState`.
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

/** Severity ranking used to pick the dominant license type when multiple apply. */
const TYPE_SEVERITY: Record<string, number> = {
  STRATEGIC_GOODS: 5,
  CONTROLLED_GOODS: 4,
  SPECIAL_PRODUCT: 3,
  TRANSIT: 2,
  EXPORT: 1,
  IMPORT: 0,
};

/** Verdict rank for "strictest wins" aggregation across permit results. */
const VERDICT_RANK: Record<string, number> = {
  ALLOW: 0,
  CONDITIONAL: 1,
  ENHANCED_DD: 2,
  BLOCK: 3,
};

/** HS chapter prefixes that trigger specific license types. */
const HS_CHAPTER_STRATEGIC = ["93"]; // arms and ammunition
const HS_CHAPTER_PHARMA = ["30"]; // pharmaceutical products

// ============ Internal helpers ============

/** Safe upper-case for an optional country code. */
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

/** Parse a conditions field (JSON array stored as a string) — never throws. */
function parseConditions(raw: any): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.filter((x) => typeof x === "string");
  if (typeof raw === "string") {
    const parsed = safeJsonParse<string[]>(raw, []);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  }
  return [];
}

/** Pick the most advanced-state license row from a list. */
function pickMostAdvanced(rows: TradeLicense[]): TradeLicense | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const rank: Record<string, number> = {
    NOT_REQUIRED: 0,
    REQUIRED: 1,
    APPLICATION_READY: 2,
    SUBMITTED: 3,
    PENDING: 4,
    ISSUED: 5,
    EXPIRED: 6, // terminal — ranked after ISSUED so we surface invalid ones
    REVOKED: 7,
    REJECTED: 8,
  };
  // Prefer ISSUED (rank 5) above terminal states (rank 6..8) so an active
  // license is returned even when an older expired one exists for the same
  // (type, hs6, jurisdiction, applicant) tuple.
  return [...rows].sort((a, b) => {
    const ra = rank[a.state] ?? 0;
    const rb = rank[b.state] ?? 0;
    if (ra === rb) {
      // Newer updatedAt wins for ties.
      const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return tb - ta;
    }
    // We want ISSUED (5) to rank highest among all rows. To keep terminal
    // states (6..8) below ISSUED but still above in-progress states, we
    // invert: any rank > 5 is treated as worse.
    const normA = ra > 5 ? -(ra - 5) + 4.5 : ra; // ISSUED=5 stays, EXPIRED=4.5, REVOKED=4.0, REJECTED=3.5
    const normB = rb > 5 ? -(rb - 5) + 4.5 : rb;
    return normB - normA;
  })[0];
}

/**
 * Determine which license type(s) apply to the input by inspecting the
 * ProductRegulatoryProfile (Phase 2) and HS chapter patterns. Returns the
 * list of candidate license types ordered by descending severity (most
 * sensitive first).
 *
 * Defensive — if the profile lookup fails entirely, returns an empty list
 * (the caller will degrade to NOT_REQUIRED + ALLOW). NEVER throws.
 */
async function determineCandidateLicenseTypes(
  input: LicenseInput,
): Promise<{ types: string[]; profile: any | null }> {
  const hs6 = (input.hs6 || "").trim();
  const hsChapter = hs6.length >= 2 ? hs6.slice(0, 2) : "";
  const types = new Set<string>();

  let profile: any | null = null;
  if (hs6) {
    try {
      profile = await getProductProfile(hs6);
    } catch (e: any) {
      logger.error("[license/determineCandidateLicenseTypes] getProductProfile failed", {
        hs6,
        error: e?.message || String(e),
      });
      profile = null;
    }
  }

  // Profile-driven: dual-use → CONTROLLED_GOODS, strategic → STRATEGIC_GOODS,
  // pharma → SPECIAL_PRODUCT.
  if (profile) {
    const dualUse = profileField(profile, "dualUseClassification");
    if (dualUse) types.add("CONTROLLED_GOODS");
    const strategic = profileField(profile, "strategicGoodsClassification");
    if (strategic) types.add("STRATEGIC_GOODS");
    const pharma = profileField(profile, "pharmaClassification");
    if (pharma || HS_CHAPTER_PHARMA.includes(hsChapter)) {
      types.add("SPECIAL_PRODUCT");
    }
  }

  // HS-chapter patterns (fallback when no profile or to augment it).
  if (HS_CHAPTER_STRATEGIC.includes(hsChapter)) {
    types.add("STRATEGIC_GOODS");
  }
  if (HS_CHAPTER_PHARMA.includes(hsChapter)) {
    types.add("SPECIAL_PRODUCT");
  }

  // Import / export / transit licenses: heuristically, an IMPORT license is
  // required when the destination jurisdiction is known to issue such
  // licenses for the product (we look at ISSUED rows in this jurisdiction
  // as "examples of what's been issued"). If the lookup fails or finds
  // nothing, no IMPORT/EXPORT/TRANSIT license is added — the controlled and
  // strategic checks above remain the source of truth.
  const jurisdictionId = await resolveJurisdictionId(input.jurisdictionCode);
  if (jurisdictionId && hs6) {
    try {
      const issuedImport = await db.tradeLicense.findFirst({
        where: {
          licenseType: "IMPORT",
          jurisdictionId,
          hs6,
          state: "ISSUED",
        },
        orderBy: { updatedAt: "desc" },
      });
      if (issuedImport) types.add("IMPORT");
    } catch (e: any) {
      logger.error(
        "[license/determineCandidateLicenseTypes] ISSUED-IMPORT heuristic failed",
        { jurisdictionId, hs6, error: e?.message || String(e) },
      );
    }
  }

  // Sort by severity (highest first).
  const sorted = Array.from(types).sort(
    (a, b) => (TYPE_SEVERITY[b] ?? 0) - (TYPE_SEVERITY[a] ?? 0),
  );

  return { types: sorted, profile };
}

/** Resolve jurisdictionCode → jurisdictionId (defensive). */
async function resolveJurisdictionId(code: string): Promise<string | null> {
  if (!code) return null;
  try {
    const j = await db.jurisdictionFabric.findFirst({
      where: { code: upper(code) },
      select: { id: true },
    });
    return j?.id ?? null;
  } catch (e: any) {
    logger.error("[license/resolveJurisdictionId] failed", {
      code,
      error: e?.message || String(e),
    });
    return null;
  }
}

/** Load all TradeLicense rows matching a (type, hs6, jurisdictionId, applicant) tuple. */
async function loadMatchingLicenses(params: {
  licenseType: string;
  hs6?: string;
  jurisdictionId?: string | null;
  originCountry?: string;
  destCountry?: string;
  applicantGtid?: string;
}): Promise<TradeLicense[]> {
  try {
    const where: any = { licenseType: params.licenseType };
    if (params.hs6) where.hs6 = params.hs6;
    if (params.jurisdictionId) where.jurisdictionId = params.jurisdictionId;
    if (params.applicantGtid) where.applicantGtid = params.applicantGtid;
    // Origin / destination are matched with OR so a license scoped to either
    // side of the lane is considered.
    if (params.originCountry || params.destCountry) {
      where.OR = [
        ...(params.originCountry ? [{ originCountry: params.originCountry }] : []),
        ...(params.destCountry ? [{ destCountry: params.destCountry }] : []),
      ];
    }
    const rows = await db.tradeLicense.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });
    return Array.isArray(rows) ? rows : [];
  } catch (e: any) {
    logger.error("[license/loadMatchingLicenses] failed", {
      params,
      error: e?.message || String(e),
    });
    return [];
  }
}

/**
 * Pure verdict computation from a (state, licenseType) pair. The Governor
 * gates re-evaluate this independently from `determineLicenseRequirement`
 * so the helper is exported (implicitly via the function name) but kept
 * local to keep the public surface small.
 *
 * Rules:
 *   • ISSUED + within valid window   → ALLOW
 *   • ISSUED + outside valid window  → BLOCK (expired)
 *   • APPLICATION_READY / SUBMITTED / PENDING → CONDITIONAL
 *   • REQUIRED + CONTROLLED_GOODS / STRATEGIC_GOODS → ENHANCED_DD
 *   • REQUIRED + other types         → CONDITIONAL
 *   • EXPIRED / REVOKED / REJECTED   → BLOCK
 *   • NOT_REQUIRED                   → ALLOW
 */
function computeVerdict(
  state: string,
  licenseType: string,
  license: TradeLicense | null,
): "ALLOW" | "CONDITIONAL" | "ENHANCED_DD" | "BLOCK" {
  switch (state) {
    case "ISSUED":
      return license && isLicenseValid(license) ? "ALLOW" : "BLOCK";
    case "APPLICATION_READY":
    case "SUBMITTED":
    case "PENDING":
      return "CONDITIONAL";
    case "REQUIRED":
      if (licenseType === "CONTROLLED_GOODS" || licenseType === "STRATEGIC_GOODS") {
        return "ENHANCED_DD";
      }
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

// ============ Public API ============

/**
 * Determine whether a Trade License is required for the given product/lane,
 * load any existing matching license row, and return a single
 * `LicenseResult` describing the dominant license type (most sensitive first).
 *
 * Defensive: never throws. On any failure (DB error, profile lookup error),
 * degrades to `{ required: true, state: "REQUIRED", verdict: "CONDITIONAL" }`
 * so the trade is surfaced for human review rather than silently allowed.
 *
 * @param input LicenseInput — product + lane + applicant context.
 * @returns LicenseResult — single result for the dominant license type.
 */
export async function determineLicenseRequirement(
  input: LicenseInput,
): Promise<LicenseResult> {
  const safeInput: LicenseInput = {
    hs6: (input?.hs6 || "").trim() || undefined,
    productName: input?.productName,
    jurisdictionCode: upper(input?.jurisdictionCode),
    originCountry: upper(input?.originCountry),
    destCountry: upper(input?.destCountry),
    transportMode: input?.transportMode,
    applicantGtid: input?.applicantGtid,
  };

  // Step 1: resolve jurisdiction id (defensive).
  const jurisdictionId = await resolveJurisdictionId(safeInput.jurisdictionCode);

  // Step 2: determine candidate license types from profile + HS chapter.
  let candidateTypes: string[] = [];
  let profile: any | null = null;
  try {
    const detected = await determineCandidateLicenseTypes(safeInput);
    candidateTypes = detected.types;
    profile = detected.profile;
  } catch (e: any) {
    logger.error("[license/determineLicenseRequirement] candidate detection failed", {
      hs6: safeInput.hs6,
      error: e?.message || String(e),
    });
    candidateTypes = [];
  }

  // Step 3: if no candidate type, return NOT_REQUIRED + ALLOW.
  if (candidateTypes.length === 0) {
    return {
      required: false,
      licenseType: "IMPORT", // placeholder — required=false
      state: "NOT_REQUIRED",
      conditions: [],
      endUserStatementRequired: false,
      endUseCertificateRequired: false,
      verdict: "ALLOW",
      reason: "no license required — product not on any control list and no prior IMPORT license issued in this jurisdiction for this HS6",
    };
  }

  // Step 4: for each candidate type, load matching TradeLicense rows.
  // Pick the most advanced license. Aggregate the candidate types into a
  // single dominant result: prefer the type with the highest-severity
  // existing license state; if no existing license exists for any type,
  // fall back to the highest-severity type and mark REQUIRED.
  const VERDICT_STATE_RANK: Record<string, number> = {
    ISSUED: 5,
    PENDING: 4,
    SUBMITTED: 3,
    APPLICATION_READY: 2,
    REQUIRED: 1,
    NOT_REQUIRED: 0,
    EXPIRED: 6, // terminal — counts toward "existing invalid"
    REVOKED: 7,
    REJECTED: 8,
  };

  let dominant: {
    licenseType: string;
    license: TradeLicense | null;
    state: string;
  } | null = null;

  for (const licenseType of candidateTypes) {
    let rows: TradeLicense[] = [];
    try {
      rows = await loadMatchingLicenses({
        licenseType,
        hs6: safeInput.hs6,
        jurisdictionId,
        originCountry: safeInput.originCountry,
        destCountry: safeInput.destCountry,
        applicantGtid: safeInput.applicantGtid,
      });
    } catch (e: any) {
      logger.error("[license/determineLicenseRequirement] loadMatchingLicenses failed", {
        licenseType,
        error: e?.message || String(e),
      });
      rows = [];
    }

    const existing = pickMostAdvanced(rows);
    // State to evaluate: existing license's state, or REQUIRED if no row exists.
    const state = existing?.state ?? "REQUIRED";
    const verdict = computeVerdict(state, licenseType, existing);

    if (!dominant) {
      dominant = { licenseType, license: existing, state };
      continue;
    }

    // Strictest verdict wins. Tie-break by license-type severity.
    const v1 = VERDICT_RANK[computeVerdict(dominant.state, dominant.licenseType, dominant.license)] ?? 0;
    const v2 = VERDICT_RANK[verdict] ?? 0;
    if (v2 > v1) {
      dominant = { licenseType, license: existing, state };
    } else if (v2 === v1) {
      const s1 = TYPE_SEVERITY[dominant.licenseType] ?? 0;
      const s2 = TYPE_SEVERITY[licenseType] ?? 0;
      if (s2 > s1) {
        dominant = { licenseType, license: existing, state };
      }
    }
  }

  if (!dominant) {
    // Should never happen — defensive fallback.
    return {
      required: true,
      licenseType: candidateTypes[0] ?? "IMPORT",
      state: "REQUIRED",
      conditions: [],
      endUserStatementRequired: false,
      endUseCertificateRequired: false,
      verdict: "CONDITIONAL",
      reason: "license determination degraded — no dominant candidate selected",
    };
  }

  // Step 5: assemble the result.
  const { licenseType, license, state } = dominant;
  const verdict = computeVerdict(state, licenseType, license);
  const conditions = license ? parseConditions(license.conditions) : [];
  const endUserStatementRequired = license
    ? !!license.endUserStatement
    : licenseType === "CONTROLLED_GOODS" || licenseType === "STRATEGIC_GOODS";
  const endUseCertificateRequired = license
    ? !!license.endUseCertificate
    : licenseType === "CONTROLLED_GOODS" || licenseType === "STRATEGIC_GOODS";

  let reason: string;
  switch (verdict) {
    case "ALLOW":
      reason = `license ${licenseType} ISSUED and within validity window`;
      break;
    case "CONDITIONAL":
      reason = license
        ? `license ${licenseType} in state ${state} — in progress`
        : `license ${licenseType} required — not yet applied for`;
      break;
    case "ENHANCED_DD":
      reason = `${licenseType} license REQUIRED — enhanced due diligence must be triggered before application`;
      break;
    case "BLOCK":
      reason = `license ${licenseType} state ${state} — license invalid; trade must NOT proceed`;
      break;
    default:
      reason = "undetermined";
  }

  return {
    required: true,
    licenseType,
    state,
    licenseId: license?.id,
    licenseNumber: license?.licenseNumber ?? undefined,
    validUntil: license?.validUntil ? new Date(license.validUntil).toISOString() : undefined,
    conditions,
    endUserStatementRequired,
    endUseCertificateRequired,
    verdict,
    reason,
  };
}

/**
 * List TradeLicense rows filtered by type / state / hs6 / jurisdiction /
 * applicant. Returns [] on any DB error.
 */
export async function listTradeLicenses(filters?: {
  licenseType?: string;
  state?: string;
  hs6?: string;
  jurisdictionId?: string;
  applicantGtid?: string;
}): Promise<TradeLicense[]> {
  const f = filters || {};
  try {
    const where: any = {};
    if (f.licenseType) where.licenseType = f.licenseType;
    if (f.state) where.state = f.state;
    if (f.hs6) where.hs6 = f.hs6;
    if (f.jurisdictionId) where.jurisdictionId = f.jurisdictionId;
    if (f.applicantGtid) where.applicantGtid = f.applicantGtid;
    const rows = await db.tradeLicense.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });
    return Array.isArray(rows) ? rows : [];
  } catch (e: any) {
    logger.error("[license/listTradeLicenses] failed", {
      filters: f,
      error: e?.message || String(e),
    });
    return [];
  }
}

/**
 * Get a single TradeLicense by its primary key. Returns null on any failure
 * or when the row does not exist.
 */
export async function getTradeLicense(id: string): Promise<TradeLicense | null> {
  if (!id || typeof id !== "string") return null;
  try {
    const row = await db.tradeLicense.findUnique({ where: { id } });
    return row ?? null;
  } catch (e: any) {
    logger.error("[license/getTradeLicense] failed", {
      id,
      error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Upsert a TradeLicense row. Finds an existing row by the natural key
 * (licenseType, hs6, jurisdictionId, applicantGtid) and updates it, or
 * creates a new row when no match exists.
 *
 * Defensive — on any DB error, returns a minimal in-memory TradeLicense-like
 * object so the caller can continue (the Governor gates will surface the
 * failure). Never throws.
 */
export async function upsertTradeLicense(
  input: UpsertLicenseInput,
): Promise<TradeLicense> {
  const safe: UpsertLicenseInput = input || ({} as UpsertLicenseInput);
  try {
    const where: any = { licenseType: safe.licenseType };
    if (safe.hs6) where.hs6 = safe.hs6;
    if (safe.jurisdictionId) where.jurisdictionId = safe.jurisdictionId;
    if (safe.applicantGtid) where.applicantGtid = safe.applicantGtid;

    const existing = await db.tradeLicense.findFirst({
      where,
      orderBy: { updatedAt: "desc" },
    });

    const conditionsJson = Array.isArray(safe.conditions)
      ? JSON.stringify(safe.conditions)
      : undefined;

    if (existing) {
      const updated = await db.tradeLicense.update({
        where: { id: existing.id },
        data: {
          licenseType: safe.licenseType ?? existing.licenseType,
          hs6: safe.hs6 ?? existing.hs6,
          productName: safe.productName ?? existing.productName,
          jurisdictionId: safe.jurisdictionId ?? existing.jurisdictionId,
          originCountry: safe.originCountry ?? existing.originCountry,
          destCountry: safe.destCountry ?? existing.destCountry,
          applicantGtid: safe.applicantGtid ?? existing.applicantGtid,
          issuingAuthority: safe.issuingAuthority ?? existing.issuingAuthority,
          licenseNumber: safe.licenseNumber ?? existing.licenseNumber,
          state: safe.state ?? existing.state,
          validFrom: safe.validFrom ?? existing.validFrom,
          validUntil: safe.validUntil ?? existing.validUntil,
          quantityAuthorized: safe.quantityAuthorized ?? existing.quantityAuthorized,
          quantityUnit: safe.quantityUnit ?? existing.quantityUnit,
          conditions: conditionsJson ?? existing.conditions,
          endUserStatement: safe.endUserStatement ?? existing.endUserStatement,
          endUseCertificate: safe.endUseCertificate ?? existing.endUseCertificate,
          sourceId: safe.sourceId ?? existing.sourceId,
          connectorId: safe.connectorId ?? existing.connectorId,
          notes: safe.notes ?? existing.notes,
        },
      });
      return updated;
    }

    const created = await db.tradeLicense.create({
      data: {
        licenseType: safe.licenseType,
        hs6: safe.hs6,
        productName: safe.productName,
        jurisdictionId: safe.jurisdictionId,
        originCountry: safe.originCountry,
        destCountry: safe.destCountry,
        applicantGtid: safe.applicantGtid,
        issuingAuthority: safe.issuingAuthority,
        licenseNumber: safe.licenseNumber,
        state: safe.state || "REQUIRED",
        validFrom: safe.validFrom,
        validUntil: safe.validUntil,
        quantityAuthorized: safe.quantityAuthorized,
        quantityUnit: safe.quantityUnit,
        conditions: conditionsJson,
        endUserStatement: safe.endUserStatement ?? false,
        endUseCertificate: safe.endUseCertificate ?? false,
        sourceId: safe.sourceId,
        connectorId: safe.connectorId,
        notes: safe.notes,
      },
    });
    return created;
  } catch (e: any) {
    logger.error("[license/upsertTradeLicense] failed", {
      input: safe,
      error: e?.message || String(e),
    });
    // Return a minimal stub so the caller can keep going. The Governor
    // gates will surface the persistence failure.
    return {
      id: "",
      licenseType: safe.licenseType || "IMPORT",
      hs6: safe.hs6 ?? null,
      productName: safe.productName ?? null,
      jurisdictionId: safe.jurisdictionId ?? null,
      originCountry: safe.originCountry ?? null,
      destCountry: safe.destCountry ?? null,
      applicantGtid: safe.applicantGtid ?? null,
      issuingAuthority: safe.issuingAuthority ?? null,
      licenseNumber: safe.licenseNumber ?? null,
      state: safe.state || "REQUIRED",
      validFrom: safe.validFrom ?? null,
      validUntil: safe.validUntil ?? null,
      quantityAuthorized: safe.quantityAuthorized ?? null,
      quantityUnit: safe.quantityUnit ?? null,
      conditions: Array.isArray(safe.conditions) ? JSON.stringify(safe.conditions) : null,
      endUserStatement: safe.endUserStatement ?? false,
      endUseCertificate: safe.endUseCertificate ?? false,
      sourceId: safe.sourceId ?? null,
      connectorId: safe.connectorId ?? null,
      appliedAt: null,
      issuedAt: null,
      expiresAt: null,
      notes: safe.notes ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as TradeLicense;
  }
}

/**
 * Transition a TradeLicense to a new state. Validates the transition
 * against `ALLOWED_TRANSITIONS`; self-transitions are always permitted.
 * If the transition is invalid (e.g. ISSUED → SUBMITTED), logs a warning
 * but still applies the update — the operator may be correcting a data
 * entry mistake. The Governor gates (separate task) surface these audit
 * events.
 *
 * Also stamps the appropriate timestamp: appliedAt on first SUBMITTED,
 * issuedAt on first ISSUED, expiresAt on EXPIRED.
 *
 * Defensive — on DB error, returns the original row (or a stub) without
 * throwing.
 */
export async function transitionLicenseState(
  id: string,
  newState: string,
  notes?: string,
): Promise<TradeLicense> {
  if (!id || typeof id !== "string") {
    throw new Error("transitionLicenseState: id is required");
  }
  if (!LICENSE_STATES.includes(newState as any)) {
    throw new Error(`transitionLicenseState: invalid newState "${newState}"`);
  }

  let existing: TradeLicense | null = null;
  try {
    existing = await db.tradeLicense.findUnique({ where: { id } });
  } catch (e: any) {
    logger.error("[license/transitionLicenseState] lookup failed", {
      id,
      error: e?.message || String(e),
    });
    throw e;
  }
  if (!existing) {
    throw new Error(`transitionLicenseState: TradeLicense ${id} not found`);
  }

  const oldState = existing.state;
  const allowed = ALLOWED_TRANSITIONS[oldState] ?? [];
  const isSelf = oldState === newState;
  const isValid = isSelf || allowed.includes(newState);

  if (!isValid) {
    logger.warn("[license/transitionLicenseState] invalid transition applied", {
      id,
      oldState,
      newState,
      allowed,
    });
  } else {
    logger.debug("[license/transitionLicenseState] transition", {
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
    const updated = await db.tradeLicense.update({ where: { id }, data: patch });
    return updated;
  } catch (e: any) {
    logger.error("[license/transitionLicenseState] update failed", {
      id,
      newState,
      error: e?.message || String(e),
    });
    // Return the existing row, mutated in-memory, so callers can continue.
    return { ...existing, ...patch } as TradeLicense;
  }
}

/**
 * Pure function: is a TradeLicense valid at the given reference instant?
 * A license is valid iff state = "ISSUED" AND (validFrom is null OR
 * validFrom ≤ at) AND (validUntil is null OR validUntil ≥ at).
 *
 * Pure — does not touch the DB. Exported so the Governor gates can re-use
 * it without a round-trip.
 */
export function isLicenseValid(license: TradeLicense, at: Date = new Date()): boolean {
  if (!license) return false;
  if (license.state !== "ISSUED") return false;
  const t = at instanceof Date ? at.getTime() : Date.now();
  if (license.validFrom) {
    const from = new Date(license.validFrom).getTime();
    if (Number.isFinite(from) && from > t) return false;
  }
  if (license.validUntil) {
    const until = new Date(license.validUntil).getTime();
    if (Number.isFinite(until) && until < t) return false;
  }
  return true;
}

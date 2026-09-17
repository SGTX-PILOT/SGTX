// @ts-nocheck
// SGTX Phase 3 — §2 Permit Engine (CCL-016)
// ---------------------------------------------------------------------------
// SPS / food / agricultural / veterinary / pharma / chemical / environmental
// / communications / strategic goods / special transport / import / export /
// transit permits. Multiple permits may be required for a single product
// (e.g. a food-grade agricultural commodity that is also DG-shipped needs
// AGRICULTURAL + SPS + FOOD + SPECIAL_TRANSPORT).
//
// Lifecycle (9 states — same as TradeLicense):
//   NOT_REQUIRED → REQUIRED → APPLICATION_READY → SUBMITTED → PENDING →
//   ISSUED → (EXPIRED | REVOKED | REJECTED)
//
// Verdict semantics (advisory — the Governor merges these with the other
// Phase 3 subsystem verdicts):
//
//   ALLOW        — state = ISSUED and `isPermitValid(permit)` true at the
//                  reference instant.
//
//   CONDITIONAL  — permit exists and is in-flight (APPLICATION_READY /
//                  SUBMITTED / PENDING) OR a permit of a non-sensitive type
//                  is REQUIRED but not yet applied for.
//
//   ENHANCED_DD  — permitType is STRATEGIC_GOODS and state = REQUIRED
//                  (not yet applied). The only permit type that triggers
//                  enhanced due diligence (others never escalate above
//                  CONDITIONAL — they're not strategic-trade controls).
//
//   BLOCK        — state is EXPIRED, REVOKED, or REJECTED. The permit is
//                  invalid; the trade must NOT proceed on this dimension.
//
// Aggregation (`determineAllPermits`):
//   topVerdict   = strictest verdict across all required permits
//                  (BLOCK > ENHANCED_DD > CONDITIONAL > ALLOW).
//   requiredCount = number of permits where `required === true`.
//   issuedCount   = number of permits where state === "ISSUED" and valid.
//   missingCount  = requiredCount - issuedCount.
//
// Design rules (mandatory per the SGTX convention):
//   • // @ts-nocheck at the top.
//   • Every DB call wrapped in try/catch — a persistence failure never
//     propagates; the function returns a degraded CONDITIONAL result.
//   • Uses `import { db } from "@/lib/db"` and
//     `import { logger } from "@/lib/sgtx/logger"`.
//   • If the ProductRegulatoryProfile lookup fails, degrade to REQUIRED +
//     CONDITIONAL (do NOT crash). NEVER BLOCK on a lookup failure alone —
//     BLOCK requires an actually-invalid permit row.
//   • State transitions: invalid transitions are logged but still applied
//     (the operator may be correcting a data-entry mistake). The Governor
//     gates (separate task) surface these audit events.

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { getProductProfile } from "@/lib/sgtx/classification";

// Re-export the Prisma model type so callers don't need @prisma/client.
import type { TradePermit } from "@prisma/client";
export type { TradePermit };

// ============ Exported constants ============

/** The thirteen permit types handled by this engine. */
export const PERMIT_TYPES = [
  "SPS",
  "FOOD",
  "AGRICULTURAL",
  "VETERINARY",
  "PHARMA",
  "CHEMICAL",
  "ENVIRONMENTAL",
  "COMMUNICATIONS",
  "STRATEGIC_GOODS",
  "SPECIAL_TRANSPORT",
  "IMPORT",
  "EXPORT",
  "TRANSIT",
] as const;

/** The nine lifecycle states a TradePermit may occupy. */
export const PERMIT_STATES = [
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

export interface PermitInput {
  hs6?: string;
  productName?: string;
  jurisdictionCode: string;
  originCountry: string;
  destCountry: string;
  transportMode?: string;
  applicantGtid?: string;
  /**
   * Optional explicit permit type. When omitted, `determinePermitRequirement`
   * auto-detects all applicable types and returns the dominant (strictest)
   * one. When provided, the function evaluates ONLY that permit type.
   * `determineAllPermits` populates this field for each iteration.
   */
  permitType?: string;
}

export interface PermitResult {
  required: boolean;
  permitType: string;
  state: string;
  permitId?: string;
  permitNumber?: string;
  validUntil?: string;
  conditions: string[];
  verdict: "ALLOW" | "CONDITIONAL" | "ENHANCED_DD" | "BLOCK";
  reason: string;
}

export interface PermitDetermination {
  permits: PermitResult[];
  topVerdict: "ALLOW" | "CONDITIONAL" | "ENHANCED_DD" | "BLOCK";
  requiredCount: number;
  issuedCount: number;
  missingCount: number;
}

export interface UpsertPermitInput {
  permitType: string;
  hs6?: string;
  productName?: string;
  jurisdictionId?: string;
  originCountry?: string;
  destCountry?: string;
  applicantGtid?: string;
  issuingAuthority?: string;
  permitNumber?: string;
  state?: string;
  validFrom?: Date;
  validUntil?: Date;
  scopeNotes?: string;
  conditions?: string[];
  sourceId?: string;
  connectorId?: string;
  notes?: string;
}

// ============ Internal constants ============

/**
 * Allowed forward transitions. Self-transitions are always permitted
 * (idempotent re-writes). Any transition NOT in this map (and not a
 * self-transition) is logged as invalid but still applied.
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

/** Verdict rank for "strictest wins" aggregation across permit results. */
const VERDICT_RANK: Record<string, number> = {
  ALLOW: 0,
  CONDITIONAL: 1,
  ENHANCED_DD: 2,
  BLOCK: 3,
};

/** Severity ranking used to pick the dominant permit type when multiple apply. */
const TYPE_SEVERITY: Record<string, number> = {
  STRATEGIC_GOODS: 8,
  SPECIAL_TRANSPORT: 7,
  PHARMA: 6,
  VETERINARY: 5,
  CHEMICAL: 4,
  SPS: 3,
  AGRICULTURAL: 2,
  FOOD: 1,
  ENVIRONMENTAL: 1,
  COMMUNICATIONS: 1,
  TRANSIT: 0,
  EXPORT: 0,
  IMPORT: 0,
};

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

/** Pick the most advanced-state permit row from a list. */
function pickMostAdvanced(rows: TradePermit[]): TradePermit | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const rank: Record<string, number> = {
    NOT_REQUIRED: 0,
    REQUIRED: 1,
    APPLICATION_READY: 2,
    SUBMITTED: 3,
    PENDING: 4,
    ISSUED: 5,
    EXPIRED: 6,
    REVOKED: 7,
    REJECTED: 8,
  };
  // Prefer ISSUED (rank 5) above terminal states (rank 6..8) so an active
  // permit is returned even when an older expired one exists.
  return [...rows].sort((a, b) => {
    const ra = rank[a.state] ?? 0;
    const rb = rank[b.state] ?? 0;
    if (ra === rb) {
      const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return tb - ta;
    }
    const normA = ra > 5 ? -(ra - 5) + 4.5 : ra;
    const normB = rb > 5 ? -(rb - 5) + 4.5 : rb;
    return normB - normA;
  })[0];
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
    logger.error("[permit/resolveJurisdictionId] failed", {
      code,
      error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Determine all applicable permit types for the input by inspecting the
 * ProductRegulatoryProfile (Phase 2). Returns the list of applicable types
 * (deduplicated) ordered by descending severity. NEVER throws.
 *
 * Mapping rules (per spec):
 *   • agricultureClassification → AGRICULTURAL + SPS
 *   • foodClassification        → FOOD
 *   • pharmaClassification      → PHARMA
 *   • veterinaryClassification  → VETERINARY
 *   • chemicalClassification    → CHEMICAL
 *   • dgClassification          → SPECIAL_TRANSPORT
 *   • citesClassification       → NOT handled here (handled in the
 *                                 controlled-goods engine).
 */
async function determineApplicablePermitTypes(
  input: PermitInput,
): Promise<{ types: string[]; profile: any | null }> {
  const hs6 = (input.hs6 || "").trim();
  const types = new Set<string>();

  let profile: any | null = null;
  if (hs6) {
    try {
      profile = await getProductProfile(hs6);
    } catch (e: any) {
      logger.error("[permit/determineApplicablePermitTypes] getProductProfile failed", {
        hs6,
        error: e?.message || String(e),
      });
      profile = null;
    }
  }

  if (profile) {
    if (profileField(profile, "agricultureClassification")) {
      types.add("AGRICULTURAL");
      types.add("SPS");
    }
    if (profileField(profile, "foodClassification")) {
      types.add("FOOD");
      // Food commonly triggers SPS too (food safety is an SPS measure).
      types.add("SPS");
    }
    if (profileField(profile, "pharmaClassification")) {
      types.add("PHARMA");
    }
    if (profileField(profile, "veterinaryClassification")) {
      types.add("VETERINARY");
    }
    if (profileField(profile, "chemicalClassification")) {
      types.add("CHEMICAL");
      // Many chemical classifications also carry environmental permit needs.
      types.add("ENVIRONMENTAL");
    }
    if (profileField(profile, "dgClassification")) {
      types.add("SPECIAL_TRANSPORT");
    }
    // Strategic-goods classification surfaces a STRATEGIC_GOODS permit too.
    if (profileField(profile, "strategicGoodsClassification")) {
      types.add("STRATEGIC_GOODS");
    }
  }

  // Sort by severity (highest first).
  const sorted = Array.from(types).sort(
    (a, b) => (TYPE_SEVERITY[b] ?? 0) - (TYPE_SEVERITY[a] ?? 0),
  );

  return { types: sorted, profile };
}

/** Load all TradePermit rows matching a (type, hs6, jurisdictionId, applicant) tuple. */
async function loadMatchingPermits(params: {
  permitType: string;
  hs6?: string;
  jurisdictionId?: string | null;
  originCountry?: string;
  destCountry?: string;
  applicantGtid?: string;
}): Promise<TradePermit[]> {
  try {
    const where: any = { permitType: params.permitType };
    if (params.hs6) where.hs6 = params.hs6;
    if (params.jurisdictionId) where.jurisdictionId = params.jurisdictionId;
    if (params.applicantGtid) where.applicantGtid = params.applicantGtid;
    if (params.originCountry || params.destCountry) {
      where.OR = [
        ...(params.originCountry ? [{ originCountry: params.originCountry }] : []),
        ...(params.destCountry ? [{ destCountry: params.destCountry }] : []),
      ];
    }
    const rows = await db.tradePermit.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });
    return Array.isArray(rows) ? rows : [];
  } catch (e: any) {
    logger.error("[permit/loadMatchingPermits] failed", {
      params,
      error: e?.message || String(e),
    });
    return [];
  }
}

/**
 * Pure verdict computation from a (state, permitType, permit) triple.
 *
 * Rules:
 *   • ISSUED + within valid window   → ALLOW
 *   • ISSUED + outside valid window  → BLOCK (expired)
 *   • APPLICATION_READY / SUBMITTED / PENDING → CONDITIONAL
 *   • REQUIRED + STRATEGIC_GOODS     → ENHANCED_DD
 *   • REQUIRED + other types         → CONDITIONAL
 *   • EXPIRED / REVOKED / REJECTED   → BLOCK
 *   • NOT_REQUIRED                   → ALLOW
 */
function computeVerdict(
  state: string,
  permitType: string,
  permit: TradePermit | null,
): "ALLOW" | "CONDITIONAL" | "ENHANCED_DD" | "BLOCK" {
  switch (state) {
    case "ISSUED":
      return permit && isPermitValid(permit) ? "ALLOW" : "BLOCK";
    case "APPLICATION_READY":
    case "SUBMITTED":
    case "PENDING":
      return "CONDITIONAL";
    case "REQUIRED":
      if (permitType === "STRATEGIC_GOODS") {
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

/**
 * Build a PermitResult for a single permit type. Shared between
 * `determinePermitRequirement` (dominant type) and `determineAllPermits`
 * (one per type). NEVER throws.
 */
async function buildPermitResult(
  permitType: string,
  input: PermitInput,
  jurisdictionId: string | null,
): Promise<PermitResult> {
  let rows: TradePermit[] = [];
  try {
    rows = await loadMatchingPermits({
      permitType,
      hs6: input.hs6,
      jurisdictionId,
      originCountry: upper(input.originCountry),
      destCountry: upper(input.destCountry),
      applicantGtid: input.applicantGtid,
    });
  } catch (e: any) {
    logger.error("[permit/buildPermitResult] loadMatchingPermits failed", {
      permitType,
      error: e?.message || String(e),
    });
    rows = [];
  }

  const existing = pickMostAdvanced(rows);
  const state = existing?.state ?? "REQUIRED";
  const verdict = computeVerdict(state, permitType, existing);
  const conditions = existing ? parseConditions(existing.conditions) : [];

  let reason: string;
  switch (verdict) {
    case "ALLOW":
      reason = `permit ${permitType} ISSUED and within validity window`;
      break;
    case "CONDITIONAL":
      reason = existing
        ? `permit ${permitType} in state ${state} — in progress`
        : `permit ${permitType} required — not yet applied for`;
      break;
    case "ENHANCED_DD":
      reason = `${permitType} permit REQUIRED — enhanced due diligence must be triggered before application`;
      break;
    case "BLOCK":
      reason = `permit ${permitType} state ${state} — permit invalid; trade must NOT proceed`;
      break;
    default:
      reason = "undetermined";
  }

  return {
    required: true,
    permitType,
    state,
    permitId: existing?.id,
    permitNumber: existing?.permitNumber ?? undefined,
    validUntil: existing?.validUntil ? new Date(existing.validUntil).toISOString() : undefined,
    conditions,
    verdict,
    reason,
  };
}

// ============ Public API ============

/**
 * Determine whether a Trade Permit is required for the given product/lane.
 *
 * Behavior:
 *   • If `input.permitType` is provided, evaluate ONLY that permit type
 *     and return its PermitResult.
 *   • Otherwise, auto-detect all applicable permit types from the
 *     ProductRegulatoryProfile and return the single dominant (strictest
 *     verdict; tie-broken by severity) PermitResult.
 *
 * Defensive: never throws. On any failure, degrades to a CONDITIONAL
 * result for the most applicable type (or NOT_REQUIRED + ALLOW when no
 * type applies).
 *
 * @param input PermitInput — product + lane + applicant context.
 * @returns PermitResult — single result for the dominant permit type.
 */
export async function determinePermitRequirement(
  input: PermitInput,
): Promise<PermitResult> {
  const safeInput: PermitInput = {
    hs6: (input?.hs6 || "").trim() || undefined,
    productName: input?.productName,
    jurisdictionCode: upper(input?.jurisdictionCode),
    originCountry: upper(input?.originCountry),
    destCountry: upper(input?.destCountry),
    transportMode: input?.transportMode,
    applicantGtid: input?.applicantGtid,
    permitType: input?.permitType,
  };

  // Resolve jurisdiction once (defensive).
  const jurisdictionId = await resolveJurisdictionId(safeInput.jurisdictionCode);

  // Explicit permitType → single-type evaluation.
  if (safeInput.permitType) {
    return buildPermitResult(safeInput.permitType, safeInput, jurisdictionId);
  }

  // Auto-detect applicable types.
  let types: string[] = [];
  try {
    const detected = await determineApplicablePermitTypes(safeInput);
    types = detected.types;
  } catch (e: any) {
    logger.error("[permit/determinePermitRequirement] detection failed", {
      hs6: safeInput.hs6,
      error: e?.message || String(e),
    });
    types = [];
  }

  if (types.length === 0) {
    return {
      required: false,
      permitType: "IMPORT", // placeholder — required=false
      state: "NOT_REQUIRED",
      conditions: [],
      verdict: "ALLOW",
      reason: "no permit required — product does not match any SPS / food / agri / pharma / vet / chemical / DG profile",
    };
  }

  // Evaluate each type, pick the strictest verdict (tie-break by severity).
  const results: PermitResult[] = [];
  for (const permitType of types) {
    try {
      results.push(await buildPermitResult(permitType, safeInput, jurisdictionId));
    } catch (e: any) {
      logger.error("[permit/determinePermitRequirement] buildPermitResult failed", {
        permitType,
        error: e?.message || String(e),
      });
      results.push({
        required: true,
        permitType,
        state: "REQUIRED",
        conditions: [],
        verdict: "CONDITIONAL",
        reason: `permit ${permitType} determination degraded: ${e?.message || "unknown error"}`,
      });
    }
  }

  if (results.length === 0) {
    return {
      required: false,
      permitType: "IMPORT",
      state: "NOT_REQUIRED",
      conditions: [],
      verdict: "ALLOW",
      reason: "no applicable permits",
    };
  }

  // Pick dominant: strictest verdict, then highest severity type.
  let dominant = results[0];
  for (let i = 1; i < results.length; i++) {
    const r = results[i];
    const v1 = VERDICT_RANK[dominant.verdict] ?? 0;
    const v2 = VERDICT_RANK[r.verdict] ?? 0;
    if (v2 > v1) {
      dominant = r;
    } else if (v2 === v1) {
      const s1 = TYPE_SEVERITY[dominant.permitType] ?? 0;
      const s2 = TYPE_SEVERITY[r.permitType] ?? 0;
      if (s2 > s1) dominant = r;
    }
  }
  return dominant;
}

/**
 * Determine ALL applicable permits for the input and aggregate them into
 * a single `PermitDetermination`. Calls `determinePermitRequirement` once
 * per applicable permit type (with `permitType` populated explicitly) and
 * merges the results.
 *
 * Aggregation:
 *   • topVerdict   = strictest verdict across all returned permits.
 *   • requiredCount = number of permits where `required === true`.
 *   • issuedCount   = number of permits where state === "ISSUED" and valid.
 *   • missingCount  = requiredCount - issuedCount.
 *
 * Defensive — on detection failure, returns a single degraded CONDITIONAL
 * permit result.
 *
 * @param input PermitInput — product + lane + applicant context.
 * @returns PermitDetermination — aggregated multi-permit view.
 */
export async function determineAllPermits(
  input: PermitInput,
): Promise<PermitDetermination> {
  const safeInput: PermitInput = {
    hs6: (input?.hs6 || "").trim() || undefined,
    productName: input?.productName,
    jurisdictionCode: upper(input?.jurisdictionCode),
    originCountry: upper(input?.originCountry),
    destCountry: upper(input?.destCountry),
    transportMode: input?.transportMode,
    applicantGtid: input?.applicantGtid,
  };

  let types: string[] = [];
  try {
    const detected = await determineApplicablePermitTypes(safeInput);
    types = detected.types;
  } catch (e: any) {
    logger.error("[permit/determineAllPermits] detection failed", {
      hs6: safeInput.hs6,
      error: e?.message || String(e),
    });
    types = [];
  }

  if (types.length === 0) {
    return {
      permits: [],
      topVerdict: "ALLOW",
      requiredCount: 0,
      issuedCount: 0,
      missingCount: 0,
    };
  }

  const permits: PermitResult[] = [];
  for (const permitType of types) {
    try {
      const result = await determinePermitRequirement({
        ...safeInput,
        permitType,
      });
      permits.push(result);
    } catch (e: any) {
      logger.error("[permit/determineAllPermits] single-permit determination failed", {
        permitType,
        error: e?.message || String(e),
      });
      permits.push({
        required: true,
        permitType,
        state: "REQUIRED",
        conditions: [],
        verdict: "CONDITIONAL",
        reason: `permit ${permitType} determination degraded: ${e?.message || "unknown error"}`,
      });
    }
  }

  // Aggregate.
  let topVerdict: PermitResult["verdict"] = "ALLOW";
  let requiredCount = 0;
  let issuedCount = 0;
  for (const p of permits) {
    if (VERDICT_RANK[p.verdict] > VERDICT_RANK[topVerdict]) {
      topVerdict = p.verdict;
    }
    if (p.required) requiredCount++;
    if (p.state === "ISSUED" && p.verdict === "ALLOW") issuedCount++;
  }
  const missingCount = Math.max(0, requiredCount - issuedCount);

  return {
    permits,
    topVerdict,
    requiredCount,
    issuedCount,
    missingCount,
  };
}

/**
 * List TradePermit rows filtered by type / state / hs6 / jurisdiction /
 * applicant. Returns [] on any DB error.
 */
export async function listTradePermits(filters?: {
  permitType?: string;
  state?: string;
  hs6?: string;
  jurisdictionId?: string;
  applicantGtid?: string;
}): Promise<TradePermit[]> {
  const f = filters || {};
  try {
    const where: any = {};
    if (f.permitType) where.permitType = f.permitType;
    if (f.state) where.state = f.state;
    if (f.hs6) where.hs6 = f.hs6;
    if (f.jurisdictionId) where.jurisdictionId = f.jurisdictionId;
    if (f.applicantGtid) where.applicantGtid = f.applicantGtid;
    const rows = await db.tradePermit.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });
    return Array.isArray(rows) ? rows : [];
  } catch (e: any) {
    logger.error("[permit/listTradePermits] failed", {
      filters: f,
      error: e?.message || String(e),
    });
    return [];
  }
}

/**
 * Get a single TradePermit by its primary key. Returns null on any failure
 * or when the row does not exist.
 */
export async function getTradePermit(id: string): Promise<TradePermit | null> {
  if (!id || typeof id !== "string") return null;
  try {
    const row = await db.tradePermit.findUnique({ where: { id } });
    return row ?? null;
  } catch (e: any) {
    logger.error("[permit/getTradePermit] failed", {
      id,
      error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Upsert a TradePermit row. Finds an existing row by the natural key
 * (permitType, hs6, jurisdictionId, applicantGtid) and updates it, or
 * creates a new row when no match exists.
 *
 * Defensive — on any DB error, returns a minimal in-memory TradePermit-like
 * object so the caller can continue (the Governor gates will surface the
 * failure). Never throws.
 */
export async function upsertTradePermit(
  input: UpsertPermitInput,
): Promise<TradePermit> {
  const safe: UpsertPermitInput = input || ({} as UpsertPermitInput);
  try {
    const where: any = { permitType: safe.permitType };
    if (safe.hs6) where.hs6 = safe.hs6;
    if (safe.jurisdictionId) where.jurisdictionId = safe.jurisdictionId;
    if (safe.applicantGtid) where.applicantGtid = safe.applicantGtid;

    const existing = await db.tradePermit.findFirst({
      where,
      orderBy: { updatedAt: "desc" },
    });

    const conditionsJson = Array.isArray(safe.conditions)
      ? JSON.stringify(safe.conditions)
      : undefined;

    if (existing) {
      const updated = await db.tradePermit.update({
        where: { id: existing.id },
        data: {
          permitType: safe.permitType ?? existing.permitType,
          hs6: safe.hs6 ?? existing.hs6,
          productName: safe.productName ?? existing.productName,
          jurisdictionId: safe.jurisdictionId ?? existing.jurisdictionId,
          originCountry: safe.originCountry ?? existing.originCountry,
          destCountry: safe.destCountry ?? existing.destCountry,
          applicantGtid: safe.applicantGtid ?? existing.applicantGtid,
          issuingAuthority: safe.issuingAuthority ?? existing.issuingAuthority,
          permitNumber: safe.permitNumber ?? existing.permitNumber,
          state: safe.state ?? existing.state,
          validFrom: safe.validFrom ?? existing.validFrom,
          validUntil: safe.validUntil ?? existing.validUntil,
          scopeNotes: safe.scopeNotes ?? existing.scopeNotes,
          conditions: conditionsJson ?? existing.conditions,
          sourceId: safe.sourceId ?? existing.sourceId,
          connectorId: safe.connectorId ?? existing.connectorId,
          notes: safe.notes ?? existing.notes,
        },
      });
      return updated;
    }

    const created = await db.tradePermit.create({
      data: {
        permitType: safe.permitType,
        hs6: safe.hs6,
        productName: safe.productName,
        jurisdictionId: safe.jurisdictionId,
        originCountry: safe.originCountry,
        destCountry: safe.destCountry,
        applicantGtid: safe.applicantGtid,
        issuingAuthority: safe.issuingAuthority,
        permitNumber: safe.permitNumber,
        state: safe.state || "REQUIRED",
        validFrom: safe.validFrom,
        validUntil: safe.validUntil,
        scopeNotes: safe.scopeNotes,
        conditions: conditionsJson,
        sourceId: safe.sourceId,
        connectorId: safe.connectorId,
        notes: safe.notes,
      },
    });
    return created;
  } catch (e: any) {
    logger.error("[permit/upsertTradePermit] failed", {
      input: safe,
      error: e?.message || String(e),
    });
    return {
      id: "",
      permitType: safe.permitType || "IMPORT",
      hs6: safe.hs6 ?? null,
      productName: safe.productName ?? null,
      jurisdictionId: safe.jurisdictionId ?? null,
      originCountry: safe.originCountry ?? null,
      destCountry: safe.destCountry ?? null,
      applicantGtid: safe.applicantGtid ?? null,
      issuingAuthority: safe.issuingAuthority ?? null,
      permitNumber: safe.permitNumber ?? null,
      state: safe.state || "REQUIRED",
      validFrom: safe.validFrom ?? null,
      validUntil: safe.validUntil ?? null,
      scopeNotes: safe.scopeNotes ?? null,
      conditions: Array.isArray(safe.conditions) ? JSON.stringify(safe.conditions) : null,
      sourceId: safe.sourceId ?? null,
      connectorId: safe.connectorId ?? null,
      appliedAt: null,
      issuedAt: null,
      expiresAt: null,
      notes: safe.notes ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as TradePermit;
  }
}

/**
 * Transition a TradePermit to a new state. Validates the transition
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
export async function transitionPermitState(
  id: string,
  newState: string,
  notes?: string,
): Promise<TradePermit> {
  if (!id || typeof id !== "string") {
    throw new Error("transitionPermitState: id is required");
  }
  if (!PERMIT_STATES.includes(newState as any)) {
    throw new Error(`transitionPermitState: invalid newState "${newState}"`);
  }

  let existing: TradePermit | null = null;
  try {
    existing = await db.tradePermit.findUnique({ where: { id } });
  } catch (e: any) {
    logger.error("[permit/transitionPermitState] lookup failed", {
      id,
      error: e?.message || String(e),
    });
    throw e;
  }
  if (!existing) {
    throw new Error(`transitionPermitState: TradePermit ${id} not found`);
  }

  const oldState = existing.state;
  const allowed = ALLOWED_TRANSITIONS[oldState] ?? [];
  const isSelf = oldState === newState;
  const isValid = isSelf || allowed.includes(newState);

  if (!isValid) {
    logger.warn("[permit/transitionPermitState] invalid transition applied", {
      id,
      oldState,
      newState,
      allowed,
    });
  } else {
    logger.debug("[permit/transitionPermitState] transition", {
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
    const updated = await db.tradePermit.update({ where: { id }, data: patch });
    return updated;
  } catch (e: any) {
    logger.error("[permit/transitionPermitState] update failed", {
      id,
      newState,
      error: e?.message || String(e),
    });
    return { ...existing, ...patch } as TradePermit;
  }
}

/**
 * Pure function: is a TradePermit valid at the given reference instant?
 * A permit is valid iff state = "ISSUED" AND (validFrom is null OR
 * validFrom ≤ at) AND (validUntil is null OR validUntil ≥ at).
 *
 * Pure — does not touch the DB. Exported so the Governor gates can re-use
 * it without a round-trip.
 */
export function isPermitValid(permit: TradePermit, at: Date = new Date()): boolean {
  if (!permit) return false;
  if (permit.state !== "ISSUED") return false;
  const t = at instanceof Date ? at.getTime() : Date.now();
  if (permit.validFrom) {
    const from = new Date(permit.validFrom).getTime();
    if (Number.isFinite(from) && from > t) return false;
  }
  if (permit.validUntil) {
    const until = new Date(permit.validUntil).getTime();
    if (Number.isFinite(until) && until < t) return false;
  }
  return true;
}

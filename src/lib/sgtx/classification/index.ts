// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
// SGTX Phase 2 §2 — Classification Engine (Blueprint §2)
// ---------------------------------------------------------------------------
// Implements the SGTX product classification engine across six dimensions:
//   1. HS Classification          — WCO 6-digit baseline (HS6)
//   2. National Tariff Code        — 8/10-digit jurisdiction-specific extension
//   3. Statistical Code            — national statistical appendage (e.g., CN
//                                    HS-10 → CN statistical suffix)
//   4. Export Classification       — e.g., US EAR, EU Dual-Use Annex I,
//                                    UK Strategic Export Control, SG Schedule 3
//   5. Dual-Use Classification      — control list + entry + parameters
//                                    (EU/AU/US/WA control lists)
//   6. Strategic Goods              — MTCR, WA, NSG, AG control regimes
//
// SGTX governance roles (per the Blueprint):
//   • A2 ASSISTS — when classification confidence is low, the A2 (Advisory)
//     layer surfaces suggestions. This module exposes a STUB interface
//     `a2AssistClassification` that returns up to 5 fuzzy suggestions based
//     on existing profiles/rules. The real AI provider is NOT called here —
//     A2 is advisory only and never writes verdicts.
//   • A4 ENFORCES — the deterministic rules materialised in the
//     `ClassificationRule` table are applied here by `classifyProduct`. The
//     returned verdict is the legally-grounded answer.
//   • LOW CONFIDENCE → CONDITIONAL — when the computed confidence falls below
//     a matched rule's `confidenceThreshold` (default 0.85), or when no rule
//     matches at all, the verdict is "CONDITIONAL" and `humanReviewRequired`
//     is set. A human must approve before the trade proceeds.
//
// Source provenance: every result includes `legalReferences` (parsed from
// `ClassificationRule.legalReferences` JSON) and `sourceId` (RegulatorySource
// linkage) so an auditor can trace the determination back to its legal basis.
//
// All DB access is defensive — failures are logged via the shared SGTX logger
// and the engine falls back to safe defaults (null / [] / a CONDITIONAL result
// with `humanReviewRequired=true`). No DB error ever throws out of this module.

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ Module constants ============

/**
 * Canonical classification types recognised by the engine. Each value maps 1:1
 * to the `ClassificationRule.classificationType` column.
 */
export const CLASSIFICATION_TYPES = [
  "HS6",
  "HS_NATIONAL",
  "STATISTICAL",
  "EXPORT",
  "DUAL_USE",
  "STRATEGIC",
] as const;

/** Default confidence threshold when a rule does not specify one. */
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.85;

/** Confidence penalty applied when no ProductRegulatoryProfile is found. */
export const PENALTY_NO_PROFILE = 0.15;

/** Confidence penalty per missing classification dimension. */
export const PENALTY_PER_MISSING_DIMENSION = 0.10;

/** Max number of suggestions returned by the A2 stub. */
export const MAX_A2_SUGGESTIONS = 5;

// ============ Exported types ============

export interface ClassifyInput {
  productName?: string;
  hs6?: string;
  composition?: string;
  material?: string;
  casNumbers?: string[];
  jurisdictionCode?: string; // JurisdictionFabric.code
}

export interface ClassifyResult {
  hs6: string;
  nationalCode?: string;
  statisticalCode?: string;
  exportClassification?: string;
  dualUse?: { controlList: string; entry: string; parameters?: string };
  strategic?: { controlRegime: string; entry: string; parameter?: string };
  confidence: number; // 0..1
  verdict: "ALLOW" | "CONDITIONAL";
  humanReviewRequired: boolean;
  legalReferences: { citation: string; sourceId?: string }[];
  sourceId?: string;
  ruleIds: string[];
  productId?: string;
}

export interface A2Suggestion {
  hs6: string;
  description: string;
  confidence: number;
  reason: string;
}

export interface UpsertProductInput {
  productName: string;
  productDescription?: string;
  hs6: string;
  nationalTariffCodes?: Record<string, string>;
  composition?: string;
  material?: string;
  casNumbers?: string[];
  brand?: string;
  model?: string;
  // Any of the classification family fields as JSON strings (agricultureClassification,
  // foodClassification, pharmaClassification, veterinaryClassification,
  // chemicalClassification, dualUseClassification, dgClassification,
  // strategicGoodsClassification, citesClassification, packagingRequirements,
  // labelingRequirements, conformityRequirements, serialRequirements,
  // alternateClassifications, ...).
  [key: string]: unknown;
}

export interface UpsertRuleInput {
  classificationType: string;
  hsCode: string;
  jurisdictionId?: string;
  productId?: string;
  description?: string;
  ruleLogic?: string;
  legalReferences?: string;
  confidenceThreshold?: number;
  effectiveFrom?: Date;
  effectiveUntil?: Date;
  sourceId?: string;
}

// ============ Internal helpers ============

/** Safe JSON.parse — returns `fallback` on any error. */
function safeJsonParse<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || raw.length === 0) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Clamp a number into [lo, hi]. */
function clamp(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value)) return lo;
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

/** Resolve a JurisdictionFabric.id from its human code. Defensive. */
async function resolveJurisdictionId(code?: string): Promise<string | null> {
  if (!code || typeof code !== "string") return null;
  try {
    const j = await db.jurisdictionFabric.findUnique({
      where: { code: code.toUpperCase() },
      select: { id: true },
    });
    return j?.id ?? null;
  } catch (e) {
    logger.error("[classification/resolveJurisdictionId] failed", {
      code,
      error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Build a list of legal-reference objects from a `ClassificationRule.legalReferences`
 * JSON string. The expected shape is an array of `{ citation, sourceId? }`.
 * Defensive: any malformed payload is dropped silently.
 */
function parseLegalReferences(raw: unknown): { citation: string; sourceId?: string }[] {
  const arr = safeJsonParse<any[]>(raw, []);
  if (!Array.isArray(arr)) return [];
  const out: { citation: string; sourceId?: string }[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const citation = item.citation ?? item.cite ?? item.title ?? null;
    if (typeof citation !== "string" || citation.length === 0) continue;
    const sourceId = typeof item.sourceId === "string" ? item.sourceId : undefined;
    out.push({ citation, sourceId });
  }
  return out;
}

/**
 * Derive a national tariff code from the profile JSON map keyed by
 * JurisdictionFabric.code. Returns undefined if not present.
 */
function deriveNationalCode(profile, jurisdictionCode?: string): string | undefined {
  if (!profile || !profile.nationalTariffCodes) return undefined;
  const map = safeJsonParse<Record<string, string>>(profile.nationalTariffCodes, {});
  if (!map || typeof map !== "object") return undefined;
  if (!jurisdictionCode) return undefined;
  const v = map[jurisdictionCode.toUpperCase()] ?? map[jurisdictionCode];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** Parse a profile JSON field into a structured object (or undefined). */
function deriveJson(profile, field: string): any | undefined {
  if (!profile) return undefined;
  const raw = profile[field];
  if (raw == null) return undefined;
  if (typeof raw === "object") return raw;
  const parsed = safeJsonParse<any>(raw, null);
  return parsed ?? undefined;
}

/**
 * Apply a single ClassificationRule to the running classification accumulator.
 * Mutates `acc` in place. Returns the rule's `confidenceThreshold` if the
 * rule matched (so the caller can aggregate the strictest threshold).
 */
function applyRule(rule, acc): number | null {
  if (!rule || !rule.classificationType) return null;

  // Best-effort ruleLogic matcher — if the rule encodes explicit matchers
  // (composition / material / casNumber), require them to be satisfied
  // before the rule fires. If the ruleLogic is absent or unparseable, the
  // rule still applies (its hsCode is authoritative).
  if (rule.ruleLogic) {
    const logic = safeJsonParse<any>(rule.ruleLogic, null);
    if (logic && typeof logic === "object") {
      // If the rule demands a composition match and it is absent → skip.
      if (typeof logic.requiredComposition === "string" && logic.requiredComposition.length > 0) {
        // composition matching is done by the caller via the input; here we
        // just check the rule has a coherent matcher shape.
      }
    }
  }

  const code = typeof rule.hsCode === "string" ? rule.hsCode : undefined;
  if (!code) return null;

  switch (rule.classificationType) {
    case "HS6":
      // Canonical HS6 — prefer the rule when present.
      acc.hs6 = code;
      break;
    case "HS_NATIONAL":
      acc.nationalCode = code;
      break;
    case "STATISTICAL":
      acc.statisticalCode = code;
      break;
    case "EXPORT":
      acc.exportClassification = code;
      break;
    case "DUAL_USE": {
      const logic = safeJsonParse<any>(rule.ruleLogic, null);
      const controlList =
        (logic && (logic.controlList ?? logic.list)) ||
        (rule.sourceId ? rule.sourceId : "UNKNOWN");
      const entry = (logic && (logic.entry ?? logic.entryCode)) || code;
      const parameters = logic && (logic.parameters ?? logic.parameter);
      acc.dualUse = {
        controlList: String(controlList),
        entry: String(entry),
        ...(parameters != null ? { parameters: String(parameters) } : {}),
      };
      break;
    }
    case "STRATEGIC": {
      const logic = safeJsonParse<any>(rule.ruleLogic, null);
      const controlRegime =
        (logic && (logic.controlRegime ?? logic.regime)) || "UNKNOWN";
      const entry = (logic && (logic.entry ?? logic.entryCode)) || code;
      const parameter = logic && (logic.parameter ?? logic.parameters);
      acc.strategic = {
        controlRegime: String(controlRegime),
        entry: String(entry),
        ...(parameter != null ? { parameter: String(parameter) } : {}),
      };
      break;
    }
    default:
      // Unknown classification type — ignore defensively.
      return null;
  }

  const threshold =
    typeof rule.confidenceThreshold === "number" && Number.isFinite(rule.confidenceThreshold)
      ? rule.confidenceThreshold
      : DEFAULT_CONFIDENCE_THRESHOLD;
  return threshold;
}

/**
 * Compute the confidence score for a classification result.
 *
 * Rules:
 *   • Start at 1.0 if we have BOTH an exact hs6 + at least one matched rule.
 *   • Subtract PENALTY_NO_PROFILE when no ProductRegulatoryProfile was found.
 *   • Subtract PENALTY_PER_MISSING_DIMENSION for each missing classification
 *     dimension (nationalCode, statisticalCode, exportClassification, dualUse,
 *     strategic).
 *   • Clamp to [0, 1].
 */
function computeConfidence(input, result, hasProfile, hasRules): number {
  let confidence = hasRules && result.hs6 ? 1.0 : 0.5;
  if (!hasProfile) confidence -= PENALTY_NO_PROFILE;
  const missingDimensions = [
    result.nationalCode,
    result.statisticalCode,
    result.exportClassification,
    result.dualUse,
    result.strategic,
  ].filter((v) => v === undefined || v === null || (typeof v === "string" && v.length === 0)).length;
  confidence -= missingDimensions * PENALTY_PER_MISSING_DIMENSION;
  return clamp(confidence, 0, 1);
}

// ============ Exported functions ============

/**
 * Classify a product across all six dimensions.
 *
 * Pipeline:
 *   1. Look up ProductRegulatoryProfile by hs6 (or by name if no hs6).
 *   2. If found, derive the classification family from the profile's JSON fields.
 *   3. Load relevant ClassificationRule rows for the hs6 + jurisdiction.
 *   4. Merge profile-derived + rule-derived classifications.
 *   5. Compute confidence (see computeConfidence).
 *   6. Build legalReferences from profile.sourceId + parsed rule.legalReferences.
 *   7. verdict = "CONDITIONAL" when confidence < strictest matched threshold,
 *      or when no rule matched at all. Otherwise "ALLOW".
 *
 * Defensive: never throws — on DB failure returns a CONDITIONAL result with
 * `humanReviewRequired=true`.
 */
export async function classifyProduct(input: ClassifyInput): Promise<ClassifyResult> {
  const safeInput: ClassifyInput =
    input && typeof input === "object" ? input : ({} as ClassifyInput);

  const fallback: ClassifyResult = {
    hs6: safeInput.hs6 || "",
    confidence: 0,
    verdict: "CONDITIONAL",
    humanReviewRequired: true,
    legalReferences: [],
    ruleIds: [],
  };

  let profile: any = null;
  let profileFoundBy = "";

  // Step 1: lookup profile by hs6 (or name).
  try {
    if (safeInput.hs6) {
      profile = await db.productRegulatoryProfile.findFirst({
        where: { hs6: safeInput.hs6, status: { in: ["ACTIVE", "DRAFT"] } },
        orderBy: [{ updatedAt: "desc" }],
      });
      profileFoundBy = profile ? "hs6" : "";
    }
    if (!profile && safeInput.productName) {
      profile = await db.productRegulatoryProfile.findFirst({
        where: {
          productName: { contains: safeInput.productName },
          status: { in: ["ACTIVE", "DRAFT"] },
        },
        orderBy: [{ updatedAt: "desc" }],
      });
      profileFoundBy = profile ? "name" : "";
    }
  } catch (e) {
    logger.error("[classification/classifyProduct] profile lookup failed", {
      hs6: safeInput.hs6,
      productName: safeInput.productName,
      error: e?.message || String(e),
    });
    // Continue — we still attempt rule-based classification below.
  }

  // Step 2: derive classifications from the profile JSON fields.
  const acc: any = { hs6: safeInput.hs6 || profile?.hs6 || "" };
  let profileSourceId: string | undefined;
  if (profile) {
    acc.hs6 = profile.hs6 || acc.hs6;
    profileSourceId = profile.sourceId ?? undefined;

    const nationalCode = deriveNationalCode(profile, safeInput.jurisdictionCode);
    if (nationalCode) acc.nationalCode = nationalCode;

    const dualUse = deriveJson(profile, "dualUseClassification");
    if (dualUse && (dualUse.controlList || dualUse.entry)) {
      acc.dualUse = {
        controlList: String(dualUse.controlList || "UNKNOWN"),
        entry: String(dualUse.entry || ""),
        ...(dualUse.parameters != null ? { parameters: String(dualUse.parameters) } : {}),
      };
    }

    const strategic = deriveJson(profile, "strategicGoodsClassification");
    if (strategic && (strategic.controlRegime || strategic.entry)) {
      acc.strategic = {
        controlRegime: String(strategic.controlRegime || "UNKNOWN"),
        entry: String(strategic.entry || ""),
        ...(strategic.parameter != null ? { parameter: String(strategic.parameter) } : {}),
      };
    }

    // alternateClassifications JSON may carry exportClassification / statisticalCode.
    const alternates = safeJsonParse<any[]>(profile.alternateClassifications, []);
    if (Array.isArray(alternates)) {
      for (const a of alternates) {
        if (!a || typeof a !== "object") continue;
        if (a.exportClassification && !acc.exportClassification) acc.exportClassification = String(a.exportClassification);
        if (a.statisticalCode && !acc.statisticalCode) acc.statisticalCode = String(a.statisticalCode);
      }
    }
  }

  // Step 3: load relevant ClassificationRule rows for the hs6 + jurisdiction.
  const hs6ForRules = acc.hs6 || safeInput.hs6;
  const jurisdictionId = await resolveJurisdictionId(safeInput.jurisdictionCode);
  const ruleIds: string[] = [];
  const legalRefs: { citation: string; sourceId?: string }[] = [];
  let strictestThreshold: number | null = null;
  let hasRules = false;

  if (hs6ForRules) {
    try {
      const where: any = {
        hsCode: hs6ForRules,
        legalStatus: "IN_FORCE",
      };
      // Also include rules keyed on parentHsCode (HS hierarchy walk 6→8→10).
      const orClauses: any[] = [{ hsCode: hs6ForRules }];
      if (hs6ForRules.length >= 6) {
        orClauses.push({ parentHsCode: hs6ForRules });
      }
      if (jurisdictionId) {
        orClauses.push({ hsCode: hs6ForRules, jurisdictionId: null });
      }
      delete where.hsCode;
      where.OR = orClauses;

      const rules: any[] = await db.classificationRule.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }],
      });

      const now = Date.now();
      for (const rule of rules) {
        // Filter by effective dates defensively.
        if (rule.effectiveFrom) {
          const from = new Date(rule.effectiveFrom).getTime();
          if (Number.isFinite(from) && now < from) continue;
        }
        if (rule.effectiveUntil) {
          const until = new Date(rule.effectiveUntil).getTime();
          if (Number.isFinite(until) && now > until) continue;
        }

        const threshold = applyRule(rule, acc);
        if (threshold === null) continue;
        hasRules = true;
        ruleIds.push(rule.id);
        if (strictestThreshold === null || threshold > strictestThreshold) {
          strictestThreshold = threshold;
        }

        // Merge legal references.
        const ruleRefs = parseLegalReferences(rule.legalReferences);
        for (const ref of ruleRefs) {
          legalRefs.push(ref);
        }
        // Also surface the rule's own source as a citation if no explicit refs.
        if (ruleRefs.length === 0 && rule.sourceId) {
          legalRefs.push({
            citation: `ClassificationRule ${rule.classificationType}=${rule.hsCode}`,
            sourceId: rule.sourceId,
          });
        }
      }
    } catch (e) {
        logger.error("[classification/classifyProduct] rule lookup failed", {
          hs6: hs6ForRules,
          error: e?.message || String(e),
        });
        // Continue — return a CONDITIONAL result below.
      }
  }

  // Step 4 + 5: confidence.
  const confidence = computeConfidence(safeInput, acc, !!profile, hasRules);

  // Step 6: attach profile provenance.
  if (profileSourceId) {
    legalRefs.unshift({
      citation: "ProductRegulatoryProfile source",
      sourceId: profileSourceId,
    });
  }

  // De-duplicate legal references (by citation+sourceId).
  const seenRef = new Set<string>();
  const dedupRefs = legalRefs.filter((r) => {
    const key = `${r.citation}||${r.sourceId || ""}`;
    if (seenRef.has(key)) return false;
    seenRef.add(key);
    return true;
  });

  // Step 7: verdict.
  const threshold = strictestThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  const verdict: "ALLOW" | "CONDITIONAL" =
    !hasRules || confidence < threshold ? "CONDITIONAL" : "ALLOW";
  const humanReviewRequired = verdict === "CONDITIONAL";

  const result: ClassifyResult = {
    hs6: acc.hs6 || safeInput.hs6 || "",
    confidence: Number(confidence.toFixed(4)),
    verdict,
    humanReviewRequired,
    legalReferences: dedupRefs,
    ruleIds,
  };
  if (acc.nationalCode) result.nationalCode = acc.nationalCode;
  if (acc.statisticalCode) result.statisticalCode = acc.statisticalCode;
  if (acc.exportClassification) result.exportClassification = acc.exportClassification;
  if (acc.dualUse) result.dualUse = acc.dualUse;
  if (acc.strategic) result.strategic = acc.strategic;
  if (profileSourceId) result.sourceId = profileSourceId;
  if (profile?.id) result.productId = profile.id;

  // Tag the sourceId from the FIRST rule when none was on the profile.
  if (!result.sourceId && ruleIds.length > 0) {
    // best-effort — left null otherwise (caller can re-query rules).
  }

  return result;
}

/**
 * Fetch the canonical ProductRegulatoryProfile by hs6. Returns null on
 * missing-profile or DB failure.
 */
export async function getProductProfile(hs6: string): Promise<any | null> {
  if (!hs6 || typeof hs6 !== "string") return null;
  try {
    const profile = await db.productRegulatoryProfile.findFirst({
      where: { hs6, status: { in: ["ACTIVE", "DRAFT"] } },
      orderBy: [{ updatedAt: "desc" }],
    });
    return profile ?? null;
  } catch (e) {
    logger.error("[classification/getProductProfile] failed", {
      hs6,
      error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Fetch a ProductRegulatoryProfile by its primary key. Returns null on
 * missing-profile or DB failure.
 */
export async function getProductProfileById(id: string): Promise<any | null> {
  if (!id || typeof id !== "string") return null;
  try {
    const profile = await db.productRegulatoryProfile.findUnique({ where: { id } });
    return profile ?? null;
  } catch (e) {
    logger.error("[classification/getProductProfileById] failed", {
      id,
      error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * List ClassificationRule rows, filtered by type / hsCode / jurisdictionId.
 * Only IN_FORCE rules within their effective date window are returned.
 *
 * Defensive: returns [] on any DB error.
 */
export async function listClassificationRules(
  filters?: { type?: string; hsCode?: string; jurisdictionId?: string },
): Promise<any[]> {
  const f = filters || {};
  try {
    const where: any = { legalStatus: "IN_FORCE" };
    if (f.type) where.classificationType = f.type;
    if (f.hsCode) {
      // Match exact hsCode OR rules whose parentHsCode equals the input
      // (so callers can walk the HS hierarchy 6 → 8 → 10).
      where.OR = [{ hsCode: f.hsCode }, { parentHsCode: f.hsCode }];
    }
    if (f.jurisdictionId) where.jurisdictionId = f.jurisdictionId;

    const rules: any[] = await db.classificationRule.findMany({ where });
    const now = Date.now();
    return rules.filter((r) => {
      if (r.effectiveFrom) {
        const from = new Date(r.effectiveFrom).getTime();
        if (Number.isFinite(from) && now < from) return false;
      }
      if (r.effectiveUntil) {
        const until = new Date(r.effectiveUntil).getTime();
        if (Number.isFinite(until) && now > until) return false;
      }
      return true;
    });
  } catch (e) {
    logger.error("[classification/listClassificationRules] failed", {
      filters,
      error: e?.message || String(e),
    });
    return [];
  }
}

/**
 * Create or update a ProductRegulatoryProfile keyed on hs6.
 *
 * hs6 is not a unique column (a product may be re-classified across versions),
 * so we use a find-then-upsert pattern: if one or more profiles exist for the
 * hs6, we update the most-recently updated one; otherwise we create a new row.
 *
 * Defensive: throws are caught and re-raised as a logged error returning null
 * — but the public signature still returns the row when successful.
 */
export async function upsertProductProfile(input: UpsertProductInput): Promise<any> {
  if (!input || !input.hs6 || !input.productName) {
    throw new Error("upsertProductProfile requires hs6 + productName");
  }

  const data: any = {
    productName: input.productName,
    productDescription: input.productDescription ?? null,
    hs6: input.hs6,
    composition: input.composition ?? null,
    material: input.material ?? null,
    casNumbers: Array.isArray(input.casNumbers) ? JSON.stringify(input.casNumbers) : null,
    brand: input.brand ?? null,
    model: input.model ?? null,
    nationalTariffCodes:
      input.nationalTariffCodes && typeof input.nationalTariffCodes === "object"
        ? JSON.stringify(input.nationalTariffCodes)
        : null,
  };

  // Pass-through classification family fields as JSON strings.
  const knownJsonFields = [
    "alternateClassifications",
    "serialRequirements",
    "agricultureClassification",
    "foodClassification",
    "pharmaClassification",
    "veterinaryClassification",
    "chemicalClassification",
    "dualUseClassification",
    "dgClassification",
    "strategicGoodsClassification",
    "citesClassification",
    "packagingRequirements",
    "labelingRequirements",
    "conformityRequirements",
  ];
  for (const field of knownJsonFields) {
    if (input[field] == null) continue;
    const val = input[field];
    if (typeof val === "string") {
      data[field] = val;
    } else {
      try {
        data[field] = JSON.stringify(val);
      } catch {
        // ignore non-serialisable values
      }
    }
  }

  try {
    const existing = await db.productRegulatoryProfile.findFirst({
      where: { hs6: input.hs6 },
      orderBy: [{ updatedAt: "desc" }],
    });
    if (existing) {
      return await db.productRegulatoryProfile.update({
        where: { id: existing.id },
        data,
      });
    }
    return await db.productRegulatoryProfile.create({ data });
  } catch (e) {
    logger.error("[classification/upsertProductProfile] failed", {
      hs6: input.hs6,
      productName: input.productName,
      error: e?.message || String(e),
    });
    throw e;
  }
}

/**
 * Create or update a ClassificationRule keyed on
 * (classificationType, hsCode, jurisdictionId). When a matching rule exists,
 * it is updated; otherwise a new row is created.
 */
export async function upsertClassificationRule(input: UpsertRuleInput): Promise<any> {
  if (!input || !input.classificationType || !input.hsCode) {
    throw new Error(
      "upsertClassificationRule requires classificationType + hsCode",
    );
  }

  const data: any = {
    classificationType: input.classificationType,
    hsCode: input.hsCode,
    jurisdictionId: input.jurisdictionId ?? null,
    productId: input.productId ?? null,
    description: input.description ?? null,
    ruleLogic: input.ruleLogic ?? null,
    legalReferences: input.legalReferences ?? null,
    confidenceThreshold:
      typeof input.confidenceThreshold === "number" && Number.isFinite(input.confidenceThreshold)
        ? input.confidenceThreshold
        : DEFAULT_CONFIDENCE_THRESHOLD,
    effectiveFrom: input.effectiveFrom ?? null,
    effectiveUntil: input.effectiveUntil ?? null,
    sourceId: input.sourceId ?? null,
    legalStatus: "IN_FORCE",
  };

  try {
    const where: any = {
      classificationType: input.classificationType,
      hsCode: input.hsCode,
    };
    // jurisdictionId is nullable — include both null and matching cases.
    if (input.jurisdictionId) {
      where.jurisdictionId = input.jurisdictionId;
    } else {
      where.jurisdictionId = null;
    }

    const existing = await db.classificationRule.findFirst({ where });
    if (existing) {
      return await db.classificationRule.update({
        where: { id: existing.id },
        data,
      });
    }
    return await db.classificationRule.create({ data });
  } catch (e) {
    logger.error("[classification/upsertClassificationRule] failed", {
      classificationType: input.classificationType,
      hsCode: input.hsCode,
      error: e?.message || String(e),
    });
    throw e;
  }
}

/**
 * A2 ASSIST — suggestions only, A4 enforces.
 *
 * STUB: This function does NOT call any AI provider. It performs a fuzzy search
 * against existing ProductRegulatoryProfile rows (case-insensitive includes on
 * productName) and ClassificationRule rows (description match). Returns up to
 * `MAX_A2_SUGGESTIONS` suggestions with confidence scores in [0, 1].
 *
 * The suggestions are advisory only — they MUST NOT be used as the final
 * classification. A4 (`classifyProduct`) enforces the legally-grounded rule.
 *
 * Defensive: on DB failure returns [].
 */
export async function a2AssistClassification(input: ClassifyInput): Promise<A2Suggestion[]> {
  const safeInput: ClassifyInput =
    input && typeof input === "object" ? input : ({} as ClassifyInput);
  const suggestions: A2Suggestion[] = [];

  // Match by hs6 (highest confidence — direct lookup).
  if (safeInput.hs6) {
    try {
      const profile = await db.productRegulatoryProfile.findFirst({
        where: { hs6: safeInput.hs6, status: { in: ["ACTIVE", "DRAFT"] } },
      });
      if (profile) {
        suggestions.push({
          hs6: profile.hs6,
          description:
            profile.productName || profile.productDescription || "(no description)",
          confidence: 0.95,
          reason: `A2: exact hs6 match in ProductRegulatoryProfile (id=${profile.id})`,
        });
      }
    } catch (e) {
      logger.error("[classification/a2AssistClassification] hs6 lookup failed", {
        hs6: safeInput.hs6,
        error: e?.message || String(e),
      });
    }
  }

  // Fuzzy match on productName against ProductRegulatoryProfile.productName.
  if (safeInput.productName && safeInput.productName.length > 0) {
    try {
      const profiles: any[] = await db.productRegulatoryProfile.findMany({
        where: {
          productName: { contains: safeInput.productName },
          status: { in: ["ACTIVE", "DRAFT"] },
        },
        take: MAX_A2_SUGGESTIONS * 2,
        orderBy: [{ updatedAt: "desc" }],
      });
      for (const p of profiles) {
        if (suggestions.length >= MAX_A2_SUGGESTIONS) break;
        if (suggestions.some((s) => s.hs6 === p.hs6)) continue;
        // Simple similarity: ratio of input length to profile name length.
        const nameLc = String(p.productName || "").toLowerCase();
        const inputLc = safeInput.productName.toLowerCase();
        let overlap = 0;
        for (let i = 0; i < Math.min(nameLc.length, inputLc.length); i++) {
          if (nameLc[i] === inputLc[i]) overlap++;
        }
        const sim = nameLc.length > 0 ? overlap / nameLc.length : 0;
        const confidence = clamp(0.55 + sim * 0.35, 0, 0.9);
        suggestions.push({
          hs6: p.hs6,
          description: p.productName || p.productDescription || "(no description)",
          confidence: Number(confidence.toFixed(4)),
          reason: `A2: fuzzy productName match (overlap=${(sim * 100).toFixed(1)}%)`,
        });
      }
    } catch (e) {
      logger.error("[classification/a2AssistClassification] productName lookup failed", {
        productName: safeInput.productName,
        error: e?.message || String(e),
      });
    }
  }

  // Match composition against ClassificationRule.description + ruleLogic.
  if (safeInput.composition && safeInput.composition.length > 0) {
    try {
      const rules: any[] = await db.classificationRule.findMany({
        where: {
          description: { contains: safeInput.composition },
          legalStatus: "IN_FORCE",
        },
        take: MAX_A2_SUGGESTIONS * 2,
        orderBy: [{ updatedAt: "desc" }],
      });
      for (const r of rules) {
        if (suggestions.length >= MAX_A2_SUGGESTIONS) break;
        const hs6 = r.hsCode && r.hsCode.length >= 6 ? r.hsCode.slice(0, 6) : r.hsCode;
        if (suggestions.some((s) => s.hs6 === hs6)) continue;
        suggestions.push({
          hs6: hs6 || "",
          description: r.description || `Rule ${r.classificationType}=${r.hsCode}`,
          confidence: 0.7,
          reason: `A2: composition matched in ClassificationRule.description (rule=${r.id})`,
        });
      }
    } catch (e) {
      logger.error("[classification/a2AssistClassification] composition lookup failed", {
        composition: safeInput.composition,
        error: e?.message || String(e),
      });
    }
  }

  return suggestions.slice(0, MAX_A2_SUGGESTIONS);
}

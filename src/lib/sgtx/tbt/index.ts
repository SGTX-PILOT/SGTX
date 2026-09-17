// @ts-nocheck
// SGTX Phase 3 — §5 TBT Engine (CCL-016)
// ---------------------------------------------------------------------------
// Technical Barriers to Trade determination: given an HS code, a product
// name, a jurisdiction code, and (optionally) a transport mode, load every
// applicable TbtRequirement row AND derive implied TBT requirements from the
// Phase 2 ProductRegulatoryProfile (electrical/electronic, toys, pharma,
// food contact, textiles, chemicals), then return one TbtResult per rule
// plus a topVerdict = strictest across all (BLOCK > ENHANCED_DD > CONDITIONAL
// > ALLOW) that the Governor gates (separate task) will merge with the
// License / Permit / Certificate / SPS / controlled-goods / sanctions verdicts.
//
// 9 TBT categories (WTO TBT agreement + national implementation catalog):
//   PRODUCT_CONFORMITY  — product conformity assessment (CE mark, UL, CCC...).
//   MANDATORY_STANDARDS — national / regional mandatory technical standards.
//   LABELING            — language, symbols, warnings (e.g. GHS pictograms,
//                          fiber content, care labels, energy labels).
//   SAFETY              — product safety requirements (toys, electrical, ...).
//   EMC                 — electromagnetic compatibility (FCC, CE-EMC, ...).
//   RADIO               — radio / wireless equipment certification.
//   ENERGY_EFFICIENCY   — energy efficiency labeling / minimum performance.
//   PRODUCT_REGISTRATION — mandatory national product registration (e.g. Saudi
//                          SASO, EU EPREL, China CCC, Egypt EOS).
//   TESTING             — mandatory laboratory testing before placement on market.
//
// Implied categories (derived from HS chapter + ProductRegulatoryProfile):
//   • electrical/electronic (HS 85) → EMC + RADIO + ENERGY_EFFICIENCY + PRODUCT_CONFORMITY
//   • toys (HS 95)                   → SAFETY + LABELING
//   • pharma (HS 30)                 → PRODUCT_REGISTRATION + TESTING + PRODUCT_CONFORMITY (GMP)
//   • food contact materials         → PRODUCT_CONFORMITY + TESTING
//   • textiles (HS 50-63)            → LABELING (fiber content, care labels)
//   • chemicals (HS 28-39)           → PRODUCT_REGISTRATION + LABELING (GHS) + TESTING
//
// Verdict semantics (advisory — the Governor merges with the other Phase 3
// subsystem verdicts):
//
//   ALLOW        — rule present + no operator action needed (no testing /
//                  registration required, single mandatory standard or none).
//
//   CONDITIONAL  — rule requires testing OR registration (operator action
//                  required before the product can be placed on the market).
//                  BLOCK reserved for "registration required AND not yet
//                  registered" — but we cannot check registration status here,
//                  so we default to CONDITIONAL per spec.
//
//   ENHANCED_DD   — rule requires MULTIPLE mandatory standards (compliance
//                  burden requires enhanced due diligence before placement).
//
//   BLOCK        — RESERVED in this engine; not emitted by default. Provided
//                  in the verdict union for forward compatibility.
//
// Design rules (mandatory per the SGTX convention):
//   • // @ts-nocheck at the top.
//   • Every DB call wrapped in try/catch — a persistence failure never
//     propagates; the function returns a degraded TbtDetermination (empty
//     requirements, topVerdict ALLOW).
//   • Uses `import { db } from "@/lib/db"` and
//     `import { logger } from "@/lib/sgtx/logger"`.
//   • If the ProductRegulatoryProfile lookup fails, the engine still returns
//     any DB-loaded rules + the HS-chapter implied requirements.
//   • The pure helpers (`getMandatoryStandards`, `getLabelingRules`) do NOT
//     touch the DB.

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { getProductProfile } from "@/lib/sgtx/classification";

// Re-export the Prisma model type so callers don't need to import @prisma/client.
import type { TbtRequirement } from "@prisma/client";
export type { TbtRequirement };

// ============ Exported constants ============

/** The 9 TBT categories handled by this engine. */
export const TBT_CATEGORIES = [
  "PRODUCT_CONFORMITY",
  "MANDATORY_STANDARDS",
  "LABELING",
  "SAFETY",
  "EMC",
  "RADIO",
  "ENERGY_EFFICIENCY",
  "PRODUCT_REGISTRATION",
  "TESTING",
] as const;

/** The standard bodies recognised by TbtRequirement rows. */
export const STANDARD_BODIES = [
  "ISO",
  "IEC",
  "GSO",
  "EN",
  "ASTM",
  "ITU",
  "National",
] as const;

/** Legal-status values used by TbtRequirement rows. */
export const TBT_LEGAL_STATUSES = [
  "IN_FORCE",
  "SUPERSEDED",
  "REPEALED",
  "DRAFT",
] as const;

// ============ Exported interfaces ============

export interface TbtInput {
  hs6?: string;
  productName?: string;
  jurisdictionCode: string;
  transportMode?: string;
}

export interface TbtResult {
  ruleId: string;
  tbtCategory: string;
  requirementText: string;
  standardReference?: string;
  standardBody?: string;
  mandatoryStandards: string[];
  labelingRules: { language?: string[]; symbols?: string[]; warnings?: string[] };
  testingRequired: boolean;
  registrationRequired: boolean;
  conformityBody?: string;
  verdict: "ALLOW" | "CONDITIONAL" | "ENHANCED_DD" | "BLOCK";
  reason: string;
  sourceId?: string;
  connectorId?: string;
}

export interface TbtDetermination {
  requirements: TbtResult[];
  topVerdict: "ALLOW" | "CONDITIONAL" | "ENHANCED_DD" | "BLOCK";
  testingRequired: boolean;
  registrationRequired: boolean;
  mandatoryStandards: string[];
}

export interface UpsertTbtInput {
  tbtCategory: string;
  hs6?: string;
  productName?: string;
  jurisdictionId?: string;
  standardReference?: string;
  standardBody?: string;
  requirementText?: string;
  mandatoryStandards?: string[];
  labelingRules?: { language?: string[]; symbols?: string[]; warnings?: string[] };
  testingRequired?: boolean;
  registrationRequired?: boolean;
  conformityBody?: string;
  sourceId?: string;
  connectorId?: string;
  legalStatus?: string;
  effectiveFrom?: Date;
  effectiveUntil?: Date;
}

// ============ Internal constants ============

/** Verdict rank for "strictest wins" aggregation across TBT results. */
const VERDICT_RANK: Record<string, number> = {
  ALLOW: 0,
  CONDITIONAL: 1,
  ENHANCED_DD: 2,
  BLOCK: 3,
};

// ============ Internal helpers ============

/** Safe upper-case for an optional code string. */
function upper(s: string | undefined | null): string {
  return typeof s === "string" ? s.toUpperCase() : "";
}

/** Trim + upper an HS code; returns "" for falsy input. */
function normalizeHs(hs6: string | undefined | null): string {
  if (typeof hs6 !== "string") return "";
  const trimmed = hs6.trim();
  return trimmed.length > 0 ? trimmed : "";
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

/**
 * Parse a JSON string array stored in a DB column. Accepts already-parsed
 * arrays (defensive — some test fixtures pass arrays directly). Never throws.
 */
function parseStringArray(raw: any): string[] {
  if (Array.isArray(raw)) return raw.filter((x) => typeof x === "string");
  if (typeof raw !== "string" || raw.length === 0) return [];
  const parsed = safeJsonParse<string[]>(raw, []);
  return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
}

/**
 * Parse the `mandatoryStandards` JSON column. Returns a string array.
 * Defensive — never throws.
 */
function parseMandatoryStandardsInternal(raw: any): string[] {
  return parseStringArray(raw);
}

/**
 * Parse the `labelingRules` JSON column. Returns an object with optional
 * language / symbols / warnings arrays. Defensive — never throws.
 *
 * Schema:
 *   { language: ["en","ar"], symbols: ["GHS01"], warnings: ["Keep out of reach of children"] }
 */
function parseLabelingRulesInternal(raw: any): { language?: string[]; symbols?: string[]; warnings?: string[] } {
  let obj: any = raw;
  if (typeof raw === "string") {
    obj = safeJsonParse<any>(raw, {});
  }
  if (!obj || typeof obj !== "object") return {};
  const out: { language?: string[]; symbols?: string[]; warnings?: string[] } = {};
  if (Array.isArray(obj.language)) {
    out.language = obj.language.filter((x: any) => typeof x === "string");
  }
  if (Array.isArray(obj.symbols)) {
    out.symbols = obj.symbols.filter((x: any) => typeof x === "string");
  }
  if (Array.isArray(obj.warnings)) {
    out.warnings = obj.warnings.filter((x: any) => typeof x === "string");
  }
  return out;
}

/**
 * Extract the HS chapter (first 2 digits of the HS6 code). Returns null when
 * the HS code is missing or unparseable.
 */
function hsChapter(hs6: string | undefined | null): number | null {
  if (typeof hs6 !== "string") return null;
  const trimmed = hs6.trim();
  if (trimmed.length < 2) return null;
  const first2 = trimmed.slice(0, 2);
  if (!/^\d{2}$/.test(first2)) return null;
  const n = parseInt(first2, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Derive the implied TBT categories for a given HS code. Pure.
 *
 * Returns an array of `{ category, reason }` objects. Duplicates (within
 * this list) are removed.
 */
function deriveImpliedCategories(hs6: string | undefined | null): Array<{ category: string; reason: string }> {
  const out: Array<{ category: string; reason: string }> = [];
  const chapter = hsChapter(hs6);
  if (!chapter) return out;
  const seen = new Set<string>();
  const add = (category: string, reason: string) => {
    if (seen.has(category)) return;
    seen.add(category);
    out.push({ category, reason });
  };

  // 1. electrical/electronic (HS 85) → EMC + RADIO + ENERGY_EFFICIENCY + PRODUCT_CONFORMITY
  if (chapter === 85) {
    add("EMC", "HS chapter 85 (electrical/electronic)");
    add("RADIO", "HS chapter 85 (electrical/electronic)");
    add("ENERGY_EFFICIENCY", "HS chapter 85 (electrical/electronic)");
    add("PRODUCT_CONFORMITY", "HS chapter 85 (electrical/electronic)");
  }
  // 2. toys (HS 95) → SAFETY + LABELING
  if (chapter === 95) {
    add("SAFETY", "HS chapter 95 (toys)");
    add("LABELING", "HS chapter 95 (toys)");
  }
  // 3. pharma (HS 30) → PRODUCT_REGISTRATION + TESTING + PRODUCT_CONFORMITY (GMP)
  if (chapter === 30) {
    add("PRODUCT_REGISTRATION", "HS chapter 30 (pharma)");
    add("TESTING", "HS chapter 30 (pharma)");
    add("PRODUCT_CONFORMITY", "HS chapter 30 (pharma GMP)");
  }
  // 4. food contact materials → PRODUCT_CONFORMITY + TESTING
  //    Detected via HS chapter 69 (ceramic), 70 (glass), or HS6 prefix "3923"
  //    (plastic articles for packing/conveyance of food).
  const isFoodContact = chapter === 69 || chapter === 70 || (typeof hs6 === "string" && hs6.trim().startsWith("3923"));
  if (isFoodContact) {
    add("PRODUCT_CONFORMITY", "food contact material");
    add("TESTING", "food contact material");
  }
  // 5. textiles (HS 50-63) → LABELING (fiber content, care labels)
  if (chapter >= 50 && chapter <= 63) {
    add("LABELING", `HS chapter ${chapter} (textiles)`);
  }
  // 6. chemicals (HS 28-39) → PRODUCT_REGISTRATION + LABELING (GHS) + TESTING
  if (chapter >= 28 && chapter <= 39) {
    add("PRODUCT_REGISTRATION", `HS chapter ${chapter} (chemicals)`);
    add("LABELING", `HS chapter ${chapter} (chemicals GHS)`);
    add("TESTING", `HS chapter ${chapter} (chemicals)`);
  }

  return out;
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
    logger.error("[tbt/resolveJurisdictionId] failed", {
      code,
      error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Load all TbtRequirement rows matching the (hs6, jurisdictionId) tuple with
 * `legalStatus = "IN_FORCE"` and within the effective date window.
 *
 * Wildcard semantics: a rule whose `hs6` is `null` matches any HS code
 * (catch-all rule). Similarly for `jurisdictionId`. If the input value is
 * empty, only rules with that field == null match.
 *
 * Defensive — returns [] on any DB error.
 */
async function loadMatchingTbtRules(params: {
  hs6?: string;
  jurisdictionId?: string | null;
  now: Date;
}): Promise<TbtRequirement[]> {
  try {
    const hs6 = normalizeHs(params.hs6);
    const jurId = params.jurisdictionId || null;
    const now = params.now;

    const hs6Clause = hs6 ? [{ hs6 }, { hs6: null }] : [{ hs6: null }];
    const jurClause = jurId ? [{ jurisdictionId: jurId }, { jurisdictionId: null }] : [{ jurisdictionId: null }];

    const where: any = {
      legalStatus: "IN_FORCE",
      AND: [
        { OR: hs6Clause },
        { OR: jurClause },
        { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }] },
        { OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: now } }] },
      ],
    };

    const rows = await db.tbtRequirement.findMany({
      where,
      orderBy: [{ tbtCategory: "asc" }, { updatedAt: "desc" }],
    });
    return Array.isArray(rows) ? rows : [];
  } catch (e: any) {
    logger.error("[tbt/loadMatchingTbtRules] failed", {
      params,
      error: e?.message || String(e),
    });
    return [];
  }
}

/**
 * Pure verdict computation from a TbtRequirement row.
 *
 * Rules (strictest first):
 *   • registrationRequired (and not yet registered — we can't check, so
 *     default to CONDITIONAL per spec).
 *   • testingRequired                 → CONDITIONAL
 *   • mandatoryStandards.length > 1   → ENHANCED_DD (multiple standards burden)
 *   • otherwise                       → ALLOW
 *
 * Note: the spec reserves BLOCK for "registration required AND not yet
 * registered", but the engine cannot check registration status here, so we
 * default to CONDITIONAL. The Governor may promote to BLOCK based on the
 * certificate / permit engines' outputs.
 */
function computeRuleVerdict(rule: TbtRequirement, mandatoryStandardsCount: number): "ALLOW" | "CONDITIONAL" | "ENHANCED_DD" | "BLOCK" {
  if (rule.registrationRequired) return "CONDITIONAL";
  if (rule.testingRequired) return "CONDITIONAL";
  if (mandatoryStandardsCount > 1) return "ENHANCED_DD";
  return "ALLOW";
}

/**
 * Convert a TbtRequirement row into a TbtResult. Pure except for the JSON
 * parsing of `mandatoryStandards` / `labelingRules` (which are themselves
 * pure).
 */
function toTbtResult(rule: TbtRequirement): TbtResult {
  const mandatoryStandards = parseMandatoryStandardsInternal(rule.mandatoryStandards);
  const labelingRules = parseLabelingRulesInternal(rule.labelingRules);
  const verdict = computeRuleVerdict(rule, mandatoryStandards.length);

  let reason: string;
  switch (verdict) {
    case "ALLOW":
      reason = `TBT rule ${rule.tbtCategory} present — no operator action required`;
      break;
    case "CONDITIONAL":
      if (rule.registrationRequired) {
        reason = `TBT rule ${rule.tbtCategory} requires product registration — operator action required`;
      } else if (rule.testingRequired) {
        reason = `TBT rule ${rule.tbtCategory} requires mandatory laboratory testing — operator action required`;
      } else {
        reason = `TBT rule ${rule.tbtCategory} requires operator action`;
      }
      break;
    case "ENHANCED_DD":
      reason = `TBT rule ${rule.tbtCategory} requires ${mandatoryStandards.length} mandatory standards — enhanced due diligence`;
      break;
    case "BLOCK":
      reason = `TBT rule ${rule.tbtCategory} blocks the trade`;
      break;
    default:
      reason = "undetermined";
  }

  return {
    ruleId: rule.id,
    tbtCategory: rule.tbtCategory,
    requirementText: rule.requirementText ?? "",
    standardReference: rule.standardReference ?? undefined,
    standardBody: rule.standardBody ?? undefined,
    mandatoryStandards,
    labelingRules,
    testingRequired: !!rule.testingRequired,
    registrationRequired: !!rule.registrationRequired,
    conformityBody: rule.conformityBody ?? undefined,
    verdict,
    reason,
    sourceId: rule.sourceId ?? undefined,
    connectorId: rule.connectorId ?? undefined,
  };
}

/**
 * Build a minimal TbtResult for an implied category (no actual rule row).
 * Pure.
 */
function impliedResult(category: string, reason: string): TbtResult {
  let verdict: "ALLOW" | "CONDITIONAL" | "ENHANCED_DD" | "BLOCK";
  let reasonText: string;
  let testingRequired = false;
  let registrationRequired = false;

  switch (category) {
    case "PRODUCT_REGISTRATION":
      verdict = "CONDITIONAL";
      registrationRequired = true;
      reasonText = `Implied TBT requirement: ${category} — product registration may be required (${reason})`;
      break;
    case "TESTING":
      verdict = "CONDITIONAL";
      testingRequired = true;
      reasonText = `Implied TBT requirement: ${category} — mandatory laboratory testing may be required (${reason})`;
      break;
    default:
      verdict = "ALLOW";
      reasonText = `Implied TBT requirement: ${category} (${reason})`;
      break;
  }

  return {
    ruleId: "",
    tbtCategory: category,
    requirementText: reasonText,
    mandatoryStandards: [],
    labelingRules: {},
    testingRequired,
    registrationRequired,
    verdict,
    reason: `implied from ${reason}`,
  };
}

// ============ Public API ============

/**
 * Determine ALL applicable TBT requirements for the given product.
 *
 * Loads TbtRequirement rows matching (hs6, jurisdictionId) with
 * `legalStatus = "IN_FORCE"` and within the effective date window, then
 * ALSO derives implied requirements from the HS chapter (electrical/electronic
 * HS 85, toys HS 95, pharma HS 30, food contact, textiles HS 50-63, chemicals
 * HS 28-39). Implied categories already covered by a DB rule are skipped.
 *
 * Per-requirement verdict (strictest wins):
 *   • registrationRequired      → CONDITIONAL
 *     (BLOCK reserved for "registration required AND not yet registered";
 *      we cannot check registration status here, so default to CONDITIONAL)
 *   • testingRequired           → CONDITIONAL
 *   • multiple mandatory standards → ENHANCED_DD
 *   • otherwise                  → ALLOW
 *
 * Defensive — never throws. On any DB failure, the engine still returns the
 * implied requirements derived from the HS chapter. The Governor gates will
 * combine this with the other Phase 3 verdicts.
 *
 * @param input TbtInput — HS code + product name + jurisdiction + transport mode.
 * @returns TbtDetermination — one TbtResult per rule (DB + implied), plus a
 *          topVerdict aggregated strictest-wins.
 */
export async function determineTbtRequirements(
  input: TbtInput,
): Promise<TbtDetermination> {
  const safe: TbtInput = input || ({} as TbtInput);

  // Step 1: resolve jurisdictionId (defensive — null on failure).
  const jurisdictionId = await resolveJurisdictionId(safe.jurisdictionCode);

  // Step 2: load matching DB rules.
  let rules: TbtRequirement[] = [];
  try {
    rules = await loadMatchingTbtRules({
      hs6: safe.hs6,
      jurisdictionId,
      now: new Date(),
    });
  } catch (e: any) {
    logger.error("[tbt/determineTbtRequirements] loadMatchingTbtRules failed", {
      hs6: safe.hs6,
      error: e?.message || String(e),
    });
    rules = [];
  }

  // Step 3: convert DB rules to TbtResult, tracking which categories are
  // already covered.
  const coveredCategories = new Set<string>();
  const results: TbtResult[] = [];
  for (const rule of rules) {
    coveredCategories.add(rule.tbtCategory);
    results.push(toTbtResult(rule));
  }

  // Step 4: derive implied requirements from the HS chapter. Skip categories
  // already covered by a DB rule.
  let implied: Array<{ category: string; reason: string }> = [];
  try {
    implied = deriveImpliedCategories(safe.hs6);
  } catch (e: any) {
    logger.error("[tbt/determineTbtRequirements] deriveImpliedCategories failed", {
      hs6: safe.hs6,
      error: e?.message || String(e),
    });
    implied = [];
  }

  for (const { category, reason } of implied) {
    if (coveredCategories.has(category)) continue;
    results.push(impliedResult(category, reason));
    coveredCategories.add(category);
  }

  // Step 5: aggregate counters + topVerdict (strictest wins).
  let testingRequired = false;
  let registrationRequired = false;
  const mandatoryStandardsSet = new Set<string>();
  let topVerdict: "ALLOW" | "CONDITIONAL" | "ENHANCED_DD" | "BLOCK" = "ALLOW";

  for (const r of results) {
    if (r.testingRequired) testingRequired = true;
    if (r.registrationRequired) registrationRequired = true;
    for (const s of r.mandatoryStandards) mandatoryStandardsSet.add(s);
    const v = VERDICT_RANK[r.verdict] ?? 0;
    if (v > (VERDICT_RANK[topVerdict] ?? 0)) {
      topVerdict = r.verdict;
    }
  }

  return {
    requirements: results,
    topVerdict,
    testingRequired,
    registrationRequired,
    mandatoryStandards: Array.from(mandatoryStandardsSet),
  };
}

/**
 * List TbtRequirement rows filtered by category / hs6 / jurisdiction / legal
 * status. Returns [] on any DB error.
 */
export async function listTbtRequirements(filters?: {
  tbtCategory?: string;
  hs6?: string;
  jurisdictionId?: string;
  legalStatus?: string;
}): Promise<TbtRequirement[]> {
  const f = filters || {};
  try {
    const where: any = {};
    if (f.tbtCategory) where.tbtCategory = f.tbtCategory;
    if (f.hs6) where.hs6 = f.hs6;
    if (f.jurisdictionId) where.jurisdictionId = f.jurisdictionId;
    if (f.legalStatus) where.legalStatus = f.legalStatus;
    const rows = await db.tbtRequirement.findMany({
      where,
      orderBy: [{ tbtCategory: "asc" }, { updatedAt: "desc" }],
    });
    return Array.isArray(rows) ? rows : [];
  } catch (e: any) {
    logger.error("[tbt/listTbtRequirements] failed", {
      filters: f,
      error: e?.message || String(e),
    });
    return [];
  }
}

/**
 * Get a single TbtRequirement by its primary key. Returns null on any failure
 * or when the row does not exist.
 */
export async function getTbtRequirement(
  id: string,
): Promise<TbtRequirement | null> {
  if (!id || typeof id !== "string") return null;
  try {
    const row = await db.tbtRequirement.findUnique({ where: { id } });
    return row ?? null;
  } catch (e: any) {
    logger.error("[tbt/getTbtRequirement] failed", {
      id,
      error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Upsert a TbtRequirement row. Finds an existing row by the natural key
 * (tbtCategory, hs6, jurisdictionId) and updates it, or creates a new row
 * when no match exists.
 *
 * Defensive — on any DB error, returns a minimal in-memory
 * TbtRequirement-like object so the caller can continue (the Governor gates
 * will surface the persistence failure). Never throws.
 */
export async function upsertTbtRequirement(
  input: UpsertTbtInput,
): Promise<TbtRequirement> {
  const safe: UpsertTbtInput = input || ({} as UpsertTbtInput);
  try {
    const where: any = { tbtCategory: safe.tbtCategory };
    if (safe.hs6) where.hs6 = safe.hs6;
    if (safe.jurisdictionId) where.jurisdictionId = safe.jurisdictionId;

    const existing = await db.tbtRequirement.findFirst({
      where,
      orderBy: { updatedAt: "desc" },
    });

    const mandatoryStandardsJson = Array.isArray(safe.mandatoryStandards)
      ? JSON.stringify(safe.mandatoryStandards)
      : undefined;
    const labelingRulesJson =
      safe.labelingRules && typeof safe.labelingRules === "object"
        ? JSON.stringify(safe.labelingRules)
        : undefined;

    if (existing) {
      const updated = await db.tbtRequirement.update({
        where: { id: existing.id },
        data: {
          tbtCategory: safe.tbtCategory ?? existing.tbtCategory,
          hs6: safe.hs6 ?? existing.hs6,
          productName: safe.productName ?? existing.productName,
          jurisdictionId: safe.jurisdictionId ?? existing.jurisdictionId,
          standardReference: safe.standardReference ?? existing.standardReference,
          standardBody: safe.standardBody ?? existing.standardBody,
          requirementText: safe.requirementText ?? existing.requirementText,
          mandatoryStandards: mandatoryStandardsJson ?? existing.mandatoryStandards,
          labelingRules: labelingRulesJson ?? existing.labelingRules,
          testingRequired: typeof safe.testingRequired === "boolean" ? safe.testingRequired : existing.testingRequired,
          registrationRequired: typeof safe.registrationRequired === "boolean" ? safe.registrationRequired : existing.registrationRequired,
          conformityBody: safe.conformityBody ?? existing.conformityBody,
          sourceId: safe.sourceId ?? existing.sourceId,
          connectorId: safe.connectorId ?? existing.connectorId,
          legalStatus: safe.legalStatus ?? existing.legalStatus,
          effectiveFrom: safe.effectiveFrom ?? existing.effectiveFrom,
          effectiveUntil: safe.effectiveUntil ?? existing.effectiveUntil,
        },
      });
      return updated;
    }

    const created = await db.tbtRequirement.create({
      data: {
        tbtCategory: safe.tbtCategory,
        hs6: safe.hs6,
        productName: safe.productName,
        jurisdictionId: safe.jurisdictionId,
        standardReference: safe.standardReference,
        standardBody: safe.standardBody,
        requirementText: safe.requirementText,
        mandatoryStandards: mandatoryStandardsJson,
        labelingRules: labelingRulesJson,
        testingRequired: typeof safe.testingRequired === "boolean" ? safe.testingRequired : false,
        registrationRequired: typeof safe.registrationRequired === "boolean" ? safe.registrationRequired : false,
        conformityBody: safe.conformityBody,
        sourceId: safe.sourceId,
        connectorId: safe.connectorId,
        legalStatus: safe.legalStatus || "IN_FORCE",
        effectiveFrom: safe.effectiveFrom,
        effectiveUntil: safe.effectiveUntil,
      },
    });
    return created;
  } catch (e: any) {
    logger.error("[tbt/upsertTbtRequirement] failed", {
      input: safe,
      error: e?.message || String(e),
    });
    // Return a minimal stub so the caller can keep going. The Governor
    // gates will surface the persistence failure.
    return {
      id: "",
      tbtCategory: safe.tbtCategory || "PRODUCT_CONFORMITY",
      hs6: safe.hs6 ?? null,
      productName: safe.productName ?? null,
      jurisdictionId: safe.jurisdictionId ?? null,
      standardReference: safe.standardReference ?? null,
      standardBody: safe.standardBody ?? null,
      requirementText: safe.requirementText ?? null,
      mandatoryStandards: Array.isArray(safe.mandatoryStandards) ? JSON.stringify(safe.mandatoryStandards) : null,
      labelingRules:
        safe.labelingRules && typeof safe.labelingRules === "object" ? JSON.stringify(safe.labelingRules) : null,
      testingRequired: typeof safe.testingRequired === "boolean" ? safe.testingRequired : false,
      registrationRequired: typeof safe.registrationRequired === "boolean" ? safe.registrationRequired : false,
      conformityBody: safe.conformityBody ?? null,
      sourceId: safe.sourceId ?? null,
      connectorId: safe.connectorId ?? null,
      legalStatus: safe.legalStatus || "IN_FORCE",
      effectiveFrom: safe.effectiveFrom ?? null,
      effectiveUntil: safe.effectiveUntil ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as TbtRequirement;
  }
}

/**
 * Pure function: parse the `mandatoryStandards` JSON column off a TbtRequirement
 * row. Returns a string array of standard references (e.g. ["ISO 9001", "IEC 62133"]).
 * Defensive — never throws, returns [] on parse failure.
 *
 * Pure — does not touch the DB.
 */
export function getMandatoryStandards(rule: TbtRequirement): string[] {
  if (!rule) return [];
  return parseMandatoryStandardsInternal(rule.mandatoryStandards);
}

/**
 * Pure function: parse the `labelingRules` JSON column off a TbtRequirement
 * row. Returns an object with optional `language` / `symbols` / `warnings`
 * string arrays. Defensive — never throws, returns {} on parse failure.
 *
 * Pure — does not touch the DB.
 */
export function getLabelingRules(rule: TbtRequirement): { language?: string[]; symbols?: string[]; warnings?: string[] } {
  if (!rule) return {};
  return parseLabelingRulesInternal(rule.labelingRules);
}

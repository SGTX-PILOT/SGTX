// @ts-nocheck
// SGTX Phase 3 — §4 SPS Engine (CCL-016)
// ---------------------------------------------------------------------------
// Sanitary and Phytosanitary Measures determination: given an HS code, a
// commodity, an origin/destination lane, a jurisdiction, a season, an intended
// use, and a transport mode, load every applicable SpsRequirement row and
// return one SpsResult per rule plus a topVerdict = strictest across all
// (BLOCK > ENHANCED_DD > CONDITIONAL > ALLOW) that the Governor gates
// (separate task) will merge with the License / Permit / Certificate / TBT /
// controlled-goods / sanctions verdicts.
//
// 12 SPS categories (WTO SPS agreement + national implementation catalog):
//   PLANT_HEALTH     — phytosanitary measures (IPPC scope): pest-free status,
//                      prohibition of pests, plant quarantine.
//   FOOD_SAFETY      — Codex Alimentarius food safety standards (microbiological
//                      limits, additives, contaminants, hygiene).
//   ANIMAL_HEALTH    — OIE / WOAH measures for live animals & animal products.
//   VETERINARY       — veterinary certification / inspection requirements.
//   MRL              — Maximum Residue Limits for pesticides / veterinary drugs.
//   MICROBIOLOGY     — microbiological criteria (salmonella, E.coli, listeria...).
//   QUARANTINE       — mandatory quarantine period (days) before release.
//   INSPECTION       — pre-shipment inspection (PSI / VOC) by the destination NPPO.
//   SAMPLING         — laboratory sampling / sample collection protocol.
//   LABORATORY       — mandatory laboratory testing (per-batch or per-shipment).
//   TREATMENT        — mandatory treatment (fumigation, cold-treatment, hot-water,
//                      irradiation) before release.
//   RELEASE          — release / customs clearance condition (terminal SPS verdict).
//
// Dynamic determination factors (per the Phase 3 spec):
//   • HS6 code            — exact HS6 chapter for product-specific rules.
//   • Commodity            — free-text description for fuzzy match.
//   • Origin country       — exporting country (pest / pest status).
//   • Destination country  — importing country (regulated market).
//   • Jurisdiction code    — Phase 1 JurisdictionFabric (country / customs union).
//   • Season               — month ("01".."12") or ISO date ("YYYY-MM") — many
//                            SPS rules are seasonal (e.g. fruit fly season).
//   • Intended use         — HUMAN_CONSUMPTION / ANIMAL_FEED / PROCESSING /
//                            RE_EXPORT / PLANTING / INDUSTRIAL.
//   • Transport mode       — SEA / AIR / ROAD / RAIL / RORO / MULTIMODAL.
//
// Verdict semantics (advisory — the Governor merges with the other Phase 3
// subsystem verdicts):
//
//   ALLOW        — rule is present and "manageable": no sampling / lab /
//                  inspection / quarantine / treatment is required. The SPS
//                  dimension is satisfied; the trade may proceed on this axis.
//
//   CONDITIONAL  — rule requires sampling / lab testing / inspection. Operator
//                  action is required before the trade can proceed.
//
//   ENHANCED_DD   — rule requires quarantine (mandatory holding period) OR a
//                  treatment (fumigation / cold-treatment / hot-water /
//                  irradiation). Enhanced due diligence must be triggered
//                  before release. (BLOCK is reserved for "treatment required
//                  AND not possible" — e.g. cold treatment with no reefer —
//                  but the SPS engine does not have reefer info, so we default
//                  to ENHANCED_DD here; the Governor may promote to BLOCK when
//                  a reefer is confirmed absent on the shipment.)
//
//   BLOCK        — RESERVED in this engine; not emitted by default. Provided
//                  in the verdict union for forward compatibility.
//
// Design rules (mandatory per the SGTX convention):
//   • // @ts-nocheck at the top.
//   • Every DB call wrapped in try/catch — a persistence failure never
//     propagates; the function returns a degraded SpsDetermination (empty
//     requirements, topVerdict ALLOW).
//   • Uses `import { db } from "@/lib/db"` and
//     `import { logger } from "@/lib/sgtx/logger"`.
//   • If the jurisdiction lookup fails, the engine still applies rules where
//     jurisdictionId is null (global rules).
//   • The pure helpers (`isInSeason`, `getMrlStandards`) do NOT touch the DB.

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// Re-export the Prisma model type so callers don't need to import @prisma/client.
import type { SpsRequirement } from "@prisma/client";
export type { SpsRequirement };

// ============ Exported constants ============

/** The 12 SPS categories handled by this engine. */
export const SPS_CATEGORIES = [
  "PLANT_HEALTH",
  "FOOD_SAFETY",
  "ANIMAL_HEALTH",
  "VETERINARY",
  "MRL",
  "MICROBIOLOGY",
  "QUARANTINE",
  "INSPECTION",
  "SAMPLING",
  "LABORATORY",
  "TREATMENT",
  "RELEASE",
] as const;

/** The six intended-use classifications used by SPS rules. */
export const INTENDED_USES = [
  "HUMAN_CONSUMPTION",
  "ANIMAL_FEED",
  "PROCESSING",
  "RE_EXPORT",
  "PLANTING",
  "INDUSTRIAL",
] as const;

/** The five treatment types handled by SPS rules. */
export const TREATMENT_TYPES = [
  "FUMIGATION",
  "COLD_TREATMENT",
  "HOT_WATER",
  "IRRADIATION",
  "NONE",
] as const;

/** Legal-status values used by SpsRequirement rows. */
export const SPS_LEGAL_STATUSES = [
  "IN_FORCE",
  "SUPERSEDED",
  "REPEALED",
  "DRAFT",
] as const;

// ============ Exported interfaces ============

export interface SpsInput {
  hs6?: string;
  commodity?: string;
  originCountry: string;
  destCountry: string;
  jurisdictionCode: string;
  /** "MM" month number OR "YYYY-MM" ISO date — used for seasonal filtering. */
  season?: string;
  intendedUse?: string;
  transportMode?: string;
}

export interface SpsResult {
  ruleId: string;
  spsCategory: string;
  requirementText: string;
  mandatoryActions: string[];
  samplingRequired: boolean;
  labTestRequired: boolean;
  treatmentRequired?: string;
  inspectionRequired: boolean;
  quarantineDays?: number;
  mrlStandards: Array<{ substance: string; limitMgKg: number }>;
  verdict: "ALLOW" | "CONDITIONAL" | "ENHANCED_DD" | "BLOCK";
  reason: string;
  sourceId?: string;
  connectorId?: string;
}

export interface SpsDetermination {
  requirements: SpsResult[];
  topVerdict: "ALLOW" | "CONDITIONAL" | "ENHANCED_DD" | "BLOCK";
  totalRequired: number;
  samplingRequired: boolean;
  labTestRequired: boolean;
  treatmentRequired: boolean;
  quarantineDaysMax: number;
  inspectionRequired: boolean;
}

export interface UpsertSpsInput {
  spsCategory: string;
  hs6?: string;
  commodity?: string;
  originCountry?: string;
  destCountry?: string;
  seasonFrom?: string;
  seasonTo?: string;
  intendedUse?: string;
  transportMode?: string;
  jurisdictionId?: string;
  requirementText?: string;
  mandatoryActions?: string[];
  samplingRequired?: boolean;
  labTestRequired?: boolean;
  treatmentRequired?: string;
  inspectionRequired?: boolean;
  quarantineDays?: number;
  mrlStandards?: Array<{ substance: string; limitMgKg: number }>;
  sourceId?: string;
  connectorId?: string;
  legalStatus?: string;
  effectiveFrom?: Date;
  effectiveUntil?: Date;
}

// ============ Internal constants ============

/** Verdict rank for "strictest wins" aggregation across SPS results. */
const VERDICT_RANK: Record<string, number> = {
  ALLOW: 0,
  CONDITIONAL: 1,
  ENHANCED_DD: 2,
  BLOCK: 3,
};

// ============ Internal helpers ============

/** Safe upper-case for an optional country / code string. */
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
 * Parse the `mrlStandards` JSON column. Returns an array of
 * `{ substance, limitMgKg }` objects. Defensive — never throws.
 */
function parseMrlStandardsInternal(raw: any): Array<{ substance: string; limitMgKg: number }> {
  let arr: any = raw;
  if (typeof raw === "string") {
    const parsed = safeJsonParse<any>(raw, []);
    arr = parsed;
  }
  if (!Array.isArray(arr)) return [];
  const out: Array<{ substance: string; limitMgKg: number }> = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const substance = typeof item.substance === "string" ? item.substance : String(item.substance ?? "");
    const limit = Number(item.limitMgKg);
    if (!substance) continue;
    out.push({
      substance,
      limitMgKg: Number.isFinite(limit) ? limit : 0,
    });
  }
  return out;
}

/**
 * Parse a month string ("01".."12") into a 1..12 number. Returns null on
 * failure or for empty / non-numeric input.
 */
function parseMonth(s: any): number | null {
  if (s == null) return null;
  const str = typeof s === "number" ? String(s) : String(s).trim();
  if (!/^\d{1,2}$/.test(str)) return null;
  const n = parseInt(str, 10);
  if (!Number.isFinite(n) || n < 1 || n > 12) return null;
  return n;
}

/**
 * Returns true iff `month` (1..12) falls within the inclusive season range
 * [from, to]. Handles wrap-around: when from > to (e.g. 11..03), the season
 * spans the year boundary (November → March).
 *
 * Pure — no I/O.
 */
function inSeasonRange(from: number, to: number, month: number): boolean {
  if (!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(month)) return true;
  if (from === to) return month === from;
  if (from < to) {
    // e.g. 03..07 — March to July.
    return month >= from && month <= to;
  }
  // Wrap-around: e.g. 11..03 — November to March.
  return month >= from || month <= to;
}

/**
 * Parse the `season` input string. Accepts "MM" (e.g. "07") or "YYYY-MM"
 * (e.g. "2024-07"). Returns the month as a 1..12 number, or null on failure.
 *
 * Pure — no I/O.
 */
function monthFromSeasonInput(season: any): number | null {
  if (season == null) return null;
  if (typeof season === "number") {
    return Number.isFinite(season) && season >= 1 && season <= 12 ? season : null;
  }
  const s = String(season).trim();
  if (s.length === 0) return null;
  // "MM" — two-digit month.
  if (/^\d{1,2}$/.test(s)) {
    return parseMonth(s);
  }
  // "YYYY-MM" — ISO date (we only care about the month).
  const m = s.match(/^(\d{4})-(\d{1,2})/);
  if (m) return parseMonth(m[2]);
  return null;
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
    logger.error("[sps/resolveJurisdictionId] failed", {
      code,
      error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Load all SpsRequirement rows matching the lane tuple (hs6, originCountry,
 * destCountry, jurisdictionId, intendedUse, transportMode) with
 * `legalStatus = "IN_FORCE"` and within the effective date window.
 *
 * Wildcard semantics: a rule whose field is `null` matches any input value
 * (catch-all rule). A rule with a non-null field must equal the input value.
 * If the input value is empty, only rules with that field == null match.
 *
 * Defensive — returns [] on any DB error.
 */
async function loadMatchingSpsRules(params: {
  hs6?: string;
  originCountry?: string;
  destCountry?: string;
  jurisdictionId?: string | null;
  intendedUse?: string;
  transportMode?: string;
  now: Date;
}): Promise<SpsRequirement[]> {
  try {
    const hs6 = normalizeHs(params.hs6);
    const origin = upper(params.originCountry);
    const dest = upper(params.destCountry);
    const use = upper(params.intendedUse);
    const mode = upper(params.transportMode);
    const jurId = params.jurisdictionId || null;
    const now = params.now;

    // Build OR clauses for each lane field — null is a wildcard.
    const hs6Clause = hs6 ? [{ hs6 }, { hs6: null }] : [{ hs6: null }];
    const originClause = origin ? [{ originCountry: origin }, { originCountry: null }] : [{ originCountry: null }];
    const destClause = dest ? [{ destCountry: dest }, { destCountry: null }] : [{ destCountry: null }];
    const jurClause = jurId ? [{ jurisdictionId: jurId }, { jurisdictionId: null }] : [{ jurisdictionId: null }];
    const useClause = use ? [{ intendedUse: use }, { intendedUse: null }] : [{ intendedUse: null }];
    const modeClause = mode ? [{ transportMode: mode }, { transportMode: null }] : [{ transportMode: null }];

    const where: any = {
      legalStatus: "IN_FORCE",
      AND: [
        { OR: hs6Clause },
        { OR: originClause },
        { OR: destClause },
        { OR: jurClause },
        { OR: useClause },
        { OR: modeClause },
        // Effective-date window: rule is active iff effectiveFrom <= now
        // (or null) AND effectiveUntil >= now (or null).
        { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }] },
        { OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: now } }] },
      ],
    };

    const rows = await db.spsRequirement.findMany({
      where,
      orderBy: [{ spsCategory: "asc" }, { updatedAt: "desc" }],
    });
    return Array.isArray(rows) ? rows : [];
  } catch (e: any) {
    logger.error("[sps/loadMatchingSpsRules] failed", {
      params,
      error: e?.message || String(e),
    });
    return [];
  }
}

/**
 * Pure verdict computation from a SpsRequirement row.
 *
 * Rules (strictest first):
 *   • treatmentRequired (any non-NONE value) → ENHANCED_DD
 *     (BLOCK reserved for "treatment required AND not possible" — we have no
 *     reefer info here, so default to ENHANCED_DD per spec).
 *   • quarantineDays > 0                  → ENHANCED_DD
 *   • samplingRequired / labTestRequired /
 *     inspectionRequired                  → CONDITIONAL
 *   • otherwise                          → ALLOW
 */
function computeRuleVerdict(rule: SpsRequirement): "ALLOW" | "CONDITIONAL" | "ENHANCED_DD" | "BLOCK" {
  const treatment = upper(rule.treatmentRequired);
  if (treatment && treatment !== "NONE") return "ENHANCED_DD";
  if (typeof rule.quarantineDays === "number" && rule.quarantineDays > 0) return "ENHANCED_DD";
  if (rule.samplingRequired || rule.labTestRequired || rule.inspectionRequired) return "CONDITIONAL";
  return "ALLOW";
}

/**
 * Convert a SpsRequirement row into a SpsResult. Pure except for the JSON
 * parsing of `mandatoryActions` / `mrlStandards` (which are themselves pure).
 */
function toSpsResult(rule: SpsRequirement): SpsResult {
  const verdict = computeRuleVerdict(rule);
  const mrlStandards = parseMrlStandardsInternal(rule.mrlStandards);
  const mandatoryActions = parseStringArray(rule.mandatoryActions);
  const treatment = upper(rule.treatmentRequired);
  const treatmentRequired = treatment && treatment !== "NONE" ? treatment : undefined;

  let reason: string;
  switch (verdict) {
    case "ALLOW":
      reason = `SPS rule ${rule.spsCategory} present and manageable — no operator action required`;
      break;
    case "CONDITIONAL":
      reason = `SPS rule ${rule.spsCategory} requires operator action (sampling/lab/inspection)`;
      break;
    case "ENHANCED_DD":
      if (treatment && treatment !== "NONE") {
        reason = `SPS rule ${rule.spsCategory} requires ${treatment} treatment — enhanced due diligence before release`;
      } else {
        reason = `SPS rule ${rule.spsCategory} requires quarantine (${rule.quarantineDays} days) — enhanced due diligence before release`;
      }
      break;
    case "BLOCK":
      reason = `SPS rule ${rule.spsCategory} blocks the trade — treatment required and not possible`;
      break;
    default:
      reason = "undetermined";
  }

  return {
    ruleId: rule.id,
    spsCategory: rule.spsCategory,
    requirementText: rule.requirementText ?? "",
    mandatoryActions,
    samplingRequired: !!rule.samplingRequired,
    labTestRequired: !!rule.labTestRequired,
    treatmentRequired,
    inspectionRequired: !!rule.inspectionRequired,
    quarantineDays: typeof rule.quarantineDays === "number" ? rule.quarantineDays : undefined,
    mrlStandards,
    verdict,
    reason,
    sourceId: rule.sourceId ?? undefined,
    connectorId: rule.connectorId ?? undefined,
  };
}

// ============ Public API ============

/**
 * Determine ALL applicable SPS requirements for the given lane.
 *
 * Loads SpsRequirement rows matching (hs6, originCountry, destCountry,
 * jurisdictionId, intendedUse, transportMode) with `legalStatus = "IN_FORCE"`
 * and within the effective date window, then applies seasonal filtering: any
 * rule whose `seasonFrom` / `seasonTo` window does not contain the current
 * month (or the month derived from the `season` input) is skipped — but
 * logged so the operator knows the rule is present-but-out-of-season.
 *
 * Per-requirement verdict (strictest wins):
 *   • treatment required (non-NONE) → ENHANCED_DD
 *   • quarantine required (>0 days)   → ENHANCED_DD
 *   • sampling / lab / inspection    → CONDITIONAL
 *   • otherwise                       → ALLOW
 *
 * Defensive — never throws. On any DB failure, returns an empty determination
 * with topVerdict ALLOW (no SPS rule = no SPS dimension to enforce). The
 * Governor gates will combine this with the other Phase 3 verdicts.
 *
 * @param input SpsInput — HS code + commodity + lane + jurisdiction + season
 *                 + intended use + transport mode.
 * @returns SpsDetermination — one SpsResult per applicable rule, plus a
 *          topVerdict aggregated strictest-wins.
 */
export async function determineSpsRequirements(
  input: SpsInput,
): Promise<SpsDetermination> {
  const safe: SpsInput = input || ({} as SpsInput);

  // Step 1: resolve jurisdictionId (defensive — null on failure).
  const jurisdictionId = await resolveJurisdictionId(safe.jurisdictionCode);

  // Step 2: determine the reference month for seasonal filtering.
  // If the caller supplied a `season` input, use it; otherwise use the
  // current system date.
  const inputMonth = monthFromSeasonInput(safe.season);
  const seasonAt: Date = (() => {
    if (inputMonth == null) return new Date();
    const d = new Date();
    // setMonth handles overflow (e.g. month 13 → Feb next year).
    d.setMonth(inputMonth - 1);
    return d;
  })();

  // Step 3: load matching rules.
  let rules: SpsRequirement[] = [];
  try {
    rules = await loadMatchingSpsRules({
      hs6: safe.hs6,
      originCountry: safe.originCountry,
      destCountry: safe.destCountry,
      jurisdictionId,
      intendedUse: safe.intendedUse,
      transportMode: safe.transportMode,
      now: new Date(),
    });
  } catch (e: any) {
    logger.error("[sps/determineSpsRequirements] loadMatchingSpsRules failed", {
      hs6: safe.hs6,
      error: e?.message || String(e),
    });
    rules = [];
  }

  // Step 4: seasonal filtering — skip out-of-season rules but log them.
  const results: SpsResult[] = [];
  for (const rule of rules) {
    if (!isInSeason(rule, seasonAt)) {
      logger.debug("[sps/determineSpsRequirements] rule out of season — skipped", {
        ruleId: rule.id,
        spsCategory: rule.spsCategory,
        seasonFrom: rule.seasonFrom,
        seasonTo: rule.seasonTo,
        at: seasonAt.toISOString(),
      });
      continue;
    }
    results.push(toSpsResult(rule));
  }

  // Step 5: aggregate counters + topVerdict (strictest wins).
  const totalRequired = results.length;
  let samplingRequired = false;
  let labTestRequired = false;
  let treatmentRequired = false;
  let quarantineDaysMax = 0;
  let inspectionRequired = false;
  let topVerdict: "ALLOW" | "CONDITIONAL" | "ENHANCED_DD" | "BLOCK" = "ALLOW";

  for (const r of results) {
    if (r.samplingRequired) samplingRequired = true;
    if (r.labTestRequired) labTestRequired = true;
    if (r.treatmentRequired) treatmentRequired = true;
    if (typeof r.quarantineDays === "number" && r.quarantineDays > quarantineDaysMax) {
      quarantineDaysMax = r.quarantineDays;
    }
    if (r.inspectionRequired) inspectionRequired = true;
    const v = VERDICT_RANK[r.verdict] ?? 0;
    if (v > (VERDICT_RANK[topVerdict] ?? 0)) {
      topVerdict = r.verdict;
    }
  }

  // If no requirements apply, topVerdict stays ALLOW.
  return {
    requirements: results,
    topVerdict,
    totalRequired,
    samplingRequired,
    labTestRequired,
    treatmentRequired,
    quarantineDaysMax,
    inspectionRequired,
  };
}

/**
 * List SpsRequirement rows filtered by category / hs6 / origin / destination
 * / jurisdiction / legal status. Returns [] on any DB error.
 */
export async function listSpsRequirements(filters?: {
  spsCategory?: string;
  hs6?: string;
  originCountry?: string;
  destCountry?: string;
  jurisdictionId?: string;
  legalStatus?: string;
}): Promise<SpsRequirement[]> {
  const f = filters || {};
  try {
    const where: any = {};
    if (f.spsCategory) where.spsCategory = f.spsCategory;
    if (f.hs6) where.hs6 = f.hs6;
    if (f.originCountry) where.originCountry = upper(f.originCountry);
    if (f.destCountry) where.destCountry = upper(f.destCountry);
    if (f.jurisdictionId) where.jurisdictionId = f.jurisdictionId;
    if (f.legalStatus) where.legalStatus = f.legalStatus;
    const rows = await db.spsRequirement.findMany({
      where,
      orderBy: [{ spsCategory: "asc" }, { updatedAt: "desc" }],
    });
    return Array.isArray(rows) ? rows : [];
  } catch (e: any) {
    logger.error("[sps/listSpsRequirements] failed", {
      filters: f,
      error: e?.message || String(e),
    });
    return [];
  }
}

/**
 * Get a single SpsRequirement by its primary key. Returns null on any failure
 * or when the row does not exist.
 */
export async function getSpsRequirement(
  id: string,
): Promise<SpsRequirement | null> {
  if (!id || typeof id !== "string") return null;
  try {
    const row = await db.spsRequirement.findUnique({ where: { id } });
    return row ?? null;
  } catch (e: any) {
    logger.error("[sps/getSpsRequirement] failed", {
      id,
      error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Upsert a SpsRequirement row. Finds an existing row by the natural key
 * (spsCategory, hs6, originCountry, destCountry, jurisdictionId, intendedUse,
 * transportMode) and updates it, or creates a new row when no match exists.
 *
 * Defensive — on any DB error, returns a minimal in-memory
 * SpsRequirement-like object so the caller can continue (the Governor gates
 * will surface the persistence failure). Never throws.
 */
export async function upsertSpsRequirement(
  input: UpsertSpsInput,
): Promise<SpsRequirement> {
  const safe: UpsertSpsInput = input || ({} as UpsertSpsInput);
  try {
    const where: any = { spsCategory: safe.spsCategory };
    if (safe.hs6) where.hs6 = safe.hs6;
    if (safe.originCountry) where.originCountry = upper(safe.originCountry);
    if (safe.destCountry) where.destCountry = upper(safe.destCountry);
    if (safe.jurisdictionId) where.jurisdictionId = safe.jurisdictionId;
    if (safe.intendedUse) where.intendedUse = upper(safe.intendedUse);
    if (safe.transportMode) where.transportMode = upper(safe.transportMode);

    const existing = await db.spsRequirement.findFirst({
      where,
      orderBy: { updatedAt: "desc" },
    });

    const mandatoryActionsJson = Array.isArray(safe.mandatoryActions)
      ? JSON.stringify(safe.mandatoryActions)
      : undefined;
    const mrlStandardsJson = Array.isArray(safe.mrlStandards)
      ? JSON.stringify(safe.mrlStandards)
      : undefined;

    if (existing) {
      const updated = await db.spsRequirement.update({
        where: { id: existing.id },
        data: {
          spsCategory: safe.spsCategory ?? existing.spsCategory,
          hs6: safe.hs6 ?? existing.hs6,
          commodity: safe.commodity ?? existing.commodity,
          originCountry: safe.originCountry ? upper(safe.originCountry) : existing.originCountry,
          destCountry: safe.destCountry ? upper(safe.destCountry) : existing.destCountry,
          seasonFrom: safe.seasonFrom ?? existing.seasonFrom,
          seasonTo: safe.seasonTo ?? existing.seasonTo,
          intendedUse: safe.intendedUse ? upper(safe.intendedUse) : existing.intendedUse,
          transportMode: safe.transportMode ? upper(safe.transportMode) : existing.transportMode,
          jurisdictionId: safe.jurisdictionId ?? existing.jurisdictionId,
          requirementText: safe.requirementText ?? existing.requirementText,
          mandatoryActions: mandatoryActionsJson ?? existing.mandatoryActions,
          samplingRequired: typeof safe.samplingRequired === "boolean" ? safe.samplingRequired : existing.samplingRequired,
          labTestRequired: typeof safe.labTestRequired === "boolean" ? safe.labTestRequired : existing.labTestRequired,
          treatmentRequired: safe.treatmentRequired ?? existing.treatmentRequired,
          inspectionRequired: typeof safe.inspectionRequired === "boolean" ? safe.inspectionRequired : existing.inspectionRequired,
          quarantineDays: safe.quarantineDays ?? existing.quarantineDays,
          mrlStandards: mrlStandardsJson ?? existing.mrlStandards,
          sourceId: safe.sourceId ?? existing.sourceId,
          connectorId: safe.connectorId ?? existing.connectorId,
          legalStatus: safe.legalStatus ?? existing.legalStatus,
          effectiveFrom: safe.effectiveFrom ?? existing.effectiveFrom,
          effectiveUntil: safe.effectiveUntil ?? existing.effectiveUntil,
        },
      });
      return updated;
    }

    const created = await db.spsRequirement.create({
      data: {
        spsCategory: safe.spsCategory,
        hs6: safe.hs6,
        commodity: safe.commodity,
        originCountry: safe.originCountry ? upper(safe.originCountry) : null,
        destCountry: safe.destCountry ? upper(safe.destCountry) : null,
        seasonFrom: safe.seasonFrom,
        seasonTo: safe.seasonTo,
        intendedUse: safe.intendedUse ? upper(safe.intendedUse) : null,
        transportMode: safe.transportMode ? upper(safe.transportMode) : null,
        jurisdictionId: safe.jurisdictionId,
        requirementText: safe.requirementText,
        mandatoryActions: mandatoryActionsJson,
        samplingRequired: typeof safe.samplingRequired === "boolean" ? safe.samplingRequired : false,
        labTestRequired: typeof safe.labTestRequired === "boolean" ? safe.labTestRequired : false,
        treatmentRequired: safe.treatmentRequired,
        inspectionRequired: typeof safe.inspectionRequired === "boolean" ? safe.inspectionRequired : false,
        quarantineDays: safe.quarantineDays,
        mrlStandards: mrlStandardsJson,
        sourceId: safe.sourceId,
        connectorId: safe.connectorId,
        legalStatus: safe.legalStatus || "IN_FORCE",
        effectiveFrom: safe.effectiveFrom,
        effectiveUntil: safe.effectiveUntil,
      },
    });
    return created;
  } catch (e: any) {
    logger.error("[sps/upsertSpsRequirement] failed", {
      input: safe,
      error: e?.message || String(e),
    });
    // Return a minimal stub so the caller can keep going. The Governor
    // gates will surface the persistence failure.
    return {
      id: "",
      spsCategory: safe.spsCategory || "PLANT_HEALTH",
      hs6: safe.hs6 ?? null,
      commodity: safe.commodity ?? null,
      originCountry: safe.originCountry ? upper(safe.originCountry) : null,
      destCountry: safe.destCountry ? upper(safe.destCountry) : null,
      seasonFrom: safe.seasonFrom ?? null,
      seasonTo: safe.seasonTo ?? null,
      intendedUse: safe.intendedUse ? upper(safe.intendedUse) : null,
      transportMode: safe.transportMode ? upper(safe.transportMode) : null,
      jurisdictionId: safe.jurisdictionId ?? null,
      requirementText: safe.requirementText ?? null,
      mandatoryActions: Array.isArray(safe.mandatoryActions) ? JSON.stringify(safe.mandatoryActions) : null,
      samplingRequired: typeof safe.samplingRequired === "boolean" ? safe.samplingRequired : false,
      labTestRequired: typeof safe.labTestRequired === "boolean" ? safe.labTestRequired : false,
      treatmentRequired: safe.treatmentRequired ?? null,
      inspectionRequired: typeof safe.inspectionRequired === "boolean" ? safe.inspectionRequired : false,
      quarantineDays: safe.quarantineDays ?? null,
      mrlStandards: Array.isArray(safe.mrlStandards) ? JSON.stringify(safe.mrlStandards) : null,
      sourceId: safe.sourceId ?? null,
      connectorId: safe.connectorId ?? null,
      legalStatus: safe.legalStatus || "IN_FORCE",
      effectiveFrom: safe.effectiveFrom ?? null,
      effectiveUntil: safe.effectiveUntil ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as SpsRequirement;
  }
}

/**
 * Pure function: is a SpsRequirement in-season at the given reference instant?
 *
 * A rule is "in season" iff:
 *   • both `seasonFrom` and `seasonTo` are missing (no seasonal constraint), OR
 *   • the month of `at` falls within the inclusive range [seasonFrom, seasonTo],
 *     handling wrap-around (e.g. seasonFrom="11", seasonTo="03" → Nov → Mar).
 *
 * Defensive: if either bound is unparseable, the rule is considered in-season
 * (we'd rather over-apply than miss a requirement).
 *
 * Pure — does not touch the DB.
 */
export function isInSeason(rule: SpsRequirement, at: Date = new Date()): boolean {
  if (!rule) return true;
  const from = parseMonth(rule.seasonFrom);
  const to = parseMonth(rule.seasonTo);
  // If both bounds are missing → always in season.
  if (from == null && to == null) return true;
  // If only one bound is set → treat as missing constraint (defensive).
  if (from == null || to == null) return true;
  const t = at instanceof Date ? at : new Date();
  const month = t.getMonth() + 1; // 1..12
  return inSeasonRange(from, to, month);
}

/**
 * Pure function: parse the `mrlStandards` JSON column off a SpsRequirement
 * row. Returns an array of `{ substance, limitMgKg }` objects. Defensive —
 * never throws, returns [] on parse failure.
 *
 * Pure — does not touch the DB.
 */
export function getMrlStandards(rule: SpsRequirement): Array<{ substance: string; limitMgKg: number }> {
  if (!rule) return [];
  return parseMrlStandardsInternal(rule.mrlStandards);
}

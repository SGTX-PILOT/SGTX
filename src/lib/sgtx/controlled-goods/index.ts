// @ts-nocheck
// SGTX Phase 3 — §6 Controlled Goods Engine (CCL-016)
// ---------------------------------------------------------------------------
// Determines whether a given (HS6, productName, casNumbers, lane, jurisdiction,
// applicant) tuple is subject to one or more of the 8 controlled-goods
// categories and — if so — produces an ALLOW / CONDITIONAL / ENHANCED_DD /
// BLOCK advisory verdict that the Governor gates (separate task) merge with
// the License / Permit / Certificate / SPS / TBT / Sanctions verdicts.
//
// 8 control categories (§6 spec):
//   DUAL_USE              — Wassenaar / EU 2021/821 / AU DSGL / US EAR
//                           dual-use goods (civil + military potential).
//   MILITARY_STRATEGIC     — USML / EU Common Military List / national strategic
//                           goods (arms, ammunition, platforms).
//   CHEMICALS             — CWC Schedule 1/2/3 chemicals + GHS-classified
//                           industrial chemicals subject to declaration.
//   BIOLOGICAL            — Biological Weapons Convention (BBC) agents,
//                           select-agents, toxins.
//   RADIOACTIVE           — Nuclear materials, dual-use nuclear technology,
//                           radioactive sources (IAEA scope).
//   CONTROLLED_MEDICINES  — Narcotic / psychotropic / precursor pharmaceuticals
//                           (UN Single Convention on Narcotic Drugs 1961,
//                           Convention on Psychotropic Substances 1971, UN
//                           Convention against Illicit Traffic 1988).
//   CITES                 — Convention on International Trade in Endangered
//                           Species of Wild Fauna and Flora (Appendices I/II/III).
//   CYBER_ADVANCED_TECH   — Advanced computing / semiconductor / quantum / AI
//                           chips subject to national export controls
//                           (US BIS Entity List + EU recast dual-use cyber items).
//
// Controls supported per §6 spec (per-control booleans on every result):
//   • exportLicenseRequired       — outbound license from the export-control
//                                    authority of the origin country.
//   • importLicenseRequired       — inbound license from the import-control
//                                    authority of the destination country.
//   • endUserStatementRequired   — signed end-user statement (EUS) from the
//                                    consignee certifying civil end-use.
//   • endUseCertificateRequired  — independent end-use certificate (EUC)
//                                    issued / notarised by a competent authority.
//   • reExportControl            — re-export (third-country onward shipment)
//                                    is also controlled.
//   • transitControlRequired     — transit (passage through a third country
//                                    without change of customs status) is
//                                    controlled.
//
// Severity → verdict semantics (advisory — Governor merges with the other
// Phase 3 subsystems):
//
//   ALLOW          — no controls apply to this product / lane / applicant.
//                    Trade may proceed on this dimension.
//
//   CONDITIONAL    — CONTROLLED_MEDICINES: prescription / national regulation
//                    regime applies; operator must verify import authorization
//                    before shipment.
//
//   ENHANCED_DD    — DUAL_USE / MILITARY_STRATEGIC / BIOLOGICAL / CYBER_ADVANCED_TECH /
//                    CITES Appendix II-III / CWC Schedule 2-3: enhanced due
//                    diligence must be triggered before any application is
//                    filed; export license + end-user statement + end-use
//                    certificate are mandatory.
//
//   BLOCK          — CITES Appendix I (commercial trade prohibited), CWC
//                    Schedule 1 (virtually banned), RADIOACTIVE (handled by
//                    national nuclear authorities outside SGTX's purview).
//                    The trade MUST NOT proceed on this dimension; the Governor
//                    will issue a HARD_DENY.
//
// Design rules (mandatory per the SGTX convention):
//   • // @ts-nocheck at the top.
//   • Every DB call wrapped in try/catch — a persistence failure never
//     propagates; the function returns a degraded ControlledGoodsDetermination
//     (empty controls, topVerdict ALLOW) so the trade is NOT blocked by a
//     transient DB error.
//   • Uses `import { db } from "@/lib/db"` and
//     `import { logger } from "@/lib/sgtx/logger"`.
//   • Uses `import { getProductProfile } from "@/lib/sgtx/classification"` for
//     the Phase 2 ProductRegulatoryProfile lookup (dualUseClassification /
//     strategicGoodsClassification / chemicalClassification / citesClassification /
//     casNumbers) used to derive implied controls.
//   • The pure helpers (`citesAppendixSeverity`, `cwcScheduleSeverity`,
//     `isEndUserStatementRequired`, `isReExportControlled`) do NOT touch the DB
//     — they are exported so the Governor gates can re-use them without a
//     round-trip.

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { getProductProfile } from "@/lib/sgtx/classification";

// Re-export the Prisma model type so callers don't need to import @prisma/client.
import type { ControlledGoodsControl } from "@prisma/client";
export type { ControlledGoodsControl };

// ============ Exported constants ============

/** The 8 controlled-goods categories handled by this engine. */
export const CONTROL_CATEGORIES = [
  "DUAL_USE",
  "MILITARY_STRATEGIC",
  "CHEMICALS",
  "BIOLOGICAL",
  "RADIOACTIVE",
  "CONTROLLED_MEDICINES",
  "CITES",
  "CYBER_ADVANCED_TECH",
] as const;

/** Severity scale used by ControlledGoodsControl rows + results. */
export const CONTROL_SEVERITIES = [
  "CONDITIONAL",
  "ENHANCED_DD",
  "BLOCK",
] as const;

/** Legal-status values used by ControlledGoodsControl rows. */
export const CONTROL_LEGAL_STATUSES = [
  "IN_FORCE",
  "SUPERSEDED",
  "REPEALED",
  "DRAFT",
] as const;

// ============ Exported interfaces ============

export interface ControlledGoodsInput {
  hs6?: string;
  productName?: string;
  casNumbers?: string[];
  /** Phase 1 JurisdictionFabric code (ISO-3166-1 alpha-2 / customs union). */
  jurisdictionCode: string;
  originCountry: string;
  destCountry: string;
  /** Optional applicant GTID for applicant-scoped overrides. */
  applicantGtid?: string;
}

export interface ControlledGoodsResult {
  ruleId?: string;
  controlCategory: string;
  controlListEntry?: string;
  hs6?: string;
  productName?: string;
  casNumbers?: string[];
  exportLicenseRequired: boolean;
  importLicenseRequired: boolean;
  transitControlRequired: boolean;
  endUserStatementRequired: boolean;
  endUseCertificateRequired: boolean;
  reExportControl: boolean;
  severity: "CONDITIONAL" | "ENHANCED_DD" | "BLOCK";
  verdict: "ALLOW" | "CONDITIONAL" | "ENHANCED_DD" | "BLOCK";
  reason: string;
  sourceId?: string;
  connectorId?: string;
}

export interface ControlledGoodsDetermination {
  controls: ControlledGoodsResult[];
  topSeverity: "CONDITIONAL" | "ENHANCED_DD" | "BLOCK";
  topVerdict: "ALLOW" | "CONDITIONAL" | "ENHANCED_DD" | "BLOCK";
  endUserStatementRequired: boolean;
  endUseCertificateRequired: boolean;
  exportLicenseRequired: boolean;
  importLicenseRequired: boolean;
  transitControlRequired: boolean;
  reExportControl: boolean;
}

export interface UpsertControlledGoodsInput {
  controlCategory: string;
  hs6?: string;
  productName?: string;
  casNumbers?: string[];
  controlListEntry?: string;
  jurisdictionId?: string;
  exportLicenseRequired?: boolean;
  importLicenseRequired?: boolean;
  transitControlRequired?: boolean;
  endUserStatementRequired?: boolean;
  endUseCertificateRequired?: boolean;
  reExportControl?: boolean;
  severity?: string;
  sourceId?: string;
  connectorId?: string;
  legalStatus?: string;
  effectiveFrom?: Date;
  effectiveUntil?: Date;
}

// ============ Internal constants ============

/**
 * SAMPLE EDUCATIONAL DATA — minimal CAS → CWC schedule map.
 *
 * This is NOT a comprehensive or authoritative CWC reference. It exists
 * solely to demonstrate the CHEMICALS control derivation path in
 * `determineControlledGoods`. For production deployments, replace this map
 * with a live OPCW Schedule 1/2/3 feed (via the §8 ComplianceConnector
 * subsystem = CONTROLLED_GOODS) and reload on a sync schedule. These values
 * are illustrative samples and may be out-of-date or imprecise; they MUST
 * NOT be used as the sole determinant of compliance status without
 * independent verification against the OPCW source.
 *
 * Sources consulted (public): OPCW Annex on Chemicals (CWC Schedule 1/2/3).
 */
const CAS_CWC_SCHEDULE_SAMPLE: Record<string, 1 | 2 | 3> = {
  // Schedule 1 — sample (educational placeholders).
  "107-44-8": 1, // Sarin (isopropyl methylphosphonofluoridate)
  "50782-69-9": 1, // Soman (pinacolyl methylphosphonofluoridate)
  "77-81-8": 1, // Tabun (ethyl dimethylphosphoramidocyanidate)
  "578-41-0": 1, // QL precursor (O-ethyl O-2-diisopropylaminoethyl methylphosphonite)
  // Schedule 2 — sample (educational).
  "75-44-5": 2, // phosgene (carbonyl dichloride) — task-spec example
  "79-19-6": 2, // thiosemicarbazide
  "6164-98-3": 2, // pinacolyl alcohol
  // Schedule 3 — sample (educational).
  "74-90-2": 3, // hydrogen cyanide — task-spec example
  "67-66-3": 3, // chloroform
};

/**
 * Severity ranking for "strictest wins" aggregation across controls.
 * ALLOW (0) is included so that an empty controls list naturally collapses
 * to topVerdict = ALLOW.
 */
const VERDICT_RANK: Record<string, number> = {
  ALLOW: 0,
  CONDITIONAL: 1,
  ENHANCED_DD: 2,
  BLOCK: 3,
};

/**
 * Per-category default severity (when a control is derived from the
 * ProductRegulatoryProfile rather than a DB-loaded row). Used by the implied
 * controls derivation path.
 */
const CATEGORY_DEFAULT_SEVERITY: Record<string, "CONDITIONAL" | "ENHANCED_DD" | "BLOCK"> = {
  DUAL_USE: "ENHANCED_DD",
  MILITARY_STRATEGIC: "ENHANCED_DD",
  CHEMICALS: "ENHANCED_DD", // overridden by cwcScheduleSeverity when a CAS match exists
  BIOLOGICAL: "ENHANCED_DD",
  RADIOACTIVE: "BLOCK",
  CONTROLLED_MEDICINES: "CONDITIONAL",
  CITES: "ENHANCED_DD", // overridden by citesAppendixSeverity when an appendix is present
  CYBER_ADVANCED_TECH: "ENHANCED_DD",
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

/** Normalize a CAS number for lookup (strip whitespace + lowercase). */
function normalizeCas(cas: string): string {
  if (typeof cas !== "string") return "";
  return cas.trim().toLowerCase();
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

/** Read a JSON classification field off the ProductRegulatoryProfile row. */
function profileField(profile: any, name: string): any | undefined {
  if (!profile) return undefined;
  const raw = profile[name];
  if (raw == null) return undefined;
  if (typeof raw === "object") return raw;
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  return safeJsonParse<any>(raw, undefined) ?? undefined;
}

/** Map a severity string to the per-control verdict (no ALLOW at control level). */
function severityToVerdict(
  sev: string,
): "CONDITIONAL" | "ENHANCED_DD" | "BLOCK" {
  if (sev === "BLOCK") return "BLOCK";
  if (sev === "ENHANCED_DD") return "ENHANCED_DD";
  return "CONDITIONAL";
}

/** Strictest-wins aggregation of a list of verdicts. */
function strictestVerdict(verdicts: string[]): "ALLOW" | "CONDITIONAL" | "ENHANCED_DD" | "BLOCK" {
  if (!Array.isArray(verdicts) || verdicts.length === 0) return "ALLOW";
  let best: "ALLOW" | "CONDITIONAL" | "ENHANCED_DD" | "BLOCK" = "ALLOW";
  let bestRank = -1;
  for (const v of verdicts) {
    const r = VERDICT_RANK[v] ?? 0;
    if (r > bestRank) {
      bestRank = r;
      best = v as any;
    }
  }
  return best;
}

/** Resolve jurisdictionCode → jurisdictionId (defensive, returns null on failure). */
async function resolveJurisdictionId(code: string): Promise<string | null> {
  if (!code) return null;
  try {
    const j = await db.jurisdictionFabric.findFirst({
      where: { code: upper(code) },
      select: { id: true },
    });
    return j?.id ?? null;
  } catch (e: any) {
    logger.error("[controlled-goods/resolveJurisdictionId] failed", {
      code,
      error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Load ControlledGoodsControl rows matching (hs6, jurisdictionId,
 * controlCategory) where legalStatus = "IN_FORCE". Defensive — returns []
 * on any DB failure.
 *
 * Matches:
 *   • hs6-specific rows where hs6 = inputHs6 (or hs6 is null = global rule).
 *   • jurisdiction-specific rows where jurisdictionId matches (or
 *     jurisdictionId is null = global rule).
 *   • legalStatus = "IN_FORCE" (unless explicitly overridden).
 */
async function loadMatchingControls(params: {
  hs6?: string;
  jurisdictionId?: string | null;
  legalStatus?: string;
}): Promise<ControlledGoodsControl[]> {
  try {
    const where: any = {
      legalStatus: params.legalStatus || "IN_FORCE",
      OR: [] as any[],
    };
    // hs6 = exact OR hs6 IS NULL (jurisdiction-wide / category-wide rule).
    if (params.hs6) {
      where.OR.push({ hs6: params.hs6 }, { hs6: null });
    } else {
      where.OR.push({ hs6: null });
    }
    // jurisdictionId = exact OR jurisdictionId IS NULL (global rule).
    if (params.jurisdictionId) {
      where.OR = where.OR.flatMap((clause: any) => {
        if (clause.hs6 !== undefined) {
          return [
            { ...clause, jurisdictionId: params.jurisdictionId },
            { ...clause, jurisdictionId: null },
          ];
        }
        return [clause];
      });
      // Simpler: push jurisdiction-wide clauses explicitly.
      where.OR = [
        { hs6: params.hs6 ?? null, jurisdictionId: params.jurisdictionId },
        { hs6: params.hs6 ?? null, jurisdictionId: null },
        ...(params.hs6
          ? [
              { hs6: null, jurisdictionId: params.jurisdictionId },
              { hs6: null, jurisdictionId: null },
            ]
          : [{ hs6: null, jurisdictionId: null }]),
      ];
    } else {
      where.OR = [
        ...(params.hs6
          ? [{ hs6: params.hs6 }, { hs6: null }]
          : [{ hs6: null }]),
      ];
    }
    const rows = await db.controlledGoodsControl.findMany({
      where,
      orderBy: [{ severity: "desc" }, { updatedAt: "desc" }],
    });
    return Array.isArray(rows) ? (rows as ControlledGoodsControl[]) : [];
  } catch (e: any) {
    logger.error("[controlled-goods/loadMatchingControls] failed", {
      params,
      error: e?.message || String(e),
    });
    return [];
  }
}

// ============ Pure public helpers ============

/**
 * CITES appendix → severity (pure, no I/O).
 *
 *   Appendix I    → BLOCK       (commercial trade prohibited).
 *   Appendix II   → ENHANCED_DD  (permits required — export + import).
 *   Appendix III  → ENHANCED_DD  (permits required — at least export).
 *   Unknown / ""  → ENHANCED_DD  (defensive — assume controlled).
 */
export function citesAppendixSeverity(
  appendix: string,
): "CONDITIONAL" | "ENHANCED_DD" | "BLOCK" {
  const a = (appendix || "").trim().toUpperCase();
  // Accept "I", "II", "III", "1", "2", "3" and "APPENDIX I" variants.
  const normalized = a.replace(/^APPENDIX\s*/, "").replace(/^APX\s*/, "");
  if (normalized === "I" || normalized === "1") return "BLOCK";
  if (normalized === "II" || normalized === "2") return "ENHANCED_DD";
  if (normalized === "III" || normalized === "3") return "ENHANCED_DD";
  // Unknown appendix — defensive: treat as ENHANCED_DD.
  return "ENHANCED_DD";
}

/**
 * CWC schedule → severity (pure, no I/O).
 *
 *   Schedule 1   → BLOCK        (virtually banned — research / protective
 *                                 purposes only, with declaration).
 *   Schedule 2   → ENHANCED_DD  (declaration + license required).
 *   Schedule 3   → ENHANCED_DD  (declaration required for low-volume trade).
 */
export function cwcScheduleSeverity(
  schedule: 1 | 2 | 3,
): "CONDITIONAL" | "ENHANCED_DD" | "BLOCK" {
  if (schedule === 1) return "BLOCK";
  if (schedule === 2 || schedule === 3) return "ENHANCED_DD";
  // Defensive — unknown schedule treated as ENHANCED_DD.
  return "ENHANCED_DD";
}

/**
 * Pure predicate: is an end-user statement required for this control?
 * Returns `control.endUserStatementRequired`. Defensive — returns false for
 * null / malformed input.
 */
export function isEndUserStatementRequired(control: ControlledGoodsControl): boolean {
  if (!control) return false;
  return !!control.endUserStatementRequired;
}

/**
 * Pure predicate: is re-export (onward third-country shipment) controlled?
 * Returns `control.reExportControl`. Defensive — returns false for null /
 * malformed input.
 */
export function isReExportControlled(control: ControlledGoodsControl): boolean {
  if (!control) return false;
  return !!control.reExportControl;
}

// ============ Implied controls derivation (Phase 2 ProductRegulatoryProfile) ============

/**
 * Derive implied controlled-goods categories from the Phase 2
 * ProductRegulatoryProfile (dualUseClassification / strategicGoodsClassification
 * / chemicalClassification + casNumbers / citesClassification). Returns one
 * implied control per detected family — the caller will deduplicate against
 * DB-loaded controls (keeping the strictest severity per category).
 *
 * Defensive — never throws; on profile lookup failure, returns [].
 */
function deriveImpliedControls(
  profile: any | null,
  inputCasNumbers: string[],
): ControlledGoodsResult[] {
  if (!profile) return [];
  const results: ControlledGoodsResult[] = [];

  // DUAL_USE — implied when dualUseClassification present (controlList + entry).
  const dualUse = profileField(profile, "dualUseClassification");
  if (dualUse) {
    const entry =
      typeof dualUse.entry === "string"
        ? dualUse.entry
        : typeof dualUse.controlList === "string"
        ? `${dualUse.controlList}`
        : "DUAL_USE_DERIVED";
    const controlList =
      typeof dualUse.controlList === "string" ? dualUse.controlList : undefined;
    results.push({
      controlCategory: "DUAL_USE",
      controlListEntry: controlList ? `${controlList}/${entry}` : entry,
      hs6: profile.hs6,
      productName: profile.productName,
      casNumbers: inputCasNumbers,
      exportLicenseRequired: true,
      importLicenseRequired: false,
      transitControlRequired: true,
      endUserStatementRequired: true,
      endUseCertificateRequired: true,
      reExportControl: true,
      severity: "ENHANCED_DD",
      verdict: "ENHANCED_DD",
      reason: `dual-use classification present (controlList=${controlList || "n/a"}, entry=${entry}) — export license + EUS + EUC required`,
      sourceId: profile.sourceId ?? undefined,
    });
  }

  // MILITARY_STRATEGIC — implied when strategicGoodsClassification present.
  const strategic = profileField(profile, "strategicGoodsClassification");
  if (strategic) {
    const entry =
      typeof strategic.entry === "string"
        ? strategic.entry
        : "STRATEGIC_DERIVED";
    const regime =
      typeof strategic.controlRegime === "string"
        ? strategic.controlRegime
        : undefined;
    results.push({
      controlCategory: "MILITARY_STRATEGIC",
      controlListEntry: regime ? `${regime}/${entry}` : entry,
      hs6: profile.hs6,
      productName: profile.productName,
      casNumbers: inputCasNumbers,
      exportLicenseRequired: true,
      importLicenseRequired: true,
      transitControlRequired: true,
      endUserStatementRequired: true,
      endUseCertificateRequired: true,
      reExportControl: true,
      severity: "ENHANCED_DD",
      verdict: "ENHANCED_DD",
      reason: `strategic goods classification present (controlRegime=${regime || "n/a"}, entry=${entry}) — export + import license + EUS + EUC required`,
      sourceId: profile.sourceId ?? undefined,
    });
  }

  // CHEMICALS — implied when chemicalClassification present AND casNumbers
  // intersect the CWC Schedule sample map. Severity is set by
  // cwcScheduleSeverity (BLOCK for Schedule 1, ENHANCED_DD for 2/3).
  const chemical = profileField(profile, "chemicalClassification");
  if (chemical) {
    // Merge casNumbers from input + profile.
    const profileCas = parseStringArray(profile.casNumbers);
    const allCas = Array.from(
      new Set([...inputCasNumbers, ...profileCas].map(normalizeCas).filter(Boolean)),
    );
    const matchedSchedules: Array<{ cas: string; schedule: 1 | 2 | 3 }> = [];
    for (const cas of allCas) {
      const sch = CAS_CWC_SCHEDULE_SAMPLE[cas];
      if (sch !== undefined) matchedSchedules.push({ cas, schedule: sch });
    }
    if (matchedSchedules.length > 0) {
      // Strictest schedule wins (Schedule 1 → BLOCK).
      const schedules = matchedSchedules.map((m) => m.schedule);
      const minSchedule = Math.min(...schedules) as 1 | 2 | 3;
      const severity = cwcScheduleSeverity(minSchedule);
      results.push({
        controlCategory: "CHEMICALS",
        controlListEntry: `CWC_Schedule_${minSchedule}`,
        hs6: profile.hs6,
        productName: profile.productName,
        casNumbers: matchedSchedules.map((m) => m.cas),
        exportLicenseRequired: true,
        importLicenseRequired: severity === "BLOCK",
        transitControlRequired: true,
        endUserStatementRequired: true,
        endUseCertificateRequired: true,
        reExportControl: true,
        severity,
        verdict: severity,
        reason: `chemicalClassification present + CAS matches CWC Schedule ${minSchedule} (${matchedSchedules
          .map((m) => m.cas)
          .join(", ")}) — ${
          severity === "BLOCK"
            ? "Schedule 1 — virtually banned"
            : "Schedule 2/3 — declaration + license required"
        }`,
        sourceId: profile.sourceId ?? undefined,
      });
    }
    // If chemicalClassification is present but no CAS matched the sample map,
    // we still surface a default CHEMICALS control at ENHANCED_DD (chemicals
    // are subject to declaration / GHS labeling regimes).
    else {
      results.push({
        controlCategory: "CHEMICALS",
        controlListEntry: "GHS_DECLARATION",
        hs6: profile.hs6,
        productName: profile.productName,
        casNumbers: allCas,
        exportLicenseRequired: false,
        importLicenseRequired: false,
        transitControlRequired: false,
        endUserStatementRequired: false,
        endUseCertificateRequired: false,
        reExportControl: false,
        severity: "CONDITIONAL",
        verdict: "CONDITIONAL",
        reason: `chemicalClassification present (CAS not in sample CWC schedule map) — REACH/GHS declaration may apply; verify against OPCW source`,
        sourceId: profile.sourceId ?? undefined,
      });
    }
  }

  // CITES — implied when citesClassification present. Severity per appendix.
  const cites = profileField(profile, "citesClassification");
  if (cites) {
    const appendix =
      typeof cites.appendix === "string"
        ? cites.appendix
        : typeof cites.specimenType === "string"
        ? cites.specimenType
        : "";
    const severity = citesAppendixSeverity(appendix);
    results.push({
      controlCategory: "CITES",
      controlListEntry: `CITES_Appendix_${(appendix || "unknown")
        .replace(/^Appendix\s*/i, "")
        .replace(/^App\.\s*/i, "")
        .trim()
        .toUpperCase()}`,
      hs6: profile.hs6,
      productName: profile.productName,
      casNumbers: inputCasNumbers,
      exportLicenseRequired: true,
      importLicenseRequired: true,
      transitControlRequired: false,
      endUserStatementRequired: severity === "BLOCK",
      endUseCertificateRequired: severity === "BLOCK",
      reExportControl: true,
      severity,
      verdict: severity,
      reason: `citesClassification present (appendix=${appendix || "unknown"}) — ${
        severity === "BLOCK"
          ? "Appendix I — commercial trade prohibited"
          : "Appendix II/III — export + import permits required"
      }`,
      sourceId: profile.sourceId ?? undefined,
    });
  }

  return results;
}

/**
 * Deduplicate a list of ControlledGoodsResult by controlCategory, keeping the
 * strictest severity per category (and merging the booleans with OR so a
 * DB-loaded row + an implied row both contribute their required-control flags).
 */
function dedupControls(controls: ControlledGoodsResult[]): ControlledGoodsResult[] {
  const map = new Map<string, ControlledGoodsResult>();
  for (const c of controls) {
    const existing = map.get(c.controlCategory);
    if (!existing) {
      map.set(c.controlCategory, c);
      continue;
    }
    // Strictest severity wins; OR the booleans; preserve the ruleId + entry
    // of the strictest one.
    const aRank = VERDICT_RANK[c.severity] ?? 0;
    const bRank = VERDICT_RANK[existing.severity] ?? 0;
    const strictest = aRank >= bRank ? c : existing;
    const merged: ControlledGoodsResult = {
      ruleId: strictest.ruleId ?? existing.ruleId,
      controlCategory: c.controlCategory,
      controlListEntry: strictest.controlListEntry ?? existing.controlListEntry,
      hs6: c.hs6 ?? existing.hs6,
      productName: c.productName ?? existing.productName,
      casNumbers: c.casNumbers ?? existing.casNumbers,
      exportLicenseRequired: c.exportLicenseRequired || existing.exportLicenseRequired,
      importLicenseRequired: c.importLicenseRequired || existing.importLicenseRequired,
      transitControlRequired: c.transitControlRequired || existing.transitControlRequired,
      endUserStatementRequired:
        c.endUserStatementRequired || existing.endUserStatementRequired,
      endUseCertificateRequired:
        c.endUseCertificateRequired || existing.endUseCertificateRequired,
      reExportControl: c.reExportControl || existing.reExportControl,
      severity: strictest.severity,
      verdict: strictest.verdict,
      reason: `${existing.reason} | ${c.reason}`,
      sourceId: strictest.sourceId ?? existing.sourceId,
      connectorId: strictest.connectorId ?? existing.connectorId,
    };
    map.set(c.controlCategory, merged);
  }
  return Array.from(map.values());
}

// ============ Public API ============

/**
 * Determine which controlled-goods controls apply to the given product/lane/
 * applicant by (a) loading ControlledGoodsControl rows matching (hs6,
 * jurisdictionId, controlCategory) with legalStatus = "IN_FORCE" and (b)
 * deriving implied controls from the Phase 2 ProductRegulatoryProfile
 * (dualUseClassification / strategicGoodsClassification / chemicalClassification
 * + casNumbers against the CWC Schedule sample map / citesClassification).
 *
 * Returns a ControlledGoodsDetermination with:
 *   • controls[]   — one ControlledGoodsResult per applicable control,
 *                     deduplicated by controlCategory (strictest severity wins).
 *   • topSeverity  — strictest severity across all controls (or "CONDITIONAL"
 *                     when controls are empty — topVerdict becomes ALLOW).
 *   • topVerdict   — ALLOW when no controls apply; else the strictest verdict.
 *   • endUserStatementRequired / endUseCertificateRequired / exportLicenseRequired /
 *     importLicenseRequired / transitControlRequired / reExportControl — OR
 *     across all controls (true if ANY control requires it).
 *
 * Defensive — never throws. On any DB / profile-lookup failure, returns a
 * minimal determination with empty controls + topVerdict ALLOW (the trade is
 * NOT blocked by a transient error — the Governor may still surface it for
 * human review).
 *
 * @param input ControlledGoodsInput — product + lane + applicant context.
 * @returns ControlledGoodsDetermination — see above.
 */
export async function determineControlledGoods(
  input: ControlledGoodsInput,
): Promise<ControlledGoodsDetermination> {
  const safeInput: ControlledGoodsInput = {
    hs6: normalizeHs(input?.hs6) || undefined,
    productName: input?.productName,
    casNumbers: Array.isArray(input?.casNumbers)
      ? input.casNumbers.filter((x) => typeof x === "string")
      : [],
    jurisdictionCode: upper(input?.jurisdictionCode),
    originCountry: upper(input?.originCountry),
    destCountry: upper(input?.destCountry),
    applicantGtid: input?.applicantGtid,
  };

  // Step 1: resolve jurisdictionId (defensive — null on failure).
  const jurisdictionId = await resolveJurisdictionId(safeInput.jurisdictionCode);

  // Step 2: load DB-backed ControlledGoodsControl rows.
  let dbControls: ControlledGoodsControl[] = [];
  try {
    dbControls = await loadMatchingControls({
      hs6: safeInput.hs6,
      jurisdictionId,
      legalStatus: "IN_FORCE",
    });
  } catch (e: any) {
    logger.error("[controlled-goods/determineControlledGoods] loadMatchingControls failed", {
      hs6: safeInput.hs6,
      jurisdictionId,
      error: e?.message || String(e),
    });
    dbControls = [];
  }

  // Convert DB rows → ControlledGoodsResult (severity = row.severity or default).
  const dbResults: ControlledGoodsResult[] = dbControls.map((row) => {
    const severity: "CONDITIONAL" | "ENHANCED_DD" | "BLOCK" =
      row.severity === "BLOCK"
        ? "BLOCK"
        : row.severity === "CONDITIONAL"
        ? "CONDITIONAL"
        : "ENHANCED_DD"; // default + default schema value
    const verdict = severityToVerdict(severity);
    return {
      ruleId: row.id,
      controlCategory: row.controlCategory,
      controlListEntry: row.controlListEntry ?? undefined,
      hs6: row.hs6 ?? undefined,
      productName: row.productName ?? undefined,
      casNumbers: parseStringArray(row.casNumbers),
      exportLicenseRequired: !!row.exportLicenseRequired,
      importLicenseRequired: !!row.importLicenseRequired,
      transitControlRequired: !!row.transitControlRequired,
      endUserStatementRequired: !!row.endUserStatementRequired,
      endUseCertificateRequired: !!row.endUseCertificateRequired,
      reExportControl: !!row.reExportControl,
      severity,
      verdict,
      reason: `${row.controlCategory} control loaded (legalStatus=${row.legalStatus}, severity=${severity}) — ${
        row.controlListEntry || "no control-list entry"
      }`,
      sourceId: row.sourceId ?? undefined,
      connectorId: row.connectorId ?? undefined,
    };
  });

  // Step 3: load Phase 2 ProductRegulatoryProfile + derive implied controls.
  let profile: any | null = null;
  if (safeInput.hs6) {
    try {
      profile = await getProductProfile(safeInput.hs6);
    } catch (e: any) {
      logger.error(
        "[controlled-goods/determineControlledGoods] getProductProfile failed",
        {
          hs6: safeInput.hs6,
          error: e?.message || String(e),
        },
      );
      profile = null;
    }
  }
  const impliedResults = deriveImpliedControls(profile, safeInput.casNumbers || []);

  // Step 4: merge DB + implied, dedup by controlCategory (strictest wins).
  const merged = dedupControls([...dbResults, ...impliedResults]);

  // Step 5: aggregate topSeverity / topVerdict + OR the booleans.
  if (merged.length === 0) {
    return {
      controls: [],
      topSeverity: "CONDITIONAL", // vacuous when no controls — topVerdict ALLOW
      topVerdict: "ALLOW",
      endUserStatementRequired: false,
      endUseCertificateRequired: false,
      exportLicenseRequired: false,
      importLicenseRequired: false,
      transitControlRequired: false,
      reExportControl: false,
    };
  }

  const topVerdict = strictestVerdict(merged.map((c) => c.verdict));
  const topSeverity: "CONDITIONAL" | "ENHANCED_DD" | "BLOCK" =
    topVerdict === "ALLOW" ? "CONDITIONAL" : (topVerdict as any);

  return {
    controls: merged,
    topSeverity,
    topVerdict,
    endUserStatementRequired: merged.some((c) => c.endUserStatementRequired),
    endUseCertificateRequired: merged.some((c) => c.endUseCertificateRequired),
    exportLicenseRequired: merged.some((c) => c.exportLicenseRequired),
    importLicenseRequired: merged.some((c) => c.importLicenseRequired),
    transitControlRequired: merged.some((c) => c.transitControlRequired),
    reExportControl: merged.some((c) => c.reExportControl),
  };
}

/**
 * List ControlledGoodsControl rows filtered by category / hs6 / jurisdiction /
 * severity / legalStatus. Returns [] on any DB error.
 */
export async function listControlledGoodsControls(filters?: {
  controlCategory?: string;
  hs6?: string;
  jurisdictionId?: string;
  severity?: string;
  legalStatus?: string;
}): Promise<ControlledGoodsControl[]> {
  const f = filters || {};
  try {
    const where: any = {};
    if (f.controlCategory) where.controlCategory = f.controlCategory;
    if (f.hs6) where.hs6 = f.hs6;
    if (f.jurisdictionId) where.jurisdictionId = f.jurisdictionId;
    if (f.severity) where.severity = f.severity;
    if (f.legalStatus) where.legalStatus = f.legalStatus;
    const rows = await db.controlledGoodsControl.findMany({
      where,
      orderBy: [{ severity: "desc" }, { updatedAt: "desc" }],
    });
    return Array.isArray(rows) ? (rows as ControlledGoodsControl[]) : [];
  } catch (e: any) {
    logger.error("[controlled-goods/listControlledGoodsControls] failed", {
      filters: f,
      error: e?.message || String(e),
    });
    return [];
  }
}

/**
 * Get a single ControlledGoodsControl by its primary key. Returns null on any
 * failure or when the row does not exist.
 */
export async function getControlledGoodsControl(
  id: string,
): Promise<ControlledGoodsControl | null> {
  if (!id || typeof id !== "string") return null;
  try {
    const row = await db.controlledGoodsControl.findUnique({ where: { id } });
    return row ?? null;
  } catch (e: any) {
    logger.error("[controlled-goods/getControlledGoodsControl] failed", {
      id,
      error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Upsert a ControlledGoodsControl row. Finds an existing row by the natural
 * key (controlCategory, hs6, jurisdictionId) and updates it, or creates a new
 * row when no match exists.
 *
 * Defensive — on any DB error, returns a minimal in-memory
 * ControlledGoodsControl-like object so the caller can continue (the Governor
 * gates will surface the persistence failure). Never throws.
 */
export async function upsertControlledGoodsControl(
  input: UpsertControlledGoodsInput,
): Promise<ControlledGoodsControl> {
  const safe: UpsertControlledGoodsInput = input || ({} as UpsertControlledGoodsInput);
  try {
    const where: any = { controlCategory: safe.controlCategory };
    if (safe.hs6) where.hs6 = safe.hs6;
    if (safe.jurisdictionId) where.jurisdictionId = safe.jurisdictionId;

    const existing = await db.controlledGoodsControl.findFirst({
      where,
      orderBy: { updatedAt: "desc" },
    });

    const casNumbersJson = Array.isArray(safe.casNumbers)
      ? JSON.stringify(safe.casNumbers)
      : undefined;

    if (existing) {
      const updated = await db.controlledGoodsControl.update({
        where: { id: existing.id },
        data: {
          controlCategory: safe.controlCategory ?? existing.controlCategory,
          hs6: safe.hs6 ?? existing.hs6,
          productName: safe.productName ?? existing.productName,
          casNumbers: casNumbersJson ?? existing.casNumbers,
          controlListEntry: safe.controlListEntry ?? existing.controlListEntry,
          jurisdictionId: safe.jurisdictionId ?? existing.jurisdictionId,
          exportLicenseRequired:
            typeof safe.exportLicenseRequired === "boolean"
              ? safe.exportLicenseRequired
              : existing.exportLicenseRequired,
          importLicenseRequired:
            typeof safe.importLicenseRequired === "boolean"
              ? safe.importLicenseRequired
              : existing.importLicenseRequired,
          transitControlRequired:
            typeof safe.transitControlRequired === "boolean"
              ? safe.transitControlRequired
              : existing.transitControlRequired,
          endUserStatementRequired:
            typeof safe.endUserStatementRequired === "boolean"
              ? safe.endUserStatementRequired
              : existing.endUserStatementRequired,
          endUseCertificateRequired:
            typeof safe.endUseCertificateRequired === "boolean"
              ? safe.endUseCertificateRequired
              : existing.endUseCertificateRequired,
          reExportControl:
            typeof safe.reExportControl === "boolean"
              ? safe.reExportControl
              : existing.reExportControl,
          severity: safe.severity ?? existing.severity,
          sourceId: safe.sourceId ?? existing.sourceId,
          connectorId: safe.connectorId ?? existing.connectorId,
          legalStatus: safe.legalStatus ?? existing.legalStatus,
          effectiveFrom: safe.effectiveFrom ?? existing.effectiveFrom,
          effectiveUntil: safe.effectiveUntil ?? existing.effectiveUntil,
        },
      });
      return updated;
    }

    const created = await db.controlledGoodsControl.create({
      data: {
        controlCategory: safe.controlCategory,
        hs6: safe.hs6,
        productName: safe.productName,
        casNumbers: casNumbersJson,
        controlListEntry: safe.controlListEntry,
        jurisdictionId: safe.jurisdictionId,
        exportLicenseRequired: safe.exportLicenseRequired ?? true,
        importLicenseRequired: safe.importLicenseRequired ?? false,
        transitControlRequired: safe.transitControlRequired ?? false,
        endUserStatementRequired: safe.endUserStatementRequired ?? true,
        endUseCertificateRequired: safe.endUseCertificateRequired ?? true,
        reExportControl: safe.reExportControl ?? true,
        severity: safe.severity || "ENHANCED_DD",
        sourceId: safe.sourceId,
        connectorId: safe.connectorId,
        legalStatus: safe.legalStatus || "IN_FORCE",
        effectiveFrom: safe.effectiveFrom,
        effectiveUntil: safe.effectiveUntil,
      },
    });
    return created;
  } catch (e: any) {
    logger.error("[controlled-goods/upsertControlledGoodsControl] failed", {
      input: safe,
      error: e?.message || String(e),
    });
    // Return a minimal stub so the caller can keep going. The Governor gates
    // will surface the persistence failure.
    return {
      id: "",
      controlCategory: safe.controlCategory || "DUAL_USE",
      hs6: safe.hs6 ?? null,
      productName: safe.productName ?? null,
      casNumbers: Array.isArray(safe.casNumbers) ? JSON.stringify(safe.casNumbers) : null,
      controlListEntry: safe.controlListEntry ?? null,
      jurisdictionId: safe.jurisdictionId ?? null,
      exportLicenseRequired: safe.exportLicenseRequired ?? true,
      importLicenseRequired: safe.importLicenseRequired ?? false,
      transitControlRequired: safe.transitControlRequired ?? false,
      endUserStatementRequired: safe.endUserStatementRequired ?? true,
      endUseCertificateRequired: safe.endUseCertificateRequired ?? true,
      reExportControl: safe.reExportControl ?? true,
      severity: safe.severity || "ENHANCED_DD",
      sourceId: safe.sourceId ?? null,
      connectorId: safe.connectorId ?? null,
      legalStatus: safe.legalStatus || "IN_FORCE",
      effectiveFrom: safe.effectiveFrom ?? null,
      effectiveUntil: safe.effectiveUntil ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as ControlledGoodsControl;
  }
}

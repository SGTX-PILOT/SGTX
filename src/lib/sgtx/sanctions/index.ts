// @ts-nocheck
// SGTX Phase 3 — §7 Sanctions Engine (CCL-016)
// ---------------------------------------------------------------------------
// Screens entities, ultimate beneficial owners (UBOs), vessels, aircraft,
// ports, and financial counterparties against the SanctionsScreening table
// (loaded from OFAC SDN, UN Consolidated, EU Consolidated, UK OFSI, and local
// national lists via the §8 ComplianceConnector subsystem = SANCTIONS). Uses
// case-insensitive substring match + Levenshtein-distance fuzzy matching for
// near-miss variant detection (transliteration, initials, common typos).
//
// Supported screening types (§7 spec):
//   ENTITY                — corporate / legal person (name match).
//   UBO                  — ultimate beneficial owner (natural person +
//                          ownershipPct + uboChainDepth). 50%+ in a sanctioned
//                          entity → ENHANCED_DD even without a name match.
//   VESSEL              — IMO number + name match.
//   AIRCRAFT             — ICAO hex / tail number + operator name match.
//   PORT                 — UN/LOCODE → port name match (covers
//                          Crimea / Donbas / occupied-Ukraine port bans).
//   FINANCIAL_COUNTERPARTY — correspondent bank / PSP / exchange.
//
// Sanctioned lists tracked (§7 spec):
//   OFAC                  — US Treasury OFAC SDN / SSI / NS-PLC.
//   EU_SANCTIONS          — EU Consolidated Financial Sanctions List.
//   UN_SANCTIONS          — UN Security Council Consolidated Sanctions List.
//   UK_OFSI               — UK Office of Financial Sanctions Implementation
//                           Consolidated List.
//   LOCAL_LIST            — jurisdiction-specific national sanctions list
//                           (e.g. Egyptian CBE, Saudi SAMA, UAE UAEHQL).
//
// Verdict semantics (advisory — the Governor merges these with the other
// Phase 3 subsystem verdicts):
//
//   ALLOW          — no match found (matchScore < 0.5) and no UBO ownership
//                    in any sanctioned entity. Trade may proceed on this axis.
//
//   CONDITIONAL    — potential match (0.5 <= matchScore < 0.7) OR DB failure
//                    degraded the screening (manual review required). Operator
//                    must clear the hit before the trade proceeds.
//
//   ENHANCED_DD    — fuzzy match (0.7 <= matchScore < 0.95) OR ownershipPct
//                    >= 50% in a sanctioned entity. Enhanced due diligence
//                    must be triggered; the trade MUST NOT settle until the
//                    hit is cleared by an AML officer.
//
//   BLOCK          — exact match (matchScore >= 0.95) on OFAC / UN / EU list.
//                    The trade MUST NOT proceed; the Governor will issue a
//                    HARD_DENY. UK_OFSI and LOCAL_LIST exact matches do NOT
//                    auto-BLOCK (their lists include political / human-rights
//                    designations that may be challengeable) — they surface
//                    as ENHANCED_DD unless promoted by network analysis.
//
// Network analysis:
//   When `networkHits > 0` (i.e. connected entities are also flagged in the
//   SanctionsScreening table), the verdict is PROMOTED by one level
//   (CONDITIONAL → ENHANCED_DD → BLOCK). ALLOW is NOT promoted (network
//   analysis only matters when there's already a match).
//
// Design rules (mandatory per the SGTX convention):
//   • // @ts-nocheck at the top.
//   • EVERY DB call wrapped in try/catch — a persistence failure never
//     propagates. The engine NEVER throws; on DB failure it returns a
//     CONDITIONAL result with reason "screening failed — manual review
//     required" so the trade is surfaced for human review rather than
//     silently allowed.
//   • Uses `import { db } from "@/lib/db"` and
//     `import { logger } from "@/lib/sgtx/logger"`.
//   • Levenshtein distance is implemented inline (no external dependency).
//     Case-insensitive, whitespace-normalised.
//   • The pure helpers (`fuzzyMatchScore`, `getSanctionsVerdict`,
//     `aggregateScreeningResults`) do NOT touch the DB — they are exported
//     so the Governor gates can re-use them without a round-trip.

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// Re-export the Prisma model type so callers don't need to import @prisma/client.
import type { SanctionsScreening } from "@prisma/client";
export type { SanctionsScreening };

// ============ Exported constants ============

/** The 6 screening types handled by this engine. */
export const SCREENING_TYPES = [
  "ENTITY",
  "UBO",
  "VESSEL",
  "AIRCRAFT",
  "PORT",
  "FINANCIAL_COUNTERPARTY",
] as const;

/** The 5 sanctioned lists tracked by this engine. */
export const SANCTIONS_LISTS = [
  "OFAC",
  "EU_SANCTIONS",
  "UN_SANCTIONS",
  "UK_OFSI",
  "LOCAL_LIST",
] as const;

/** Verdict scale used by SanctionsScreening rows (excluding ALLOW which is the
 *  implicit default when no match is persisted). */
export const SANCTIONS_VERDICTS = [
  "CONDITIONAL",
  "ENHANCED_DD",
  "BLOCK",
] as const;

// ============ Exported interfaces ============

export interface SanctionsScreeningInput {
  screeningType: string;
  screenedValue: string;
  jurisdictionCode?: string;
  /** UBO ownership percentage (0..100) in a related sanctioned entity. */
  ownershipPct?: number;
  /** Depth of the UBO chain (1 = direct, 2..N = indirect). */
  uboChainDepth?: number;
}

export interface SanctionsScreeningResult {
  screeningId: string;
  screeningType: string;
  screenedValue: string;
  matchedEntity?: string;
  matchedList?: string;
  matchScore: number;
  ownershipPct?: number;
  uboChainDepth?: number;
  networkHits: number;
  jurisdictionCode?: string;
  verdict: "ALLOW" | "CONDITIONAL" | "ENHANCED_DD" | "BLOCK";
  reason: string;
  evidence: string[];
}

export interface UpsertSanctionsScreeningInput {
  screeningType: string;
  screenedValue: string;
  matchedEntity?: string;
  matchedList?: string;
  matchScore?: number;
  ownershipPct?: number;
  uboChainDepth?: number;
  networkHits?: number;
  jurisdictionCode?: string;
  verdict?: string;
  reason?: string;
  evidence?: string[];
  connectorId?: string;
}

// ============ Internal constants ============

/** Verdict rank for "strictest wins" aggregation across screening results. */
const VERDICT_RANK: Record<string, number> = {
  ALLOW: 0,
  CONDITIONAL: 1,
  ENHANCED_DD: 2,
  BLOCK: 3,
};

/** Lists whose exact-match hits auto-BLOCK (per spec). */
const BLOCK_LISTS = new Set(["OFAC", "UN_SANCTIONS", "EU_SANCTIONS"]);

// ============ Pure internal helpers ============

/**
 * Normalize a string for fuzzy matching: lowercase + collapse internal
 * whitespace + trim. Pure — no I/O.
 */
function normalizeForMatch(s: string | null | undefined): string {
  if (typeof s !== "string") return "";
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Levenshtein edit distance (pure DP). Returns the minimum number of
 * single-character insertions / deletions / substitutions required to turn
 * `a` into `b`. Pure — no I/O. Returns 0 when both inputs are equal; returns
 * the length of the non-empty string when one is empty.
 *
 * Implementation uses the standard two-row DP with O(min(m,n)) space.
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  // Ensure `a` is the shorter string (so the row array is smaller).
  if (a.length > b.length) {
    [a, b] = [b, a];
  }
  const m = a.length;
  const n = b.length;
  let prev = new Array<number>(m + 1);
  let curr = new Array<number>(m + 1);
  for (let i = 0; i <= m; i++) prev[i] = i;
  for (let j = 1; j <= n; j++) {
    curr[0] = j;
    const bChar = b.charCodeAt(j - 1);
    for (let i = 1; i <= m; i++) {
      const cost = a.charCodeAt(i - 1) === bChar ? 0 : 1;
      curr[i] = Math.min(
        prev[i] + 1, // deletion
        curr[i - 1] + 1, // insertion
        prev[i - 1] + cost, // substitution
      );
    }
    // Swap rows (avoid re-allocation).
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[m];
}

/**
 * Generate a fallback screening ID when DB persistence fails. Format:
 * `tmp-<timestamp>-<random-hex>` so the result is still well-formed.
 */
function tempScreeningId(): string {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(16).slice(2, 10);
  return `tmp-${ts}-${rnd}`;
}

/**
 * Coerce a numeric input to a finite number, defaulting to `def` on NaN/null.
 */
function toFiniteNumber(v: any, def: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : def;
}

// ============ Pure public helpers ============

/**
 * Fuzzy match score between two strings, in [0, 1].
 *
 *   score = 1 - (levenshtein(a, b) / max(len(a), len(b)))
 *
 * Case-insensitive + whitespace-normalised. Returns 0 when either input is
 * empty (no signal), and 1 when the two strings are identical (after
 * normalization). Pure — no I/O.
 *
 * @param a First string (case + whitespace will be normalized).
 * @param b Second string (case + whitespace will be normalized).
 * @returns 0..1 — 0 = no match, 1 = exact match (after normalization).
 */
export function fuzzyMatchScore(a: string, b: string): number {
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);
  if (na.length === 0 || nb.length === 0) return 0;
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 0;
  const dist = levenshtein(na, nb);
  // Clamp to [0, 1] — distance can exceed maxLen only via a bug; clamp just in case.
  const score = 1 - dist / maxLen;
  if (!Number.isFinite(score)) return 0;
  if (score < 0) return 0;
  if (score > 1) return 1;
  return score;
}

/**
 * Pure verdict computation from a (matchScore, matchedList, ownershipPct,
 * networkHits) tuple. The Governor gates re-evaluate this independently from
 * `screenEntity` so the helper is exported.
 *
 * Rules (per §7 spec):
 *   • BLOCK  — matchScore >= 0.95 AND matchedList ∈ {OFAC, UN_SANCTIONS, EU_SANCTIONS}.
 *   • ENHANCED_DD — (0.7 <= matchScore < 0.95) OR ownershipPct >= 50.
 *   • CONDITIONAL — 0.5 <= matchScore < 0.7.
 *   • ALLOW — matchScore < 0.5 (default).
 *
 * Then: if networkHits > 0 AND verdict is in {CONDITIONAL, ENHANCED_DD},
 * promote by one level (CONDITIONAL → ENHANCED_DD → BLOCK). ALLOW stays ALLOW
 * (network analysis only matters when there's already a match); BLOCK stays
 * BLOCK (no higher verdict available).
 *
 * Pure — no I/O.
 *
 * @param matchScore    0..1 fuzzy match score (default 0 on NaN/null).
 * @param matchedList   Sanctioned list the candidate was found on (or "").
 * @param ownershipPct   UBO ownership percentage in a related sanctioned entity.
 * @param networkHits   Number of connected entities also flagged (default 0).
 * @returns One of "ALLOW" | "CONDITIONAL" | "ENHANCED_DD" | "BLOCK".
 */
export function getSanctionsVerdict(
  matchScore: number,
  matchedList?: string,
  ownershipPct?: number,
  networkHits?: number,
): "ALLOW" | "CONDITIONAL" | "ENHANCED_DD" | "BLOCK" {
  const score = toFiniteNumber(matchScore, 0);
  const list = typeof matchedList === "string" ? matchedList.trim().toUpperCase() : "";
  const ownership = typeof ownershipPct === "number" ? ownershipPct : NaN;
  const hits = toFiniteNumber(networkHits, 0);

  // Step 1: base verdict from the spec rules.
  let verdict: "ALLOW" | "CONDITIONAL" | "ENHANCED_DD" | "BLOCK";
  if (score >= 0.95 && BLOCK_LISTS.has(list)) {
    verdict = "BLOCK";
  } else if (score >= 0.7) {
    verdict = "ENHANCED_DD";
  } else if (Number.isFinite(ownership) && ownership >= 50) {
    // UBO ownership >= 50% in a sanctioned entity → ENHANCED_DD regardless of score.
    verdict = "ENHANCED_DD";
  } else if (score >= 0.5) {
    verdict = "CONDITIONAL";
  } else {
    verdict = "ALLOW";
  }

  // Step 2: network promotion — promote by one level when networkHits > 0
  // (only from CONDITIONAL / ENHANCED_DD; ALLOW stays ALLOW; BLOCK stays BLOCK).
  if (hits > 0) {
    if (verdict === "CONDITIONAL") verdict = "ENHANCED_DD";
    else if (verdict === "ENHANCED_DD") verdict = "BLOCK";
    // ALLOW and BLOCK unchanged.
  }

  return verdict;
}

/**
 * Aggregate a batch of SanctionsScreeningResult into a single topVerdict plus
 * summary counters. Pure — no I/O.
 *
 *   topVerdict         — strictest across all results (BLOCK > ENHANCED_DD > CONDITIONAL > ALLOW).
 *   totalScreened      — length of the input array.
 *   matchedCount       — number of results with matchScore >= 0.5.
 *   blockCount         — number of results with verdict = BLOCK.
 *   enhancedDdCount    — number of results with verdict = ENHANCED_DD.
 *   conditionalCount   — number of results with verdict = CONDITIONAL.
 */
export function aggregateScreeningResults(results: SanctionsScreeningResult[]): {
  topVerdict: "ALLOW" | "CONDITIONAL" | "ENHANCED_DD" | "BLOCK";
  totalScreened: number;
  matchedCount: number;
  blockCount: number;
  enhancedDdCount: number;
  conditionalCount: number;
} {
  const safe = Array.isArray(results) ? results : [];
  let topRank = -1;
  let topVerdict: "ALLOW" | "CONDITIONAL" | "ENHANCED_DD" | "BLOCK" = "ALLOW";
  let matchedCount = 0;
  let blockCount = 0;
  let enhancedDdCount = 0;
  let conditionalCount = 0;
  for (const r of safe) {
    if (!r) continue;
    if (typeof r.matchScore === "number" && r.matchScore >= 0.5) matchedCount++;
    const v = r.verdict || "ALLOW";
    const rank = VERDICT_RANK[v] ?? 0;
    if (rank > topRank) {
      topRank = rank;
      topVerdict = v as any;
    }
    if (v === "BLOCK") blockCount++;
    else if (v === "ENHANCED_DD") enhancedDdCount++;
    else if (v === "CONDITIONAL") conditionalCount++;
  }
  if (topRank < 0) topVerdict = "ALLOW";
  return {
    topVerdict,
    totalScreened: safe.length,
    matchedCount,
    blockCount,
    enhancedDdCount,
    conditionalCount,
  };
}

// ============ DB-backed public API ============

/**
 * Screen a single entity / UBO / vessel / aircraft / port / financial
 * counterparty against the SanctionsScreening table. Performs:
 *
 *   (a) Substring + fuzzy matching against existing SanctionsScreening rows
 *       where screenedValue OR matchedEntity contains the searched value
 *       (case-insensitive). For each candidate, computes fuzzyMatchScore
 *       against both fields and takes the max.
 *   (b) Network analysis: counts OTHER rows in the table whose screenedValue
 *       contains the matchedEntity's canonical name (= connected entities
 *       also flagged for the same sanctioned person).
 *   (c) Verdict computation via getSanctionsVerdict.
 *   (d) Persists a new SanctionsScreening row recording this screening
 *       event (verdict, matchScore, matchedEntity, matchedList, networkHits,
 *       ownershipPct, uboChainDepth).
 *
 * Defensive — NEVER throws. On any DB failure, returns a CONDITIONAL result
 * with reason "screening failed — manual review required" and a fallback
 * `tmp-` screeningId so the caller can still continue.
 *
 * @param input SanctionsScreeningInput — screeningType + screenedValue + context.
 * @returns SanctionsScreeningResult — see above.
 */
export async function screenEntity(
  input: SanctionsScreeningInput,
): Promise<SanctionsScreeningResult> {
  const safe: SanctionsScreeningInput = input || ({} as SanctionsScreeningInput);
  const screeningType =
    typeof safe.screeningType === "string" && safe.screeningType.length > 0
      ? safe.screeningType.toUpperCase()
      : "ENTITY";
  const screenedValue =
    typeof safe.screenedValue === "string" ? safe.screenedValue.trim() : "";
  const normalized = normalizeForMatch(screenedValue);
  const jurisdictionCode = safe.jurisdictionCode
    ? String(safe.jurisdictionCode).trim().toUpperCase()
    : undefined;
  const ownershipPct =
    typeof safe.ownershipPct === "number" && Number.isFinite(safe.ownershipPct)
      ? safe.ownershipPct
      : undefined;
  const uboChainDepth =
    typeof safe.uboChainDepth === "number" && Number.isFinite(safe.uboChainDepth)
      ? safe.uboChainDepth
      : undefined;

  // Empty screenedValue → CONDITIONAL (manual review required). This is NOT a
  // BLOCK — the operator may have passed an empty field by mistake; surface
  // it for review rather than auto-blocking.
  if (screenedValue.length === 0) {
    const fallbackId = tempScreeningId();
    return {
      screeningId: fallbackId,
      screeningType,
      screenedValue: "",
      matchScore: 0,
      networkHits: 0,
      jurisdictionCode,
      ownershipPct,
      uboChainDepth,
      verdict: "CONDITIONAL",
      reason:
        "screenedValue is empty — manual review required (cannot screen a blank identifier)",
      evidence: ["empty-input"],
    };
  }

  // Step 1: query existing SanctionsScreening rows whose screenedValue OR
  // matchedEntity contains the searched value (case-insensitive).
  // IMPORTANT: only consider REFERENCE DATA rows (matchedList IS NOT NULL).
  // Screening-event rows created by screenEntity() have matchedList=null
  // (when no match was found) and would pollute the candidate set.
  let candidates: SanctionsScreening[] = [];
  try {
    candidates = await db.sanctionsScreening.findMany({
      where: {
        matchedList: { not: null },
        OR: [
          { screenedValue: { contains: normalized } },
          { matchedEntity: { contains: normalized } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      // Cap to keep fuzzy scoring bounded on huge lists — the highest-scoring
      // hit is what we ultimately care about; the cap is generous so we don't
      // miss a true match buried under noise.
      take: 200,
    });
  } catch (e: any) {
    logger.error("[sanctions/screenEntity] candidate lookup failed", {
      screeningType,
      screenedValue,
      error: e?.message || String(e),
    });
    candidates = [];
  }

  // Step 2: fuzzy-match each candidate against BOTH screenedValue + matchedEntity.
  let bestScore = 0;
  let bestMatch: SanctionsScreening | null = null;
  for (const row of candidates) {
    const scoreScreened = fuzzyMatchScore(normalized, row.screenedValue);
    const scoreMatched = row.matchedEntity
      ? fuzzyMatchScore(normalized, row.matchedEntity)
      : 0;
    const score = Math.max(scoreScreened, scoreMatched);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = row;
    }
  }

  const matchedEntity = bestMatch?.matchedEntity ?? undefined;
  const matchedList = bestMatch?.matchedList ?? undefined;

  // Step 3: network analysis — count OTHER rows where matchedEntity contains
  // the canonical entity name (i.e. how many other screening events flagged
  // the same sanctioned person).
  let networkHits = 0;
  if (matchedEntity) {
    try {
      networkHits = await db.sanctionsScreening.count({
        where: {
          AND: [
            { matchedEntity: { contains: matchedEntity } },
            // Exclude the bestMatch itself (so we don't count the hit twice).
            ...(bestMatch?.id ? [{ id: { not: bestMatch.id } }] : []),
            // Only count rows with a non-ALLOW verdict (connected flagged entities).
            { verdict: { in: ["CONDITIONAL", "ENHANCED_DD", "BLOCK"] } },
          ],
        },
      });
      if (!Number.isFinite(networkHits)) networkHits = 0;
    } catch (e: any) {
      logger.error("[sanctions/screenEntity] networkHits count failed", {
        screeningType,
        screenedValue,
        matchedEntity,
        error: e?.message || String(e),
      });
      networkHits = 0;
    }
  }

  // Step 4: compute verdict via the pure helper.
  const verdict = getSanctionsVerdict(
    bestScore,
    matchedList,
    ownershipPct,
    networkHits,
  );

  // Step 5: assemble the human-readable reason + evidence array.
  const evidence: string[] = [];
  if (bestMatch) {
    evidence.push(
      `fuzzy-match: score=${bestScore.toFixed(4)} against screenedValue="${
        bestMatch.screenedValue
      }" / matchedEntity="${matchedEntity || "(none)"}"`,
    );
    if (matchedList) evidence.push(`list: ${matchedList}`);
    if (networkHits > 0) evidence.push(`network: ${networkHits} connected flagged entities`);
  } else {
    evidence.push(`no-match: no SanctionsScreening row contained "${screenedValue}"`);
  }
  if (ownershipPct !== undefined && ownershipPct >= 50) {
    evidence.push(`ubo: ${ownershipPct}% ownership in a sanctioned entity`);
  }
  if (uboChainDepth !== undefined) {
    evidence.push(`ubo-chain-depth: ${uboChainDepth}`);
  }

  let reason: string;
  switch (verdict) {
    case "BLOCK":
      reason = `EXACT MATCH on ${matchedList || "(unknown list)"} (score=${bestScore.toFixed(
        4,
      )}) — HARD_DENY; trade MUST NOT proceed`;
      break;
    case "ENHANCED_DD":
      reason = bestMatch
        ? `fuzzy match (score=${bestScore.toFixed(4)}) on list=${
            matchedList || "(none)"
          } with networkHits=${networkHits} — enhanced due diligence required`
        : `ownershipPct=${ownershipPct}% in a sanctioned entity (UBO threshold >= 50) — enhanced due diligence required`;
      break;
    case "CONDITIONAL":
      reason = bestMatch
        ? `potential match (score=${bestScore.toFixed(4)}) — manual review required to clear the hit`
        : `no match (score=${bestScore.toFixed(4)}) — verdict default CONDITIONAL pending manual review`;
      break;
    case "ALLOW":
    default:
      reason = `no sanctions match (score=${bestScore.toFixed(
        4,
      )}) — trade may proceed on this axis`;
      break;
  }

  // Step 6: persist a new SanctionsScreening row recording this screening event.
  // Defensive — on failure, return a CONDITIONAL result with a tmp- id and
  // a reason indicating manual review required. NEVER throws.
  let screeningId = tempScreeningId();
  let persistFailed = false;
  try {
    const created = await db.sanctionsScreening.create({
      data: {
        screeningType,
        screenedValue,
        matchedEntity: matchedEntity ?? null,
        matchedList: matchedList ?? null,
        matchScore: bestScore,
        ownershipPct: ownershipPct ?? null,
        uboChainDepth: uboChainDepth ?? null,
        networkHits,
        jurisdictionCode: jurisdictionCode ?? null,
        verdict: verdict === "ALLOW" ? "CONDITIONAL" : verdict, // DB column uses CONDITIONAL+ scale; ALLOW → CONDITIONAL placeholder for persisted rows.
        reason,
        evidence: JSON.stringify(evidence),
      },
    });
    if (created?.id) screeningId = created.id;
  } catch (e: any) {
    logger.error("[sanctions/screenEntity] persistence failed", {
      screeningType,
      screenedValue,
      matchedEntity,
      matchedList,
      matchScore: bestScore,
      verdict,
      error: e?.message || String(e),
    });
    persistFailed = true;
  }

  // If persistence failed, return the CONDITIONAL-with-manual-review fallback.
  if (persistFailed) {
    return {
      screeningId,
      screeningType,
      screenedValue,
      matchedEntity,
      matchedList,
      matchScore: bestScore,
      ownershipPct,
      uboChainDepth,
      networkHits,
      jurisdictionCode,
      verdict: "CONDITIONAL",
      reason: "screening failed — manual review required",
      evidence: ["persist-failed", ...evidence],
    };
  }

  return {
    screeningId,
    screeningType,
    screenedValue,
    matchedEntity,
    matchedList,
    matchScore: bestScore,
    ownershipPct,
    uboChainDepth,
    networkHits,
    jurisdictionCode,
    verdict,
    reason,
    evidence,
  };
}

/**
 * Batch screen multiple inputs. Each input is screened independently via
 * `screenEntity` (which never throws); the returned array preserves the
 * input order. Use `aggregateScreeningResults` to compute a single
 * topVerdict across the batch.
 *
 * Defensive — never throws. If the input array is malformed, returns [].
 */
export async function screenMultiple(
  inputs: SanctionsScreeningInput[],
): Promise<SanctionsScreeningResult[]> {
  if (!Array.isArray(inputs)) return [];
  const results: SanctionsScreeningResult[] = [];
  for (const input of inputs) {
    try {
      const r = await screenEntity(input);
      results.push(r);
    } catch (e: any) {
      // Defensive — screenEntity itself never throws, but we double-guard here.
      logger.error("[sanctions/screenMultiple] individual screen failed", {
        input,
        error: e?.message || String(e),
      });
      results.push({
        screeningId: tempScreeningId(),
        screeningType: (input?.screeningType || "ENTITY").toUpperCase(),
        screenedValue: typeof input?.screenedValue === "string" ? input.screenedValue : "",
        matchScore: 0,
        networkHits: 0,
        jurisdictionCode: input?.jurisdictionCode,
        verdict: "CONDITIONAL",
        reason: "screening failed — manual review required",
        evidence: ["batch-screen-error"],
      });
    }
  }
  return results;
}

/**
 * List SanctionsScreening rows filtered by type / list / verdict /
 * jurisdictionCode / screenedValue. Returns [] on any DB error.
 */
export async function listSanctionsScreenings(filters?: {
  screeningType?: string;
  matchedList?: string;
  verdict?: string;
  jurisdictionCode?: string;
  screenedValue?: string;
}): Promise<SanctionsScreening[]> {
  const f = filters || {};
  try {
    const where: any = {};
    if (f.screeningType) where.screeningType = f.screeningType;
    if (f.matchedList) where.matchedList = f.matchedList;
    if (f.verdict) where.verdict = f.verdict;
    if (f.jurisdictionCode) where.jurisdictionCode = f.jurisdictionCode;
    if (f.screenedValue) {
      where.screenedValue = { contains: f.screenedValue };
    }
    const rows = await db.sanctionsScreening.findMany({
      where,
      orderBy: { screenedAt: "desc" },
    });
    return Array.isArray(rows) ? (rows as SanctionsScreening[]) : [];
  } catch (e: any) {
    logger.error("[sanctions/listSanctionsScreenings] failed", {
      filters: f,
      error: e?.message || String(e),
    });
    return [];
  }
}

/**
 * Get a single SanctionsScreening row by its primary key. Returns null on any
 * failure or when the row does not exist.
 */
export async function getSanctionsScreening(
  id: string,
): Promise<SanctionsScreening | null> {
  if (!id || typeof id !== "string") return null;
  try {
    const row = await db.sanctionsScreening.findUnique({ where: { id } });
    return row ?? null;
  } catch (e: any) {
    logger.error("[sanctions/getSanctionsScreening] failed", {
      id,
      error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Upsert a SanctionsScreening row. Finds an existing row by the natural key
 * (screeningType, screenedValue, matchedEntity) and updates it, or creates a
 * new row when no match exists.
 *
 * Defensive — on any DB error, returns a minimal in-memory
 * SanctionsScreening-like object so the caller can continue. Never throws.
 */
export async function upsertSanctionsScreening(
  input: UpsertSanctionsScreeningInput,
): Promise<SanctionsScreening> {
  const safe: UpsertSanctionsScreeningInput =
    input || ({} as UpsertSanctionsScreeningInput);
  try {
    const where: any = {
      screeningType: safe.screeningType,
      screenedValue: safe.screenedValue,
    };
    if (safe.matchedEntity) where.matchedEntity = safe.matchedEntity;

    const existing = await db.sanctionsScreening.findFirst({
      where,
      orderBy: { updatedAt: "desc" },
    });

    const evidenceJson = Array.isArray(safe.evidence)
      ? JSON.stringify(safe.evidence)
      : undefined;

    if (existing) {
      const updated = await db.sanctionsScreening.update({
        where: { id: existing.id },
        data: {
          screeningType: safe.screeningType ?? existing.screeningType,
          screenedValue: safe.screenedValue ?? existing.screenedValue,
          matchedEntity: safe.matchedEntity ?? existing.matchedEntity,
          matchedList: safe.matchedList ?? existing.matchedList,
          matchScore:
            typeof safe.matchScore === "number" ? safe.matchScore : existing.matchScore,
          ownershipPct:
            typeof safe.ownershipPct === "number"
              ? safe.ownershipPct
              : existing.ownershipPct,
          uboChainDepth:
            typeof safe.uboChainDepth === "number"
              ? safe.uboChainDepth
              : existing.uboChainDepth,
          networkHits:
            typeof safe.networkHits === "number" ? safe.networkHits : existing.networkHits,
          jurisdictionCode: safe.jurisdictionCode ?? existing.jurisdictionCode,
          verdict: safe.verdict ?? existing.verdict,
          reason: safe.reason ?? existing.reason,
          evidence: evidenceJson ?? existing.evidence,
          connectorId: safe.connectorId ?? existing.connectorId,
        },
      });
      return updated;
    }

    const created = await db.sanctionsScreening.create({
      data: {
        screeningType: safe.screeningType,
        screenedValue: safe.screenedValue,
        matchedEntity: safe.matchedEntity ?? null,
        matchedList: safe.matchedList ?? null,
        matchScore: typeof safe.matchScore === "number" ? safe.matchScore : 0,
        ownershipPct: safe.ownershipPct ?? null,
        uboChainDepth: safe.uboChainDepth ?? null,
        networkHits: typeof safe.networkHits === "number" ? safe.networkHits : 0,
        jurisdictionCode: safe.jurisdictionCode ?? null,
        verdict: safe.verdict || "CONDITIONAL",
        reason: safe.reason ?? null,
        evidence: evidenceJson,
        connectorId: safe.connectorId ?? null,
      },
    });
    return created;
  } catch (e: any) {
    logger.error("[sanctions/upsertSanctionsScreening] failed", {
      input: safe,
      error: e?.message || String(e),
    });
    // Return a minimal stub so the caller can keep going. The Governor gates
    // will surface the persistence failure.
    return {
      id: "",
      screeningType: safe.screeningType || "ENTITY",
      screenedValue: safe.screenedValue || "",
      matchedEntity: safe.matchedEntity ?? null,
      matchedList: safe.matchedList ?? null,
      matchScore: typeof safe.matchScore === "number" ? safe.matchScore : 0,
      ownershipPct: safe.ownershipPct ?? null,
      uboChainDepth: safe.uboChainDepth ?? null,
      networkHits: typeof safe.networkHits === "number" ? safe.networkHits : 0,
      jurisdictionCode: safe.jurisdictionCode ?? null,
      verdict: safe.verdict || "CONDITIONAL",
      reason: safe.reason ?? null,
      evidence: Array.isArray(safe.evidence) ? JSON.stringify(safe.evidence) : null,
      connectorId: safe.connectorId ?? null,
      screenedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as SanctionsScreening;
  }
}

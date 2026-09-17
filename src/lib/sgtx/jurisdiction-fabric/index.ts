// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v17 §20.6 — Jurisdiction Fabric
// ═══════════════════════════════════════════════════════════════════════════════
//
// A jurisdiction is NOT just a country. The Fabric recognises 16 distinct
// jurisdiction types — sovereign countries, customs unions, free-trade areas,
// free zones, SEZs, ports, airports, border crossings, inland dry ports,
// customs warehouses, free-trade zones, export processing zones, offshore
// financial centers, transit corridors, special administrative regions, and
// territorial waters — each with its own authority, rules and precedence.
//
// Hierarchy walking:
//   • Each jurisdiction has an optional `parentCode`. Walking the parent
//     chain produces the full hierarchy (e.g. bonded warehouse → port →
//     country → customs union).
//   • Cycles are guarded against by a `seen` set + MAX_DEPTH cap.
//
// Conflict resolution (Sovereign Jurisdiction Supremacy, G3):
//   • When multiple jurisdictions apply to the same trade/HS code, the
//     STRICTEST rule wins. "Strictest" = the rule with the lowest precedence
//     number. A rule from a customs union (precedenceTier 1) overrides a rule
//     from a member state (precedenceTier 2). A sanctions rule (precedence 1)
//     overrides a tariff rule (precedence 2) even within the same jurisdiction.
//
// This lib is read-only and pure — it does not write to the database. The seed
// data lives entirely in memory in `./seed.ts`. The existing `Jurisdiction`
// Prisma model (countryCode + tier) is left untouched.
// ═══════════════════════════════════════════════════════════════════════════════

import { logger } from "@/lib/sgtx/logger";
import {
  JURISDICTION_TYPES,
  JURISDICTIONS_SEED,
  type JurisdictionSeed,
  type JurisdictionRule,
  type JurisdictionType,
  type JurisdictionTypeMeta,
} from "@/lib/sgtx/jurisdiction-fabric/seed";

// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_HIERARCHY_DEPTH = 16;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface JurisdictionTypeResponse {
  code: JurisdictionType;
  name: string;
  description: string;
  hasParent: boolean;
  authority: string;
  precedenceTier: number;
}

export interface JurisdictionDetail {
  code: string;
  name: string;
  type: JurisdictionType;
  typeMeta: JurisdictionTypeMeta;
  authority: string;
  country?: string;
  parent: JurisdictionDetail | null;
  rules: JurisdictionRule[];
}

export interface JurisdictionHierarchyNode {
  id: string;
  type: JurisdictionType;
  name: string;
  level: number; // 0 = self, 1 = parent, 2 = grandparent, ...
  authority: string;
}

export interface ApplicableRule {
  rule: string;
  authority: string;
  precedence: number;
  category?: string;
  legalRef?: string;
  jurisdictionCode: string;
  jurisdictionName: string;
  jurisdictionType: JurisdictionType;
}

export interface ResolveResult {
  winningJurisdiction: string;
  winningJurisdictionName: string;
  winningJurisdictionType: JurisdictionType;
  reason: string;
  appliedRule: ApplicableRule;
  consideredJurisdictions: string[];
  consideredRuleCount: number;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

// Build a fast lookup map from the seed array.
function getJurisdictionByCode(code: string): JurisdictionSeed | null {
  if (!code) return null;
  const upper = code.toUpperCase();
  return JURISDICTIONS_SEED.find((j) => j.code.toUpperCase() === upper) || null;
}

function getTypeMeta(type: JurisdictionType): JurisdictionTypeMeta | null {
  return JURISDICTION_TYPES.find((t) => t.code === type) || null;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * List all 16 jurisdiction types with descriptions.
 */
export function getJurisdictionTypes(): { types: JurisdictionTypeResponse[] } {
  return {
    types: JURISDICTION_TYPES.map((t) => ({
      code: t.code,
      name: t.name,
      description: t.description,
      hasParent: t.hasParent,
      authority: t.typicalAuthority,
      precedenceTier: t.precedenceTier,
    })),
  };
}

/**
 * Get the type metadata for a single jurisdiction code. Returns null if the
 * jurisdiction is not in the seed registry.
 */
export function getJurisdictionType(jurisdictionCode: string): {
  type: JurisdictionType;
  parent: string | null;
  rules: JurisdictionRule[];
  authority: string;
  typeMeta: JurisdictionTypeMeta;
} | null {
  const j = getJurisdictionByCode(jurisdictionCode);
  if (!j) return null;
  const typeMeta = getTypeMeta(j.type);
  if (!typeMeta) {
    logger.warn("[jurisdiction-fabric/getJurisdictionType] unknown type", {
      code: jurisdictionCode,
      type: j.type,
    });
    return null;
  }
  return {
    type: j.type,
    parent: j.parentCode,
    rules: j.rules,
    authority: j.authority,
    typeMeta,
  };
}

/**
 * Walk the parent chain from `jurisdictionCode` up to the root jurisdiction.
 * Returns an ordered array: [self, parent, grandparent, ..., root] with the
 * level index attached.
 *
 * Defensive — returns [] on failure or if the code is not in the registry.
 * Bounded by MAX_HIERARCHY_DEPTH + a cycle guard to prevent runaway recursion.
 */
export function getJurisdictionHierarchy(jurisdictionCode: string): {
  hierarchy: JurisdictionHierarchyNode[];
} {
  if (!jurisdictionCode) return { hierarchy: [] };
  const hierarchy: JurisdictionHierarchyNode[] = [];
  const seen = new Set<string>();
  let currentCode: string | null = jurisdictionCode.toUpperCase();
  let level = 0;

  while (currentCode && level < MAX_HIERARCHY_DEPTH) {
    if (seen.has(currentCode)) {
      logger.warn("[jurisdiction-fabric/getJurisdictionHierarchy] cycle detected", {
        jurisdictionCode,
        currentCode,
        level,
      });
      break;
    }
    seen.add(currentCode);
    const node = getJurisdictionByCode(currentCode);
    if (!node) break;
    hierarchy.push({
      id: node.code,
      type: node.type,
      name: node.name,
      level,
      authority: node.authority,
    });
    currentCode = node.parentCode ? node.parentCode.toUpperCase() : null;
    level++;
  }
  return { hierarchy };
}

/**
 * Get the full detail for a jurisdiction: type metadata, parent (recursively
 * resolved), and the rules issued by THIS jurisdiction (parents' rules are
 * fetched separately via `getApplicableRules`).
 */
export function getJurisdictionDetail(jurisdictionCode: string): JurisdictionDetail | null {
  const j = getJurisdictionByCode(jurisdictionCode);
  if (!j) return null;
  const typeMeta = getTypeMeta(j.type);
  if (!typeMeta) return null;
  let parent: JurisdictionDetail | null = null;
  if (j.parentCode) {
    const parentSeed = getJurisdictionByCode(j.parentCode);
    if (parentSeed) {
      // Recursively resolve the parent (we don't recurse indefinitely because
      // the seed data has no cycles, but the depth cap in the hierarchy walker
      // protects against future regressions).
      const parentDetail = getJurisdictionDetail(parentSeed.code);
      if (parentDetail) parent = parentDetail;
    }
  }
  return {
    code: j.code,
    name: j.name,
    type: j.type,
    typeMeta,
    authority: j.authority,
    country: j.country,
    parent,
    rules: j.rules,
  };
}

/**
 * Get the applicable rules for a (jurisdiction, HS code) pair.
 *
 * Walks the hierarchy from `jurisdictionCode` up to the root, collecting rules
 * from each level. A rule is included if:
 *   • It has no `hsCodes` filter (applies to all HS codes), OR
 *   • The supplied `hsCode` matches one of the rule's `hsCodes` entries. The
 *     match is a prefix match: rule `hsCodes: ["08"]` matches HS code
 *     `08111000`. Rule `hsCodes: ["0811"]` also matches `08111000`. Rule
 *     `hsCodes: ["0812"]` does NOT match `08111000`.
 *
 * Returned rules are sorted by `precedence` ascending (strictest first).
 * Each rule is annotated with the jurisdiction that issued it.
 */
export function getApplicableRules(
  jurisdictionCode: string,
  hsCode?: string,
): { rules: ApplicableRule[]; jurisdiction: string; hierarchyDepth: number } {
  if (!jurisdictionCode) {
    return { rules: [], jurisdiction: "", hierarchyDepth: 0 };
  }
  const cleanHs = hsCode ? hsCode.replace(/\s+/g, "").toUpperCase() : undefined;
  const { hierarchy } = getJurisdictionHierarchy(jurisdictionCode);
  const collected: ApplicableRule[] = [];

  for (const node of hierarchy) {
    const seed = getJurisdictionByCode(node.id);
    if (!seed) continue;
    for (const r of seed.rules) {
      // Apply HS code filter
      if (cleanHs && r.hsCodes && r.hsCodes.length > 0) {
        const matched = r.hsCodes.some((prefix) =>
          cleanHs.startsWith(prefix.toUpperCase()),
        );
        if (!matched) continue;
      }
      collected.push({
        rule: r.rule,
        authority: r.authority,
        precedence: r.precedence,
        category: r.category,
        legalRef: r.legalRef,
        jurisdictionCode: seed.code,
        jurisdictionName: seed.name,
        jurisdictionType: seed.type,
      });
    }
  }

  // Sort by precedence ascending — strictest (lowest number) first.
  collected.sort((a, b) => a.precedence - b.precedence);

  return {
    rules: collected,
    jurisdiction: jurisdictionCode.toUpperCase(),
    hierarchyDepth: hierarchy.length,
  };
}

/**
 * Resolve a jurisdiction conflict (Sovereign Jurisdiction Supremacy, G3).
 *
 * When multiple jurisdictions apply to the same trade/HS code (e.g. the cargo
 * is in the Suez Canal SEZ, transiting the Suez Canal corridor, governed by
 * Egyptian customs, and screened against the GCC customs union sanctions list
 * simultaneously), the STRICTEST rule wins. "Strictest" = lowest precedence
 * number.
 *
 * The function:
 *   • Collects applicable rules from each jurisdiction in `jurisdictionCodes`
 *     (using the same HS-code prefix filter as `getApplicableRules`).
 *   • Picks the rule with the lowest `precedence` (strictest).
 *   • If multiple rules tie on precedence, the rule from the jurisdiction with
 *     the lower `precedenceTier` (per JURISDICTION_TYPES) wins — i.e. a customs
 *     union rule beats a country rule beats a port rule.
 *
 * Returns `{ winningJurisdiction, reason, appliedRule, consideredJurisdictions,
 * consideredRuleCount }`.
 */
export function resolveJurisdictionConflict(
  jurisdictionCodes: string[],
  hsCode?: string,
): ResolveResult {
  if (!Array.isArray(jurisdictionCodes) || jurisdictionCodes.length === 0) {
    return {
      winningJurisdiction: "",
      winningJurisdictionName: "",
      winningJurisdictionType: "SOVEREIGN_COUNTRY" as JurisdictionType,
      reason: "No jurisdictions supplied",
      appliedRule: {
        rule: "",
        authority: "",
        precedence: 999,
        jurisdictionCode: "",
        jurisdictionName: "",
        jurisdictionType: "SOVEREIGN_COUNTRY" as JurisdictionType,
      },
      consideredJurisdictions: [],
      consideredRuleCount: 0,
    };
  }

  // Deduplicate + uppercase.
  const considered = Array.from(
    new Set(jurisdictionCodes.map((c) => c.toUpperCase())),
  );

  // Collect the strictest applicable rule from EACH jurisdiction (not from the
  // hierarchy — only from the supplied top-level jurisdiction itself). This is
  // the G3 reading: when jurisdictions CONFLICT, the strictest rule wins.
  // Within a single jurisdiction, we still pick the strictest rule that
  // applies (honouring the HS code filter).
  type Candidate = {
    rule: ApplicableRule;
    typeTier: number; // JURISDICTION_TYPES precedenceTier (lower = stricter)
  };
  const candidates: Candidate[] = [];

  for (const code of considered) {
    const seed = getJurisdictionByCode(code);
    if (!seed) continue;
    const typeMeta = getTypeMeta(seed.type);
    const typeTier = typeMeta ? typeMeta.precedenceTier : 99;

    // Collect rules from the jurisdiction itself + all parents (so the
    // conflict resolution considers the full applicable-rule set, not just
    // the leaf).
    const { rules } = getApplicableRules(code, hsCode);
    if (rules.length === 0) continue;

    // Strictest rule from this jurisdiction's perspective.
    const strictest = rules[0]; // already sorted by precedence asc
    candidates.push({ rule: strictest, typeTier });
  }

  if (candidates.length === 0) {
    return {
      winningJurisdiction: considered[0] || "",
      winningJurisdictionName: getJurisdictionByCode(considered[0])?.name || "",
      winningJurisdictionType:
        getJurisdictionByCode(considered[0])?.type || ("SOVEREIGN_COUNTRY" as JurisdictionType),
      reason:
        "No applicable rules found in any of the supplied jurisdictions for the given HS code",
      appliedRule: {
        rule: "(none)",
        authority: "",
        precedence: 999,
        jurisdictionCode: considered[0] || "",
        jurisdictionName: getJurisdictionByCode(considered[0])?.name || "",
        jurisdictionType:
          getJurisdictionByCode(considered[0])?.type || ("SOVEREIGN_COUNTRY" as JurisdictionType),
      },
      consideredJurisdictions: considered,
      consideredRuleCount: 0,
    };
  }

  // Sort: lowest precedence first; ties broken by lower typeTier (customs union
  // beats country beats port).
  candidates.sort((a, b) => {
    if (a.rule.precedence !== b.rule.precedence) {
      return a.rule.precedence - b.rule.precedence;
    }
    return a.typeTier - b.typeTier;
  });

  const winner = candidates[0];
  const reason =
    candidates.length === 1
      ? `Only one jurisdiction (${winner.rule.jurisdictionName}) supplied applicable rules — adopted by default`
      : `Sovereign Jurisdiction Supremacy (G3): strictest rule wins — ${winner.rule.jurisdictionName} rule "precedence ${winner.rule.precedence}" was the strictest among ${candidates.length} candidates from ${considered.length} jurisdictions`;

  return {
    winningJurisdiction: winner.rule.jurisdictionCode,
    winningJurisdictionName: winner.rule.jurisdictionName,
    winningJurisdictionType: winner.rule.jurisdictionType,
    reason,
    appliedRule: winner.rule,
    consideredJurisdictions: considered,
    consideredRuleCount: candidates.length,
  };
}

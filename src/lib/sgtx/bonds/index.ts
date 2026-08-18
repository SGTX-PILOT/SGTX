// SGTX Part 31 — Customs Bond & Guarantee Management (CCL-006 / Add-On 8)
// =============================================================================
//
// Bond Calculation Engine — pure functions that implement jurisdiction-specific
// bond requirement formulas. The DB layer is touched ONLY by the seed
// function (`seedJurisdictionBondRules`) and the API routes; the calculation
// itself is pure so it can be unit-tested, replayed, and audited.
//
// Blueprint §31.1 — Jurisdiction Factors
//   EG  (Egypt)        standard=1.5, AEO=1.0   (Customs Law 207/2020 Art 54)
//   EU  (UCC)          standard=1.0, AEO-C=0.0  (UCC Art 93-100)
//   US  (CBP)          standard=3.0, C-TPAT=0.5 (CBP Directive 99-3510A)
//   AE  (UAE)          standard=1.0, AEO=0.5
//   SA  (Saudi)        standard=1.0, AEO=0.5
//   GB  (UK)           standard=1.0, AEO-C=0.5
//
// Special commodity factors (applied multiplicatively on top of the
// jurisdiction factor):
//   FOOD/PHARMA   → 1.2x
//   HAZARDOUS     → 2.0x
//   (default)     → 1.0x

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JurisdictionCode = "EG" | "EU" | "US" | "AE" | "SA" | "GB";
export type BondType =
  | "CASH_DEPOSIT"
  | "BANK_GUARANTEE"
  | "INSURANCE_BOND"
  | "GENERAL_BOND";
export type CommodityCategory = "FOOD" | "PHARMA" | "HAZARDOUS" | "GENERAL";

export interface JurisdictionBondRuleDef {
  jurisdictionCode: JurisdictionCode;
  standardFactor: number;
  aeoFactor: number;
  /** Programme name shown to users (e.g. "AEO-C", "C-TPAT"). */
  aeoProgramme: string;
  /** Available bond types in this jurisdiction. */
  bondTypes: BondType[];
  /** Mapping of commodity category → multiplicative factor. */
  specialCommodityFactors: Record<CommodityCategory, number>;
  /** Human-readable regulation citation. */
  sourceRegulation: string;
}

export interface CalculateBondInput {
  dutyAmount: number;
  /** ISO 3166-1 alpha-2 or regional block code (EG, EU, US, AE, SA, GB). */
  jurisdiction: string;
  aeoStatus: boolean;
  /** HS code OR category keyword (FOOD, PHARMA, HAZARDOUS, GENERAL). */
  commodityType?: string;
}

export interface CalculateBondResult {
  requiredAmount: number;
  factor: number;
  specialFactor: number;
  bondTypes: BondType[];
  explanation: string;
}

export interface BondLike {
  amount: number;
  jurisdiction: string;
  aeoStatus: boolean;
  bondType?: string;
  status?: string;
  validTo?: Date | string | null;
  verified?: boolean;
}

// ---------------------------------------------------------------------------
// Jurisdiction Bond Rules — full table (§31.1)
// ---------------------------------------------------------------------------

export const JURISDICTION_BOND_RULES: Record<
  JurisdictionCode,
  JurisdictionBondRuleDef
> = {
  EG: {
    jurisdictionCode: "EG",
    standardFactor: 1.5,
    aeoFactor: 1.0,
    aeoProgramme: "AEO (Egyptian Customs)",
    bondTypes: ["CASH_DEPOSIT", "BANK_GUARANTEE", "INSURANCE_BOND", "GENERAL_BOND"],
    specialCommodityFactors: {
      FOOD: 1.2,
      PHARMA: 1.2,
      HAZARDOUS: 2.0,
      GENERAL: 1.0,
    },
    sourceRegulation: "Egypt Customs Law 207/2020 — Article 54",
  },
  EU: {
    jurisdictionCode: "EU",
    standardFactor: 1.0,
    aeoFactor: 0.0,
    aeoProgramme: "AEO-C (UCC)",
    bondTypes: ["BANK_GUARANTEE", "INSURANCE_BOND", "GENERAL_BOND", "CASH_DEPOSIT"],
    specialCommodityFactors: {
      FOOD: 1.2,
      PHARMA: 1.2,
      HAZARDOUS: 2.0,
      GENERAL: 1.0,
    },
    sourceRegulation: "Union Customs Code (UCC) Articles 93-100",
  },
  US: {
    jurisdictionCode: "US",
    standardFactor: 3.0,
    aeoFactor: 0.5,
    aeoProgramme: "C-TPAT (CBP)",
    bondTypes: ["BANK_GUARANTEE", "INSURANCE_BOND", "GENERAL_BOND", "CASH_DEPOSIT"],
    specialCommodityFactors: {
      FOOD: 1.2,
      PHARMA: 1.2,
      HAZARDOUS: 2.0,
      GENERAL: 1.0,
    },
    sourceRegulation: "CBP Directive 99-3510A",
  },
  AE: {
    jurisdictionCode: "AE",
    standardFactor: 1.0,
    aeoFactor: 0.5,
    aeoProgramme: "AEO (UAE Federal Customs Authority)",
    bondTypes: ["BANK_GUARANTEE", "CASH_DEPOSIT", "INSURANCE_BOND", "GENERAL_BOND"],
    specialCommodityFactors: {
      FOOD: 1.2,
      PHARMA: 1.2,
      HAZARDOUS: 2.0,
      GENERAL: 1.0,
    },
    sourceRegulation: "UAE Federal Customs Authority — Common Customs Law",
  },
  SA: {
    jurisdictionCode: "SA",
    standardFactor: 1.0,
    aeoFactor: 0.5,
    aeoProgramme: "AEO (ZATCA / Saudi Customs)",
    bondTypes: ["BANK_GUARANTEE", "CASH_DEPOSIT", "INSURANCE_BOND", "GENERAL_BOND"],
    specialCommodityFactors: {
      FOOD: 1.2,
      PHARMA: 1.2,
      HAZARDOUS: 2.0,
      GENERAL: 1.0,
    },
    sourceRegulation: "ZATCA Customs Law — GCC Common Customs Law",
  },
  GB: {
    jurisdictionCode: "GB",
    standardFactor: 1.0,
    aeoFactor: 0.5,
    aeoProgramme: "AEO-C (HMRC)",
    bondTypes: ["BANK_GUARANTEE", "INSURANCE_BOND", "GENERAL_BOND", "CASH_DEPOSIT"],
    specialCommodityFactors: {
      FOOD: 1.2,
      PHARMA: 1.2,
      HAZARDOUS: 2.0,
      GENERAL: 1.0,
    },
    sourceRegulation: "HMRC Customs Declaration Service — AEO (Post-Brexit)",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALL_JURISDICTION_CODES = Object.keys(
  JURISDICTION_BOND_RULES,
) as JurisdictionCode[];

/**
 * Normalise a free-form jurisdiction string into the canonical code. Accepts
 * lowercase, leading/trailing whitespace, and a few common aliases.
 */
export function normaliseJurisdiction(jurisdiction: string): JurisdictionCode | null {
  if (!jurisdiction || typeof jurisdiction !== "string") return null;
  const j = jurisdiction.trim().toUpperCase();
  if (ALL_JURISDICTION_CODES.includes(j as JurisdictionCode)) {
    return j as JurisdictionCode;
  }
  // Aliases — be forgiving.
  if (j === "EGYPT") return "EG";
  if (j === "USA" || j === "UNITED_STATES") return "US";
  if (j === "UAE" || j === "UNITED_ARAB_EMIRATES") return "AE";
  if (j === "KSA" || j === "SAUDI" || j === "SAUDI_ARABIA") return "SA";
  if (j === "UK" || j === "UNITED_KINGDOM" || j === "BRITAIN") return "GB";
  if (j === "EUROPEAN_UNION") return "EU";
  return null;
}

/**
 * Map a commodity keyword / HS code to the canonical commodity category.
 * The match is heuristic — case-insensitive substring on the HS code.
 */
export function classifyCommodity(commodityType?: string): CommodityCategory {
  if (!commodityType) return "GENERAL";
  const c = commodityType.trim().toUpperCase();
  if (!c) return "GENERAL";
  // Direct category keyword.
  if (c === "FOOD" || c === "FOODSTUFF" || c === "FOODSTUFFS") return "FOOD";
  if (c === "PHARMA" || c === "PHARMACEUTICAL" || c === "PHARMACEUTICALS" || c === "MEDICINE") return "PHARMA";
  if (c === "HAZARDOUS" || c === "HAZMAT" || c === "DANGEROUS" || c === "DG") return "HAZARDOUS";
  // HS-code heuristic. Standard HS chapters (4-digit prefixes):
  //   02 = meat, 03 = fish, 04 = dairy, 07 = vegetables, 08 = fruit, 09 = coffee/tea,
  //   10 = cereals, 11 = milling, 15 = fats, 16 = preps of meat/fish, 17 = sugars,
  //   18 = cocoa, 19 = cereals prep, 20 = veg prep, 21 = misc edible prep,
  //   22 = beverages, 23 = animal feed, 24 = tobacco.
  if (/^(02|03|04|07|08|09|10|11|15|16|17|18|19|20|21|22|23|24)/.test(c)) return "FOOD";
  // 30 = pharmaceuticals.
  if (/^30/.test(c)) return "PHARMA";
  // 27 = mineral fuels, 28-29 = inorganic/organic chemicals, 36 = explosives,
  // 38 = misc chemical products (DG subset).
  if (/^(27|28|29|36|38)/.test(c)) return "HAZARDOUS";
  return "GENERAL";
}

// ---------------------------------------------------------------------------
// Core calculation
// ---------------------------------------------------------------------------

/**
 * Calculate the required bond amount for a given duty / jurisdiction / AEO
 * status / commodity. This is a PURE function — no DB access.
 *
 * Formula:
 *   requiredAmount = dutyAmount × factor × specialFactor
 *
 * where:
 *   factor        = aeoStatus ? aeoFactor : standardFactor
 *   specialFactor = specialCommodityFactors[classifyCommodity(commodityType)]
 *
 * Returns the breakdown plus a human-readable explanation.
 */
export function calculateBondRequirement(input: CalculateBondInput): CalculateBondResult {
  const duty = Number.isFinite(input.dutyAmount) ? Number(input.dutyAmount) : 0;
  const j = normaliseJurisdiction(input.jurisdiction);
  if (!j) {
    // Unknown jurisdiction — fall back to the strictest rule (US 3.0) and flag
    // the explanation so the caller can refuse the operation if desired.
    const fallback = JURISDICTION_BOND_RULES.US;
    const factor = input.aeoStatus ? fallback.aeoFactor : fallback.standardFactor;
    const category = classifyCommodity(input.commodityType);
    const specialFactor = fallback.specialCommodityFactors[category];
    const requiredAmount = duty * factor * specialFactor;
    return {
      requiredAmount,
      factor,
      specialFactor,
      bondTypes: fallback.bondTypes,
      explanation: `Unknown jurisdiction "${input.jurisdiction}" — defaulted to US (CBP) as the strictest baseline. ` +
        `Factor ${factor} × special ${specialFactor} → required ${requiredAmount.toFixed(2)} on duty ${duty.toFixed(2)}.`,
    };
  }

  const rule = JURISDICTION_BOND_RULES[j];
  const factor = input.aeoStatus ? rule.aeoFactor : rule.standardFactor;
  const category = classifyCommodity(input.commodityType);
  const specialFactor = rule.specialCommodityFactors[category];
  const requiredAmount = duty * factor * specialFactor;

  const explanation =
    `Jurisdiction ${j} (${rule.sourceRegulation}): ` +
    `factor=${factor}${input.aeoStatus ? ` (AEO: ${rule.aeoProgramme})` : " (standard)"} ` +
    `× commodity factor=${specialFactor} (${category}) ` +
    `→ required bond ${requiredAmount.toFixed(2)} on duty amount ${duty.toFixed(2)}.`;

  return {
    requiredAmount,
    factor,
    specialFactor,
    bondTypes: rule.bondTypes,
    explanation,
  };
}

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/**
 * Returns the available bond types for a jurisdiction.
 * Falls back to the US rule for unknown jurisdictions (strictest baseline).
 */
export function getAvailableBondTypes(jurisdiction: string): BondType[] {
  const j = normaliseJurisdiction(jurisdiction);
  if (!j) return JURISDICTION_BOND_RULES.US.bondTypes;
  return JURISDICTION_BOND_RULES[j].bondTypes;
}

/**
 * Validate a bond against jurisdiction rules. Returns a list of issues —
 * empty array means the bond is valid.
 */
export function validateBond(bond: BondLike): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const j = normaliseJurisdiction(bond.jurisdiction);
  if (!j) {
    issues.push(`Unknown jurisdiction: "${bond.jurisdiction}"`);
  } else {
    const rule = JURISDICTION_BOND_RULES[j];
    if (bond.bondType && !rule.bondTypes.includes(bond.bondType as BondType)) {
      issues.push(
        `Bond type "${bond.bondType}" is not available in jurisdiction ${j}. Available: ${rule.bondTypes.join(", ")}`,
      );
    }
  }
  if (!Number.isFinite(bond.amount) || bond.amount <= 0) {
    issues.push(`Bond amount must be a positive number (got ${bond.amount}).`);
  }
  if (bond.status === "EXPIRED" || bond.status === "CANCELLED") {
    issues.push(`Bond is ${bond.status} and cannot be used for new allocations.`);
  }
  if (bond.validTo) {
    const d = bond.validTo instanceof Date ? bond.validTo : new Date(bond.validTo);
    if (!isNaN(d.getTime()) && d.getTime() < Date.now()) {
      issues.push(`Bond expired on ${d.toISOString()}.`);
    }
  }
  if (bond.verified === false) {
    issues.push("Bond has not been verified with the issuer.");
  }
  return { valid: issues.length === 0, issues };
}

/**
 * Check whether a bond's available headroom covers the required amount.
 *
 * "Sufficient" means: bond is valid, not expired, AND
 *   bond.amount − Σ(active allocations) ≥ requiredAmount
 *
 * Because computing live allocations requires DB access, callers may pass the
 * already-utilised amount as `utilisedAmount`. Without it we just compare face
 * value to the requirement.
 */
export function checkBondSufficiency(
  bond: BondLike,
  requiredAmount: number,
  utilisedAmount = 0,
): { sufficient: boolean; available: number; shortfall: number; reason?: string } {
  const validation = validateBond(bond);
  if (!validation.valid) {
    return {
      sufficient: false,
      available: 0,
      shortfall: Math.max(0, requiredAmount),
      reason: validation.issues.join("; "),
    };
  }
  const available = Math.max(0, (bond.amount || 0) - utilisedAmount);
  const sufficient = available >= requiredAmount;
  return {
    sufficient,
    available,
    shortfall: sufficient ? 0 : requiredAmount - available,
    reason: sufficient
      ? undefined
      : `Bond headroom ${available.toFixed(2)} is short of required ${requiredAmount.toFixed(2)} by ${(requiredAmount - available).toFixed(2)}.`,
  };
}

// ---------------------------------------------------------------------------
// Seed — populates JurisdictionBondRule table for all 6 jurisdictions
// ---------------------------------------------------------------------------

/**
 * Seed the JurisdictionBondRule table with the default factors for all 6
 * jurisdictions. Idempotent — only inserts when the table is empty or when
 * new jurisdictions appear.
 *
 * Safe to call repeatedly; never throws.
 */
export async function seedJurisdictionBondRules(): Promise<{
  seeded: number;
  skipped: number;
  total: number;
}> {
  try {
    const existing = await db.jurisdictionBondRule.findMany({
      select: { jurisdictionCode: true, bondType: true },
    });
    const existingKeys = new Set(
      existing.map((r) => `${r.jurisdictionCode}::${r.bondType}`),
    );

    const toCreate: Array<{
      jurisdictionCode: string;
      bondType: string;
      defaultFactor: number | null;
      aeoFactor: number | null;
      specialCommodityFactors: string | null;
      sourceRegulation: string | null;
      isActive: boolean;
      validFrom: Date;
    }> = [];

    for (const code of ALL_JURISDICTION_CODES) {
      const rule = JURISDICTION_BOND_RULES[code];
      // Persist one row per bond type so per-type overrides are possible later.
      for (const bt of rule.bondTypes) {
        const key = `${code}::${bt}`;
        if (existingKeys.has(key)) continue;
        toCreate.push({
          jurisdictionCode: code,
          bondType: bt,
          defaultFactor: rule.standardFactor,
          aeoFactor: rule.aeoFactor,
          specialCommodityFactors: JSON.stringify(rule.specialCommodityFactors),
          sourceRegulation: rule.sourceRegulation,
          isActive: true,
          validFrom: new Date(),
        });
      }
    }

    if (toCreate.length === 0) {
      const total = await db.jurisdictionBondRule.count();
      return { seeded: 0, skipped: 0, total };
    }

    await db.jurisdictionBondRule.createMany({ data: toCreate, skipDuplicates: true });
    const total = await db.jurisdictionBondRule.count();
    logger.info("JurisdictionBondRule seeded", {
      seeded: toCreate.length,
      total,
    });
    return { seeded: toCreate.length, skipped: 0, total };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("seedJurisdictionBondRules failed", { error: msg });
    return { seeded: 0, skipped: 0, total: 0 };
  }
}

/**
 * Lazy seed helper — calls `seedJurisdictionBondRules()` only if the table
 * appears empty. Used by the bond calculate route to auto-bootstrap rules on
 * first request without paying the cost on every subsequent call.
 */
export async function ensureJurisdictionBondRulesSeeded(): Promise<void> {
  try {
    const count = await db.jurisdictionBondRule.count();
    if (count === 0) {
      await seedJurisdictionBondRules();
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn("ensureJurisdictionBondRulesSeeded check failed", { error: msg });
  }
}

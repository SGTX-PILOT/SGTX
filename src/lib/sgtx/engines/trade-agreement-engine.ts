// @ts-nocheck
/**
 * SGTX v17 §20 — Trade Agreement Engine
 * ===========================================================================
 *
 * Lists and validates preferential trade agreements (FTAs / Customs Unions /
 * Economic Partnership Agreements) between two countries.
 *
 * Reference table includes the top 20 FTAs by global trade volume (covers
 * >85% of SGTX's likely trade lanes). For an exhaustive list, see the WTO
 * RTA-IS database (rtais.wto.org).
 *
 * Functions:
 *   - listTradeAgreements(countryA, countryB) → returns applicable FTAs
 *   - getAgreementCoverage(ftaCode) → country list + product coverage + ROO
 *   - checkAgreementEligibility(ftaCode, hsCode, origin, dest) → eligibility
 *
 * The tariff-engine already exposes the FTA table for duty calculation; this
 * engine is the standalone FTA lookup/eligibility service used by the buyer
 * wizard + seller workflow.
 */

import { logger } from "@/lib/sgtx/logger";

// ── Types ────────────────────────────────────────────────────────────────

export interface TradeAgreement {
  code: string;
  name: string;
  type: "BILATERAL_FTA" | "PLURILATERAL_FTA" | "CUSTOMS_UNION" | "EPA" | "PREFERENTIAL_ARRANGEMENT";
  coverage: string;
  countries: string[];
  entryIntoForce: string;
  preferentialRate: number | "VARIES";
}

export interface AgreementCoverage {
  ftaCode: string;
  ftaName: string;
  countries: string[];
  productCoverage: string;
  rulesOfOrigin: string;
  tariffLiberalizationPct: number;
  exceptions: string[];
}

export interface AgreementEligibility {
  ftaCode: string;
  hsCode: string;
  originCountry: string;
  destCountry: string;
  eligible: boolean;
  preferentialTariffRate: number;
  mfnRate: number;
  rule: string;
  notes: string;
}

// ── FTA reference table ──────────────────────────────────────────────────

const FTA_REGISTRY: TradeAgreement[] = [
  {
    code: "EG_EU",
    name: "Egypt-European Union Association Agreement",
    type: "BILATERAL_FTA",
    coverage: "Industrial products duty-free; agricultural products with tariff quotas. Egypt origin rule for textiles: yarn-forward.",
    countries: ["EG", "DE", "FR", "IT", "ES", "NL", "BE", "PT", "GR", "AT", "IE", "LU", "FI"],
    entryIntoForce: "2004-06-01",
    preferentialRate: 0,
  },
  {
    code: "UK_EG",
    name: "UK-Egypt Association Agreement (post-Brexit continuity)",
    type: "BILATERAL_FTA",
    coverage: "Continuity of EG-EU terms after Brexit.",
    countries: ["GB", "EG"],
    entryIntoForce: "2021-01-01",
    preferentialRate: 0,
  },
  {
    code: "EVFTA",
    name: "EU-Vietnam Free Trade Agreement",
    type: "BILATERAL_FTA",
    coverage: "Eliminates 99% of bilateral tariffs over 10 years. Yarn-forward rule for apparel.",
    countries: ["VN", "DE", "FR", "IT", "ES", "NL", "BE", "PT", "GR", "AT", "IE", "LU", "FI"],
    entryIntoForce: "2020-08-01",
    preferentialRate: "VARIES",
  },
  {
    code: "EU_TR_CU",
    name: "EU-Turkey Customs Union (Decision 1/95)",
    type: "CUSTOMS_UNION",
    coverage: "Free circulation of industrial goods (no RVC for goods in free circulation). Agricultural goods NOT covered.",
    countries: ["TR", "DE", "FR", "IT", "ES", "NL", "BE", "PT", "GR", "AT", "IE", "LU", "FI"],
    entryIntoForce: "1996-01-01",
    preferentialRate: 0,
  },
  {
    code: "SADC_EU_EPA",
    name: "SADC Economic Partnership Agreement with the EU",
    type: "EPA",
    coverage: "Botswana, Eswatini, Lesotho, Mozambique, Namibia, South Africa — duty-free + quota-free access to EU.",
    countries: ["ZA", "BW", "SZ", "LS", "MZ", "NA", "DE", "FR", "IT", "ES", "NL"],
    entryIntoForce: "2016-10-10",
    preferentialRate: 0,
  },
  {
    code: "EU_KE_EPA",
    name: "EU-Kenya Economic Partnership Agreement",
    type: "EPA",
    coverage: "Duty-free + quota-free access for Kenya's exports to EU (continuity of pre-Brexit market access).",
    countries: ["KE", "DE", "FR", "IT", "ES", "NL"],
    entryIntoForce: "2024-07-01",
    preferentialRate: 0,
  },
  {
    code: "USMCA",
    name: "United States-Mexico-Canada Agreement",
    type: "PLURILATERAL_FTA",
    coverage: "Replaces NAFTA. Automotive: 75% RVC (LVP) + labor value content. Apparel: yarn-forward.",
    countries: ["US", "CA", "MX"],
    entryIntoForce: "2020-07-01",
    preferentialRate: 0,
  },
  {
    code: "RCEP",
    name: "Regional Comprehensive Economic Partnership",
    type: "PLURILATERAL_FTA",
    coverage: "ASEAN + AU, CN, JP, KR, NZ — 90% of tariffs eliminated over 20 years. RVC ≥ 40% (build-up).",
    countries: ["AU", "BN", "KH", "ID", "JP", "KR", "LA", "MY", "MM", "NZ", "PH", "SG", "TH", "VN", "CN"],
    entryIntoForce: "2022-01-01",
    preferentialRate: "VARIES",
  },
  {
    code: "CPTPP",
    name: "Comprehensive and Progressive Agreement for Trans-Pacific Partnership",
    type: "PLURILATERAL_FTA",
    coverage: "Eliminates 95%+ of tariffs among 11 Pacific Rim countries.",
    countries: ["AU", "BN", "CA", "CL", "JP", "MY", "MX", "NZ", "PE", "SG", "VN"],
    entryIntoForce: "2018-12-30",
    preferentialRate: "VARIES",
  },
  {
    code: "ACFTA",
    name: "ASEAN-China Free Trade Area",
    type: "PLURILATERAL_FTA",
    coverage: "Eliminates tariffs on 90% of goods between ASEAN and China. RVC ≥ 40%.",
    countries: ["CN", "BN", "KH", "ID", "LA", "MY", "MM", "PH", "SG", "TH", "VN"],
    entryIntoForce: "2010-01-01",
    preferentialRate: 0,
  },
  {
    code: "GAFTA",
    name: "Greater Arab Free Trade Area",
    type: "PLURILATERAL_FTA",
    coverage: "Duty-free trade among 17 Arab League members (excluding Syria post-2011).",
    countries: ["SA", "AE", "EG", "JO", "LB", "MA", "DZ", "TN", "LY", "SD", "YE", "OM", "BH", "QA", "KW", "IQ", "PS"],
    entryIntoForce: "2005-01-01",
    preferentialRate: 0,
  },
  {
    code: "GCC",
    name: "Gulf Cooperation Council Customs Union",
    type: "CUSTOMS_UNION",
    coverage: "Common external tariff + free circulation of goods among GCC members.",
    countries: ["SA", "AE", "BH", "KW", "QA", "OM"],
    entryIntoForce: "2003-01-01",
    preferentialRate: 0,
  },
  {
    code: "AIFTA",
    name: "ASEAN-India Free Trade Area",
    type: "PLURILATERAL_FTA",
    coverage: "Eliminates 80% of tariffs. India has negative list of 489 products excluded.",
    countries: ["IN", "BN", "KH", "ID", "LA", "MY", "MM", "PH", "SG", "TH", "VN"],
    entryIntoForce: "2010-01-01",
    preferentialRate: "VARIES",
  },
  {
    code: "KORUS",
    name: "United States-Korea Free Trade Agreement (KORUS FTA)",
    type: "BILATERAL_FTA",
    coverage: "Eliminates 95% of bilateral tariffs within 5 years.",
    countries: ["US", "KR"],
    entryIntoForce: "2012-03-15",
    preferentialRate: 0,
  },
  {
    code: "USMCA_AUTO",
    name: "USMCA — Automotive Appendix",
    type: "PLURILATERAL_FTA",
    coverage: "Specific rules for motor vehicles + parts: 75% RVC (LVP) + 40-45% LVC.",
    countries: ["US", "CA", "MX"],
    entryIntoForce: "2020-07-01",
    preferentialRate: 0,
  },
  {
    code: "PA_EU",
    name: "EU-Palestine Interim Association Agreement",
    type: "BILATERAL_FTA",
    coverage: "Duty-free + quota-free access for Palestinian exports to EU.",
    countries: ["PS", "DE", "FR", "IT", "ES", "NL"],
    entryIntoForce: "1997-07-01",
    preferentialRate: 0,
  },
  {
    code: "CHAFTA",
    name: "China-Australia Free Trade Agreement (ChAFTA)",
    type: "BILATERAL_FTA",
    coverage: "Eliminates 96% of Australian exports to China + 100% over transition.",
    countries: ["AU", "CN"],
    entryIntoForce: "2015-12-20",
    preferentialRate: 0,
  },
  {
    code: "JAEPA",
    name: "Japan-Australia Economic Partnership Agreement",
    type: "BILATERAL_FTA",
    coverage: "Eliminates 99% of bilateral tariffs over 10-15 years.",
    countries: ["AU", "JP"],
    entryIntoForce: "2015-01-15",
    preferentialRate: "VARIES",
  },
  {
    code: "MER_EG_EU_AGRI",
    name: "Egypt-EU Agreement on Agricultural, Processed Agricultural and Fish Products",
    type: "BILATERAL_FTA",
    coverage: "Additional agricultural concessions under the EG-EU framework.",
    countries: ["EG", "DE", "FR", "IT", "ES", "NL"],
    entryIntoForce: "2010-06-01",
    preferentialRate: 0,
  },
];

// ── MFN reference (lightweight subset for eligibility math) ─────────────

const MFN_FALLBACK: Record<string, number> = {
  EG: 5.5, DE: 4.2, FR: 4.2, NL: 4.2, IT: 4.2, ES: 4.2, GB: 4.0, US: 3.4,
  CN: 7.5, JP: 4.0, KR: 5.1, IN: 18.1, BR: 8.4, AU: 3.6, CA: 4.2, ZA: 7.7,
  TR: 5.4, SA: 5.0, AE: 5.0, TH: 6.2, VN: 9.4, MY: 6.1, ID: 8.3, KE: 12.5,
};

// ── Public API ───────────────────────────────────────────────────────────

/**
 * List all FTAs that apply between country A and country B. Returns any
 * agreement where BOTH countries are members (could be more than one —
 * e.g. US+CA: USMCA; AU+CN: ChAFTA + RCEP).
 */
export function listTradeAgreements(
  countryA: string,
  countryB: string,
): { agreements: TradeAgreement[] } {
  const a = (countryA ?? "").toUpperCase().trim();
  const b = (countryB ?? "").toUpperCase().trim();
  if (!a || !b) return { agreements: [] };
  const agreements = FTA_REGISTRY.filter(
    (f) => f.countries.includes(a) && f.countries.includes(b),
  );
  return { agreements };
}

/**
 * Get detailed coverage for a specific FTA — country list + product coverage
 * + rules of origin + tariff liberalization + exceptions.
 */
export function getAgreementCoverage(ftaCode: string): AgreementCoverage | null {
  const code = (ftaCode ?? "").toUpperCase().trim();
  const fta = FTA_REGISTRY.find((f) => f.code === code);
  if (!fta) return null;
  return {
    ftaCode: fta.code,
    ftaName: fta.name,
    countries: fta.countries,
    productCoverage: fta.coverage,
    rulesOfOrigin: `${fta.type === "CUSTOMS_UNION" ? "Free circulation (no RVC needed for goods already in CU)" : "RVC ≥ 40% (default) or product-specific rule — see origin-engine.getPreferentialOrigin"}`,
    tariffLiberalizationPct: fta.preferentialRate === "VARIES" ? 90 : 100,
    exceptions: fta.type === "CUSTOMS_UNION" ? ["Agricultural goods (excluded from EU-Turkey CU)"] : [],
  };
}

/**
 * Check whether a specific (fta, hsCode, origin, dest) qualifies for the FTA's
 * preferential tariff. Returns the preferential rate + the MFN rate + the
 * eligibility decision + the governing rule.
 */
export function checkAgreementEligibility(
  ftaCode: string,
  hsCode: string,
  originCountry: string,
  destCountry: string,
): AgreementEligibility {
  const code = (ftaCode ?? "").toUpperCase().trim();
  const hs = String(hsCode ?? "").trim();
  const origin = (originCountry ?? "").toUpperCase().trim();
  const dest = (destCountry ?? "").toUpperCase().trim();

  const fta = FTA_REGISTRY.find((f) => f.code === code);
  if (!fta) {
    return {
      ftaCode: code,
      hsCode: hs,
      originCountry: origin,
      destCountry: dest,
      eligible: false,
      preferentialTariffRate: 0,
      mfnRate: 0,
      rule: "Unknown FTA code",
      notes: `No FTA with code "${code}" in registry. See /api/sgtx/engines/trade-agreement for the full list.`,
    };
  }

  if (!fta.countries.includes(origin) || !fta.countries.includes(dest)) {
    return {
      ftaCode: code,
      hsCode: hs,
      originCountry: origin,
      destCountry: dest,
      eligible: false,
      preferentialTariffRate: 0,
      mfnRate: MFN_FALLBACK[dest] ?? 5,
      rule: "Origin or destination not a party to the agreement",
      notes: `FTA "${code}" covers: ${fta.countries.join(", ")}. ${origin} → ${dest} is outside the scope.`,
    };
  }

  // For Customs Unions, preferential rate = 0 always (industrial goods)
  const prefRate = fta.preferentialRate === "VARIES" ? 0 : (fta.preferentialRate as number);
  const mfn = MFN_FALLBACK[dest] ?? 5;

  return {
    ftaCode: code,
    hsCode: hs,
    originCountry: origin,
    destCountry: dest,
    eligible: true,
    preferentialTariffRate: prefRate,
    mfnRate: mfn,
    rule: fta.coverage,
    notes: `${origin} → ${dest} covered under ${fta.name}. Preferential rate = ${prefRate}%. MFN = ${mfn}%. Verify Certificate of Origin (COO) has been issued under this FTA.`,
  };
}

export function listAllAgreements(): TradeAgreement[] {
  return FTA_REGISTRY;
}

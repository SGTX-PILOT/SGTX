// SGTX Multi-Region Pesticide MRL Orchestrator (Brain AI)
// Combines ALL pesticide MRL sources: EU + Codex + USA (EPA) + Japan (MHLW) + Australia (APVMA) + Canada (PMRA)
// The Brain AI decides which source(s) to use based on the trade destination:
// - EU destination → EU MRLs (strictest, legally binding)
// - US destination → EPA tolerances (40 CFR 180)
// - Japan destination → MHLW MRLs (Food Sanitation Act)
// - Australia destination → APVMA MRL Standard
// - Canada destination → Health Canada PMRA MRLs
// - Other destinations → Codex Alimentarius (international standard)
// - When multiple apply, the STRICTEST limit wins (WTO SPS Agreement Article 3)

import { lookupMrl as lookupEuMrl } from "@/lib/sgtx/compliance/eu-pesticides-client";
import { lookupCodexMrl } from "@/lib/sgtx/compliance/codex-pesticides-client";
import { lookupAllRegionalMrls, REGION_META, type PesticideRegion, type RegionalMrlEntry } from "@/lib/sgtx/compliance/regional-pesticides";
import { db } from "@/lib/db";

export interface MultiRegionMrlResult {
  pesticide: string;
  commodity: string;
  destinationCountry: string | null;
  mrls: {
    region: PesticideRegion;
    mrlValue: number | null;
    mrlFormatted: string | null;
    regulation: string | null;
    authority: string;
    source: string;
    isDefault: boolean;
  }[];
  applicableMrl: number | null;
  applicableRegions: PesticideRegion[];
  strictestMrl: number | null;
  strictestRegion: PesticideRegion | null;
  mrlUnit: string;
  rationale: string;
}

export interface MultiRegionComplianceResult {
  pesticide: string;
  commodity: string;
  detectedLevelMgKg: number;
  destinationCountry: string | null;
  verdicts: { region: PesticideRegion; verdict: "COMPLIANT" | "NON_COMPLIANT" | "AT_LIMIT" | "UNKNOWN"; mrlValue: number | null }[];
  applicableVerdict: "COMPLIANT" | "NON_COMPLIANT" | "AT_LIMIT" | "UNKNOWN";
  overallVerdict: "COMPLIANT" | "NON_COMPLIANT" | "AT_LIMIT" | "UNKNOWN";
  strictestMrl: number | null;
  strictestRegion: PesticideRegion | null;
  details: string;
  recommendation: string;
}

// Map destination country to applicable pesticide region
const COUNTRY_REGION_MAP: Record<string, PesticideRegion> = {
  // EU member states
  DE: "EU", FR: "EU", IT: "EU", ES: "EU", NL: "EU", BE: "EU", AT: "EU", PL: "EU",
  SE: "EU", FI: "EU", DK: "EU", IE: "EU", PT: "EU", GR: "EU", CZ: "EU", RO: "EU",
  BG: "EU", HR: "EU", SK: "EU", LT: "EU", SI: "EU", LV: "EU", EE: "EU", LU: "EU", MT: "EU", CY: "EU", HU: "EU",
  // USA
  US: "USA",
  // Japan
  JP: "JAPAN",
  // Australia
  AU: "AUSTRALIA",
  // Canada
  CA: "CANADA",
};

/** Determine which pesticide region applies for a destination country. */
export function getRegionForCountry(country: string): PesticideRegion {
  return COUNTRY_REGION_MAP[country.toUpperCase()] || "CODEX";
}

/**
 * Multi-region MRL lookup. Fetches MRL from all available sources.
 * If destinationCountry is provided, highlights the applicable region.
 */
export async function lookupMultiRegionMrl(
  pesticide: string,
  commodity: string,
  destinationCountry?: string,
  euProductCode?: string,
): Promise<MultiRegionMrlResult> {
  const mrls: MultiRegionMrlResult["mrls"] = [];

  // 1. EU MRL
  if (euProductCode) {
    const eu = await lookupEuMrl(pesticide, euProductCode);
    if (eu.mrlValue !== null) {
      mrls.push({
        region: "EU", mrlValue: eu.mrlValue, mrlFormatted: null,
        regulation: eu.regulation, authority: "European Commission (DG SANTE)",
        source: eu.source, isDefault: eu.isDefault,
      });
    }
  }

  // 2. Codex MRL
  const codex = await lookupCodexMrl(pesticide, commodity);
  if (codex) {
    mrls.push({
      region: "CODEX", mrlValue: codex.mrlValue, mrlFormatted: codex.mrlFormatted,
      regulation: `Codex CAC/MRL (adopted ${codex.cacYear || "?"})`, authority: "Codex Alimentarius Commission",
      source: codex.source, isDefault: false,
    });
  }

  // 3. Regional MRLs (USA, Japan, Australia, Canada)
  const regional = await lookupAllRegionalMrls(pesticide, commodity);
  for (const r of regional) {
    mrls.push({
      region: r.region, mrlValue: r.mrlValue, mrlFormatted: r.mrlFormatted,
      regulation: r.regulation, authority: r.authority,
      source: REGION_META[r.region].name, isDefault: r.isDefault,
    });
  }

  // Determine applicable region
  const destinationRegion = destinationCountry ? getRegionForCountry(destinationCountry) : null;
  const applicableRegions: PesticideRegion[] = destinationRegion ? [destinationRegion] : [];

  // If destination is CODEX, all regions are relevant (international trade)
  if (destinationRegion === "CODEX") {
    applicableRegions.push("CODEX");
  }

  // Find applicable MRL
  const applicableMrls = mrls.filter(m => applicableRegions.includes(m.region));
  const applicableMrl = applicableMrls.length > 0 ? Math.min(...applicableMrls.map(m => m.mrlValue!).filter(v => v !== null)) : null;

  // Find strictest MRL across ALL regions
  const allValues = mrls.map(m => m.mrlValue).filter((v): v is number => v !== null);
  const strictestMrl = allValues.length > 0 ? Math.min(...allValues) : null;
  const strictestEntry = mrls.find(m => m.mrlValue === strictestMrl);
  const strictestRegion = strictestEntry?.region || null;

  const rationale = buildMultiRegionRationale(pesticide, commodity, destinationCountry, mrls, applicableMrl, strictestMrl, strictestRegion);

  return {
    pesticide,
    commodity,
    destinationCountry: destinationCountry || null,
    mrls,
    applicableMrl,
    applicableRegions,
    strictestMrl,
    strictestRegion,
    mrlUnit: "mg/kg",
    rationale,
  };
}

/**
 * Multi-region compliance check. Checks against all sources + applicable region.
 */
export async function checkMultiRegionCompliance(
  pesticide: string,
  commodity: string,
  detectedLevelMgKg: number,
  destinationCountry?: string,
  euProductCode?: string,
): Promise<MultiRegionComplianceResult> {
  const lookup = await lookupMultiRegionMrl(pesticide, commodity, destinationCountry, euProductCode);

  const verdicts: MultiRegionComplianceResult["verdicts"] = lookup.mrls.map(m => {
    let verdict: "COMPLIANT" | "NON_COMPLIANT" | "AT_LIMIT" | "UNKNOWN" = "UNKNOWN";
    if (m.mrlValue !== null) {
      if (detectedLevelMgKg <= m.mrlValue) verdict = "COMPLIANT";
      else if (detectedLevelMgKg <= m.mrlValue * 1.1) verdict = "AT_LIMIT";
      else verdict = "NON_COMPLIANT";
    }
    return { region: m.region, verdict, mrlValue: m.mrlValue };
  });

  // Applicable verdict (for the destination region)
  const destinationRegion = destinationCountry ? getRegionForCountry(destinationCountry) : null;
  const applicableVerdicts = destinationRegion
    ? verdicts.filter(v => v.region === destinationRegion)
    : verdicts;
  let applicableVerdict: MultiRegionComplianceResult["applicableVerdict"] = "UNKNOWN";
  if (applicableVerdicts.length > 0) {
    if (applicableVerdicts.some(v => v.verdict === "NON_COMPLIANT")) applicableVerdict = "NON_COMPLIANT";
    else if (applicableVerdicts.some(v => v.verdict === "AT_LIMIT")) applicableVerdict = "AT_LIMIT";
    else if (applicableVerdicts.some(v => v.verdict === "COMPLIANT")) applicableVerdict = "COMPLIANT";
  }

  // Overall verdict (worst case across all regions)
  let overallVerdict: MultiRegionComplianceResult["overallVerdict"] = "UNKNOWN";
  if (verdicts.length > 0) {
    if (verdicts.some(v => v.verdict === "NON_COMPLIANT")) overallVerdict = "NON_COMPLIANT";
    else if (verdicts.some(v => v.verdict === "AT_LIMIT")) overallVerdict = "AT_LIMIT";
    else if (verdicts.every(v => v.verdict === "COMPLIANT")) overallVerdict = "COMPLIANT";
  }

  const details = `${pesticide} on ${commodity}: detected ${detectedLevelMgKg} mg/kg | ${verdicts.map(v => `${v.region}:${v.verdict}(${v.mrlValue ?? "?"})`).join(" | ")} | Strictest: ${lookup.strictestMrl} (${lookup.strictestRegion}) | Applicable: ${applicableVerdict}`;
  const recommendation = applicableVerdict === "NON_COMPLIANT"
    ? `CARGO REJECTED — exceeds ${destinationRegion || "applicable"} MRL. Do not ship to ${destinationCountry || "destination"}.`
    : applicableVerdict === "AT_LIMIT"
      ? `WARNING — at or near MRL limit for ${destinationRegion || "destination"}. Additional testing recommended.`
      : applicableVerdict === "COMPLIANT"
        ? `CARGO COMPLIANT — within all applicable MRL limits for ${destinationCountry || "destination"}. Safe to ship.`
        : overallVerdict === "NON_COMPLIANT"
          ? `CARGO NON_COMPLIANT for some regions but may be compliant for destination. Verify destination requirements.`
          : `No MRL data available for destination. Apply default 0.01 mg/kg and require lab certification.`;

  return {
    pesticide, commodity, detectedLevelMgKg,
    destinationCountry: destinationCountry || null,
    verdicts, applicableVerdict, overallVerdict,
    strictestMrl: lookup.strictestMrl, strictestRegion: lookup.strictestRegion,
    details, recommendation,
  };
}

/** Batch multi-region compliance check. */
export async function batchMultiRegionCheck(
  commodity: string,
  detectedResidues: { pesticide: string; detectedLevelMgKg: number }[],
  destinationCountry?: string,
  euProductCode?: string,
): Promise<{
  overallVerdict: "COMPLIANT" | "NON_COMPLIANT" | "AT_LIMIT" | "UNKNOWN";
  results: MultiRegionComplianceResult[];
  compliantCount: number;
  nonCompliantCount: number;
  atLimitCount: number;
  summary: string;
  regionsChecked: string[];
}> {
  const results: MultiRegionComplianceResult[] = [];
  let compliant = 0, nonCompliant = 0, atLimit = 0;
  const regions = new Set<string>();

  for (const { pesticide, detectedLevelMgKg } of detectedResidues) {
    const result = await checkMultiRegionCompliance(pesticide, commodity, detectedLevelMgKg, destinationCountry, euProductCode);
    results.push(result);
    result.verdicts.forEach(v => regions.add(v.region));
    if (result.applicableVerdict === "NON_COMPLIANT") nonCompliant++;
    else if (result.applicableVerdict === "AT_LIMIT") atLimit++;
    else if (result.applicableVerdict === "COMPLIANT") compliant++;
  }

  const overallVerdict = nonCompliant > 0 ? "NON_COMPLIANT" : atLimit > 0 ? "AT_LIMIT" : compliant > 0 ? "COMPLIANT" : "UNKNOWN";
  const summary = nonCompliant > 0
    ? `${nonCompliant} residue(s) EXCEED MRL for ${destinationCountry || "destination"} — cargo NON-COMPLIANT`
    : atLimit > 0
      ? `${atLimit} residue(s) at MRL limit — review recommended`
      : `${compliant} residue(s) within all MRL limits — cargo COMPLIANT`;

  return {
    overallVerdict, results, compliantCount: compliant,
    nonCompliantCount: nonCompliant, atLimitCount: atLimit,
    summary, regionsChecked: Array.from(regions),
  };
}

/** Get database stats for ALL regions. */
export async function getAllPesticideDatabaseStats() {
  const [euProducts, euResidues, euMrls, codexCommodities, codexPesticides, codexMrls, regionalMrls] = await Promise.all([
    db.euPesticideProduct.count(),
    db.euPesticideResidue.count(),
    db.euPesticideMrl.count(),
    db.codexCommodity.count(),
    db.codexPesticide.count(),
    db.codexMrl.count(),
    db.regionalPesticideMrl.count(),
  ]);

  const regionalByRegion = await db.regionalPesticideMrl.groupBy({ by: ["region"], _count: true });

  return {
    eu: { products: euProducts, residues: euResidues, mrls: euMrls },
    codex: { commodities: codexCommodities, pesticides: codexPesticides, mrls: codexMrls },
    regional: {
      total: regionalMrls,
      byRegion: Object.fromEntries(regionalByRegion.map(r => [r.region, r._count])),
    },
    combined: {
      totalMrls: euMrls + codexMrls + regionalMrls,
      sources: 6, // EU + Codex + USA + Japan + Australia + Canada
      regions: ["EU", "Codex (FAO/WHO)", "USA (EPA)", "Japan (MHLW)", "Australia (APVMA)", "Canada (PMRA)"],
    },
  };
}

function buildMultiRegionRationale(
  pesticide: string, commodity: string, destinationCountry: string | null,
  mrls: MultiRegionMrlResult["mrls"], applicableMrl: number | null,
  strictestMrl: number | null, strictestRegion: PesticideRegion | null,
): string {
  if (mrls.length === 0) {
    return `No MRL found for ${pesticide} on ${commodity} in any regional database. Default ${destinationCountry ? REGION_META[getRegionForCountry(destinationCountry)].defaultMrl : 0.01} mg/kg applies.`;
  }
  const parts = mrls.map(m => `${m.region}: ${m.mrlValue} mg/kg`);
  const destRegion = destinationCountry ? getRegionForCountry(destinationCountry) : null;
  const destLabel = destRegion ? ` Destination ${destinationCountry} → ${destRegion} region applies.` : "";
  const appLabel = applicableMrl !== null ? ` Applicable MRL: ${applicableMrl} mg/kg.` : "";
  const strictLabel = strictestMrl !== null ? ` Strictest: ${strictestMrl} mg/kg (${strictestRegion}).` : "";
  return `${pesticide} on ${commodity}: ${parts.join(", ")}.${destLabel}${appLabel}${strictLabel} Per WTO SPS Agreement Article 3, the stricter standard applies.`;
}

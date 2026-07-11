// SGTX Multi-Source Pesticide MRL Orchestrator (Brain AI)
// Combines EU Pesticides Database + Codex Alimentarius (FAO/WHO) into a unified view.
// The Brain AI decides which source to use based on the trade lane:
// - EU MRLs apply for EU destination (stricter, legally binding in EU)
// - Codex MRLs apply for non-EU destinations (international standard, WTO SPS recognized)
// - When both exist, the STRICTER limit applies (per WTO SPS Agreement Article 3)

import { lookupMrl as lookupEuMrl, checkMrlCompliance as checkEuMrl } from "@/lib/sgtx/compliance/eu-pesticides-client";
import { lookupCodexMrl } from "@/lib/sgtx/compliance/codex-pesticides-client";
import { db } from "@/lib/db";

export type MrlSource = "EU" | "CODEX" | "BOTH" | "NONE";
export type MrlStrictness = "STRICTEST" | "EU" | "CODEX";

export interface MultiSourceMrlResult {
  pesticide: string;
  commodity: string;
  euMrl: { mrlValue: number | null; source: string; regulation: string | null; isLod: boolean; isDefault: boolean } | null;
  codexMrl: { mrlValue: number | null; mrlFormatted: string | null; source: string; cacYear: number | null } | null;
  applicableMrl: number | null;
  applicableSource: MrlSource;
  strictestMrl: number | null;
  strictestSource: MrlSource;
  mrlUnit: string;
  rationale: string;
}

export interface MultiSourceComplianceResult {
  pesticide: string;
  commodity: string;
  detectedLevelMgKg: number;
  euVerdict: "COMPLIANT" | "NON_COMPLIANT" | "AT_LIMIT" | "UNKNOWN";
  codexVerdict: "COMPLIANT" | "NON_COMPLIANT" | "AT_LIMIT" | "UNKNOWN";
  overallVerdict: "COMPLIANT" | "NON_COMPLIANT" | "AT_LIMIT" | "UNKNOWN";
  applicableVerdict: "COMPLIANT" | "NON_COMPLIANT" | "AT_LIMIT" | "UNKNOWN";
  euMrlValue: number | null;
  codexMrlValue: number | null;
  strictestMrlValue: number | null;
  strictestSource: MrlSource;
  details: string;
  recommendation: string;
}

/**
 * The Brain AI multi-source MRL lookup.
 * Fetches MRL from both EU + Codex databases, returns the unified view.
 */
export async function lookupMultiSourceMrl(
  pesticide: string,
  commodityName: string,
  euProductCode?: string,
): Promise<MultiSourceMrlResult> {
  // Fetch EU MRL (if product code provided)
  let euMrl: MultiSourceMrlResult["euMrl"] = null;
  if (euProductCode) {
    const eu = await lookupEuMrl(pesticide, euProductCode);
    euMrl = {
      mrlValue: eu.mrlValue,
      source: eu.source,
      regulation: eu.regulation,
      isLod: eu.isLod,
      isDefault: eu.isDefault,
    };
  }

  // Fetch Codex MRL
  const codex = await lookupCodexMrl(pesticide, commodityName);
  const codexMrl: MultiSourceMrlResult["codexMrl"] = codex ? {
    mrlValue: codex.mrlValue,
    mrlFormatted: codex.mrlFormatted,
    source: codex.source,
    cacYear: codex.cacYear,
  } : null;

  // Determine applicable MRL (strictest wins)
  const euValue = euMrl?.mrlValue ?? null;
  const codexValue = codexMrl?.mrlValue ?? null;

  let strictestMrl: number | null = null;
  let strictestSource: MrlSource = "NONE";
  let applicableMrl: number | null = null;
  let applicableSource: MrlSource = "NONE";

  if (euValue !== null && codexValue !== null) {
    // Both available — strictest (lowest) wins
    if (euValue <= codexValue) {
      strictestMrl = euValue;
      strictestSource = "EU";
    } else {
      strictestMrl = codexValue;
      strictestSource = "CODEX";
    }
    applicableMrl = strictestMrl;
    applicableSource = "BOTH";
  } else if (euValue !== null) {
    strictestMrl = euValue;
    strictestSource = "EU";
    applicableMrl = euValue;
    applicableSource = "EU";
  } else if (codexValue !== null) {
    strictestMrl = codexValue;
    strictestSource = "CODEX";
    applicableMrl = codexValue;
    applicableSource = "CODEX";
  }

  const rationale = buildRationale(pesticide, commodityName, euValue, codexValue, strictestMrl, strictestSource);

  return {
    pesticide,
    commodity: commodityName,
    euMrl,
    codexMrl,
    applicableMrl,
    applicableSource,
    strictestMrl,
    strictestSource,
    mrlUnit: "mg/kg",
    rationale,
  };
}

/**
 * The Brain AI multi-source compliance check.
 * Checks detected residue level against both EU + Codex MRLs.
 * The strictest standard applies (WTO SPS Agreement Article 3).
 */
export async function checkMultiSourceCompliance(
  pesticide: string,
  commodityName: string,
  detectedLevelMgKg: number,
  euProductCode?: string,
): Promise<MultiSourceComplianceResult> {
  const lookup = await lookupMultiSourceMrl(pesticide, commodityName, euProductCode);

  const euMrlValue = lookup.euMrl?.mrlValue ?? null;
  const codexMrlValue = lookup.codexMrl?.mrlValue ?? null;
  const strictestMrlValue = lookup.strictestMrl;

  // EU verdict
  let euVerdict: MultiSourceComplianceResult["euVerdict"] = "UNKNOWN";
  if (euMrlValue !== null) {
    if (detectedLevelMgKg <= euMrlValue) euVerdict = "COMPLIANT";
    else if (detectedLevelMgKg <= euMrlValue * 1.1) euVerdict = "AT_LIMIT";
    else euVerdict = "NON_COMPLIANT";
  }

  // Codex verdict
  let codexVerdict: MultiSourceComplianceResult["codexVerdict"] = "UNKNOWN";
  if (codexMrlValue !== null) {
    if (detectedLevelMgKg <= codexMrlValue) codexVerdict = "COMPLIANT";
    else if (detectedLevelMgKg <= codexMrlValue * 1.1) codexVerdict = "AT_LIMIT";
    else codexVerdict = "NON_COMPLIANT";
  }

  // Overall verdict (worst case)
  const verdicts = [euVerdict, codexVerdict].filter(v => v !== "UNKNOWN");
  let overallVerdict: MultiSourceComplianceResult["overallVerdict"] = "UNKNOWN";
  if (verdicts.length > 0) {
    if (verdicts.includes("NON_COMPLIANT")) overallVerdict = "NON_COMPLIANT";
    else if (verdicts.includes("AT_LIMIT")) overallVerdict = "AT_LIMIT";
    else overallVerdict = "COMPLIANT";
  }

  // Applicable verdict (strictest standard)
  let applicableVerdict: MultiSourceComplianceResult["applicableVerdict"] = "UNKNOWN";
  if (strictestMrlValue !== null) {
    if (detectedLevelMgKg <= strictestMrlValue) applicableVerdict = "COMPLIANT";
    else if (detectedLevelMgKg <= strictestMrlValue * 1.1) applicableVerdict = "AT_LIMIT";
    else applicableVerdict = "NON_COMPLIANT";
  }

  const details = buildComplianceDetails(pesticide, commodityName, detectedLevelMgKg, euMrlValue, codexMrlValue, strictestMrlValue, lookup.strictestSource, euVerdict, codexVerdict, overallVerdict);
  const recommendation = buildRecommendation(overallVerdict, applicableVerdict, lookup.strictestSource);

  return {
    pesticide,
    commodity: commodityName,
    detectedLevelMgKg,
    euVerdict,
    codexVerdict,
    overallVerdict,
    applicableVerdict,
    euMrlValue,
    codexMrlValue,
    strictestMrlValue,
    strictestSource: lookup.strictestSource,
    details,
    recommendation,
  };
}

function buildRationale(pesticide: string, commodity: string, euValue: number | null, codexValue: number | null, strictest: number | null, source: MrlSource): string {
  const parts: string[] = [];
  if (euValue !== null) parts.push(`EU MRL: ${euValue} mg/kg`);
  if (codexValue !== null) parts.push(`Codex MRL: ${codexValue} mg/kg`);
  if (parts.length === 0) return `No MRL found for ${pesticide} on ${commodity} in either EU or Codex databases. EU default 0.01* mg/kg applies.`;
  const sourceLabel = source === "EU" ? "EU (stricter)" : source === "CODEX" ? "Codex (stricter)" : source;
  return `${pesticide} on ${commodity}: ${parts.join(", ")}. Strictest: ${strictest} mg/kg (${sourceLabel}). Per WTO SPS Agreement Article 3, the stricter standard applies.`;
}

function buildComplianceDetails(pesticide: string, commodity: string, detected: number, euMrl: number | null, codexMrl: number | null, strictest: number | null, source: MrlSource, euV: string, codexV: string, overall: string): string {
  const parts: string[] = [`${pesticide} on ${commodity}: detected ${detected} mg/kg`];
  if (euMrl !== null) parts.push(`EU MRL ${euMrl} mg/kg → ${euV}`);
  if (codexMrl !== null) parts.push(`Codex MRL ${codexMrl} mg/kg → ${codexV}`);
  if (strictest !== null) parts.push(`Strictest ${strictest} mg/kg (${source}) → ${overall}`);
  return parts.join(" | ");
}

function buildRecommendation(overall: string, applicable: string, source: MrlSource): string {
  if (applicable === "NON_COMPLIANT") return `CARGO REJECTED — exceeds strictest MRL (${source}). Do not ship.`;
  if (applicable === "AT_LIMIT") return `WARNING — at or near MRL limit (${source}). Additional testing recommended before shipment.`;
  if (overall === "NON_COMPLIANT") return `CARGO NON-COMPLIANT for one standard but compliant for the applicable standard. Verify destination requirements.`;
  if (applicable === "COMPLIANT") return `CARGO COMPLIANT — within all applicable MRL limits. Safe to ship.`;
  return `No MRL data available. Apply EU default 0.01* mg/kg and require lab certification.`;
}

/**
 * Batch multi-source compliance check for multiple residues.
 */
export async function batchMultiSourceCheck(
  commodityName: string,
  detectedResidues: { pesticide: string; detectedLevelMgKg: number }[],
  euProductCode?: string,
): Promise<{
  overallVerdict: "COMPLIANT" | "NON_COMPLIANT" | "AT_LIMIT" | "UNKNOWN";
  results: MultiSourceComplianceResult[];
  compliantCount: number;
  nonCompliantCount: number;
  atLimitCount: number;
  summary: string;
  sourcesUsed: string[];
}> {
  const results: MultiSourceComplianceResult[] = [];
  let compliant = 0, nonCompliant = 0, atLimit = 0;
  const sources = new Set<string>();

  for (const { pesticide, detectedLevelMgKg } of detectedResidues) {
    const result = await checkMultiSourceCompliance(pesticide, commodityName, detectedLevelMgKg, euProductCode);
    results.push(result);
    if (result.euMrlValue !== null) sources.add("EU");
    if (result.codexMrlValue !== null) sources.add("Codex");
    if (result.applicableVerdict === "NON_COMPLIANT") nonCompliant++;
    else if (result.applicableVerdict === "AT_LIMIT") atLimit++;
    else if (result.applicableVerdict === "COMPLIANT") compliant++;
  }

  const overallVerdict = nonCompliant > 0 ? "NON_COMPLIANT" : atLimit > 0 ? "AT_LIMIT" : compliant > 0 ? "COMPLIANT" : "UNKNOWN";
  const summary = nonCompliant > 0
    ? `${nonCompliant} residue(s) EXCEED strictest MRL (EU + Codex) — cargo NON-COMPLIANT`
    : atLimit > 0
      ? `${atLimit} residue(s) at MRL limit — review recommended`
      : `${compliant} residue(s) within all MRL limits — cargo COMPLIANT`;

  return {
    overallVerdict,
    results,
    compliantCount: compliant,
    nonCompliantCount: nonCompliant,
    atLimitCount: atLimit,
    summary,
    sourcesUsed: Array.from(sources),
  };
}

/**
 * Get database stats for both sources.
 */
export async function getPesticideDatabaseStats() {
  const [euProducts, euResidues, euMrls, euSync, codexCommodities, codexPesticides, codexMrls, codexSync] = await Promise.all([
    db.euPesticideProduct.count(),
    db.euPesticideResidue.count(),
    db.euPesticideMrl.count(),
    db.euPesticideSyncLog.findFirst({ orderBy: { syncedAt: "desc" } }),
    db.codexCommodity.count(),
    db.codexPesticide.count(),
    db.codexMrl.count(),
    db.codexSyncLog.findFirst({ orderBy: { syncedAt: "desc" } }),
  ]);

  return {
    eu: {
      products: euProducts,
      residues: euResidues,
      mrls: euMrls,
      lastSync: euSync?.syncedAt || null,
      targetProducts: 381,
      targetResidues: 679,
    },
    codex: {
      commodities: codexCommodities,
      pesticides: codexPesticides,
      mrls: codexMrls,
      lastSync: codexSync?.syncedAt || null,
      targetCommodities: 1651,
      targetPesticides: 240,
    },
    combined: {
      totalMrls: euMrls + codexMrls,
      sources: ["EU Pesticides Database (ec.europa.eu)", "Codex Alimentarius (FAO/WHO)"],
    },
  };
}

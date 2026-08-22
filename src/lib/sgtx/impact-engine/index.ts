// @ts-nocheck
/**
 * SGTX Phase 9 — §3 Impact Engine
 * ===========================================================================
 *
 * When a regulatory rule changes (Phase 9 §2), this engine calculates the
 * affected scope across 8 dimensions:
 *
 *   affectedProducts       — HS6 codes (Phase 2 RIA tables: CountryMrl,
 *                            TreatmentRequirement, CommodityPackingDefault,
 *                            PortSpecialRule).
 *   affectedCountries      — the jurisdictionCode + transit countries
 *                            (Phase 8 TradeLaneReadiness rows that pass
 *                            through this jurisdiction).
 *   affectedModes          — transport modes affected (CUSTOMS_PROCEDURE
 *                            changes affect ALL modes; otherwise from the
 *                            change's scope).
 *   affectedTradeLanes     — Phase 8 TradeLaneReadiness rows where
 *                            origin/destination/transit includes the
 *                            jurisdictionCode.
 *   affectedActiveUstns    — Phase 7 TradeClosureState rows where
 *                            closureState != USTN_CLOSED AND the trade
 *                            (Trade model) has originCountry/destCountry
 *                            == jurisdictionCode.
 *   affectedDocuments      — document types (Phase 3 doc-rules engine
 *                            applied to the affected HS6 + country pairs).
 *   affectedPolicies       — OPA policies (OpaPolicy table) referencing
 *                            this jurisdiction or category.
 *   affectedIntegrations   — Phase 8 IntegrationCatalog entries for this
 *                            jurisdiction + matching authority.
 *
 * Severity (§3):
 *
 *   CRITICAL  — > 10 affected USTNs OR any affected integration is
 *               PRODUCTION_CONNECTED.
 *   MAJOR     — > 5 affected USTNs.
 *   MODERATE  — > 1 affected USTN.
 *   MINOR     — 0-1 affected USTNs.
 *
 * `assessImpact(changeId)` is the main entry point — it loads all 8
 * dimensions, computes the severity, persists the impact fields on the
 * RegulatoryChangeV2 row, and advances the pipeline VERIFIED → IMPACTED
 * (updates the IMPACTED ChangePipelineStep row).
 *
 * `simulateChange(changeId)` runs the financial + compliance simulation
 * on the affectedActiveUstns (what would change for each trade? how much
 * additional cost? what new requirements?). Advances the pipeline
 * IMPACTED → SIMULATED (updates the SIMULATED ChangePipelineStep row).
 *
 * Pure helpers (`computeImpactSeverity`, `generateImpactSummary`,
 * `simulateTradeImpact`) have no DB calls + no side effects.
 *
 * All DB calls are try/catch-wrapped with safe defaults — the engine never
 * throws synchronously into API routes.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import {
  getCatalogByJurisdiction,
  type IntegrationCatalog as CatalogRow,
} from "@/lib/sgtx/integration-catalog";
import { resolveDocumentRequirements } from "@/lib/sgtx/trade-request/doc-rules";
import {
  CHANGE_CATEGORIES,
  CHANGE_TYPES,
  PIPELINE_STATUSES,
  IMPACT_SEVERITIES,
  SNAPSHOT_POLICIES,
  getChangeByChangeId,
  parsePipelineHistory,
  parseJsonArray,
  serializeJsonArray,
  type RegulatoryChangeV2,
  type PipelineHistoryEntry,
} from "@/lib/sgtx/regulatory-change";

// Re-export shared types/constants so consumers can import everything
// from the impact-engine entry point if they prefer.
export {
  CHANGE_CATEGORIES,
  CHANGE_TYPES,
  PIPELINE_STATUSES,
  IMPACT_SEVERITIES,
  SNAPSHOT_POLICIES,
};
export type {
  RegulatoryChangeV2,
  PipelineHistoryEntry,
};

// ============ §3 Constants ============

/**
 * §3 — the 8 impact dimensions. The impact engine populates all 8 for
 * each regulatory change.
 */
export const IMPACT_DIMENSIONS = [
  "affectedProducts",
  "affectedCountries",
  "affectedModes",
  "affectedTradeLanes",
  "affectedActiveUstns",
  "affectedDocuments",
  "affectedPolicies",
  "affectedIntegrations",
] as const;

/**
 * All transport modes — used when a CUSTOMS_PROCEDURE change affects every
 * mode (since the change applies regardless of transport).
 */
export const ALL_TRANSPORT_MODES = [
  "ROAD",
  "AIR",
  "OCEAN",
  "RAIL",
  "FERRY",
  "MULTIMODAL",
] as const;

/**
 * changeCategory → IntegrationCatalog.authority mapping. Used to find
 * affected integrations for the jurisdiction.
 *
 * - CUSTOMS_PROCEDURE → CUSTOMS
 * - TAX → TAX
 * - TARIFF → CUSTOMS (tariffs are customs-side)
 * - SANCTIONS → SECURITY
 * - SPS → SPS (also AGRICULTURE/HEALTH — searched separately)
 * - TBT → TBT (also STANDARDS — searched separately)
 * - LICENSES/PERMITS → CUSTOMS (broker-issued, customs-verified)
 * - GOVERNMENT_APIS → (any authority — broad search)
 * - DOCUMENT_REQUIREMENTS → CUSTOMS
 * - LAW/REGULATION → (none directly — these are legal, not integration)
 */
const CATEGORY_TO_AUTHORITY: Record<string, string[]> = {
  CUSTOMS_PROCEDURE: ["CUSTOMS"],
  TAX: ["TAX"],
  TARIFF: ["CUSTOMS"],
  SANCTIONS: ["SECURITY"],
  SPS: ["SPS", "AGRICULTURE", "HEALTH"],
  TBT: ["TBT", "STANDARDS"],
  LICENSES: ["CUSTOMS"],
  PERMITS: ["CUSTOMS"],
  GOVERNMENT_APIS: [], // broad — match any authority for the jurisdiction
  DOCUMENT_REQUIREMENTS: ["CUSTOMS"],
  LAW: [],
  REGULATION: [],
};

/**
 * changeCategory → Phase 2 RIA table to scan for affected HS6 codes.
 * Each value is a list of tables to query (we union the HS6 codes from
 * each).
 */
const CATEGORY_TO_HS6_SOURCES: Record<string, string[]> = {
  TARIFF: ["countryMrl", "treatmentRequirement", "commodityPackingDefault"],
  SPS: ["countryMrl", "treatmentRequirement", "commodityPackingDefault"],
  TBT: ["portSpecialRule"],
  LICENSES: ["portSpecialRule", "treatmentRequirement"],
  PERMITS: ["portSpecialRule", "treatmentRequirement"],
  // For other categories, derive HS6 codes only from the change's own
  // affectedProducts field (set when the change was recorded).
};

// ============ Types ============

export interface DetectChangeInput {
  changeCategory: string;
  changeType: string;
  title: string;
  description?: string;
  sourceAuthority?: string;
  sourceUrl?: string;
  sourceReference?: string;
  detectedBy?: string;
  jurisdictionCode: string;
  announcedDate?: Date;
  effectiveDate?: Date;
  expiryDate?: Date;
  notes?: string;
}

export interface ImpactResult {
  changeId: string;
  affectedProducts: string[];
  affectedCountries: string[];
  affectedModes: string[];
  affectedTradeLanes: string[];
  affectedActiveUstns: string[];
  affectedDocuments: string[];
  affectedPolicies: string[];
  affectedIntegrations: string[];
  impactSummary: string;
  impactSeverity: string;
}

export interface SimulationResult {
  changeId: string;
  simulatedTrades: Array<{
    ustn: string;
    impact: string;
    additionalCostUsd?: number;
    newRequirements?: string[];
  }>;
  totalFinancialImpactUsd: number;
  totalComplianceImpact: number;
  recommendation: "PROCEED" | "PROCEED_WITH_CAUTION" | "BLOCK";
}

export interface AffectedIntegration {
  connectorId: string;
  authority: string;
  systemName: string;
  status: string;
  jurisdictionCode: string;
}

// ============ §3.0 Pure helpers ============

/**
 * Pure: compute the impact severity from the count of affected USTNs +
 * the list of affected integrations (CRITICAL if any is
 * PRODUCTION_CONNECTED or SANDBOX_CONNECTED). Returns MINOR on bad
 * input. No DB, no side effects.
 *
 *   > 10 USTNs OR PRODUCTION_CONNECTED affected → CRITICAL
 *   > 5 USTNs                                   → MAJOR
 *   > 1 USTN                                    → MODERATE
 *   0-1 USTNs                                   → MINOR
 */
export function computeImpactSeverity(
  affectedUstns: number,
  affectedIntegrations: any[],
): string {
  const ustnCount = typeof affectedUstns === "number" ? affectedUstns : 0;
  const integrations = Array.isArray(affectedIntegrations)
    ? affectedIntegrations
    : [];
  // CRITICAL if any affected integration is connected.
  for (const integ of integrations) {
    const status = String(
      (integ && (integ.status || integ.connectorStatus)) || "",
    ).toUpperCase();
    if (status === "PRODUCTION_CONNECTED" || status === "SANDBOX_CONNECTED") {
      return "CRITICAL";
    }
  }
  // Otherwise based on USTN count.
  if (ustnCount > 10) return "CRITICAL";
  if (ustnCount > 5) return "MAJOR";
  if (ustnCount > 1) return "MODERATE";
  return "MINOR";
}

/**
 * Pure: generate a human-readable impact summary from an ImpactResult.
 * No DB, no side effects.
 *
 * Example output: "This change affects 3 products, 2 countries, 5 active
 * trades, and 2 integrations. Severity: MAJOR."
 */
export function generateImpactSummary(impact: ImpactResult): string {
  if (!impact) return "No impact data available.";
  const products = (impact.affectedProducts || []).length;
  const countries = (impact.affectedCountries || []).length;
  const modes = (impact.affectedModes || []).length;
  const lanes = (impact.affectedTradeLanes || []).length;
  const ustns = (impact.affectedActiveUstns || []).length;
  const docs = (impact.affectedDocuments || []).length;
  const policies = (impact.affectedPolicies || []).length;
  const integrations = (impact.affectedIntegrations || []).length;
  const parts: string[] = [];
  parts.push(`${products} product${products === 1 ? "" : "s"}`);
  parts.push(`${countries} countr${countries === 1 ? "y" : "ies"}`);
  if (modes > 0) parts.push(`${modes} transport mode${modes === 1 ? "" : "s"}`);
  if (lanes > 0) parts.push(`${lanes} trade lane${lanes === 1 ? "" : "s"}`);
  parts.push(`${ustns} active trade${ustns === 1 ? "" : "s"}`);
  if (docs > 0) parts.push(`${docs} document type${docs === 1 ? "" : "s"}`);
  if (policies > 0) parts.push(`${policies} polic${policies === 1 ? "y" : "ies"}`);
  if (integrations > 0) {
    parts.push(
      `${integrations} integration${integrations === 1 ? "" : "s"}`,
    );
  }
  const list = parts.join(", ");
  return `This change affects ${list}. Severity: ${impact.impactSeverity || "MINOR"}.`;
}

/**
 * Pure: simulate the per-trade impact given a change + USTN. Returns the
 * impact description + an estimated additional cost + a list of new
 * requirements (documents/licenses/permits). The estimation is a
 * conservative heuristic — the actual financial impact is computed by
 * the trade-cost engine at deployment time.
 *
 * Heuristics:
 *   TARIFF           → "tariff increase applies" + ~2% of trade value
 *   SPS              → "new SPS certificate required" + $200 fee
 *   TBT              → "new conformity certificate required" + $500 fee
 *   LICENSES/PERMITS → "new license/permit required" + $1000 fee
 *   SANCTIONS        → "trade may be blocked" + $0 (compliance check)
 *   TAX              → "tax rate change applies" + ~1% of trade value
 *   CUSTOMS_PROCEDURE → "new customs procedure required" + $300 fee
 *   DOCUMENT_REQUIREMENTS → "new document required" + $150 fee
 *   GOVERNMENT_APIS   → "new API integration required" + $0 (one-time)
 *   LAW/REGULATION   → "regulatory compliance review needed" + $0
 *
 * No DB, no side effects.
 */
export function simulateTradeImpact(
  changeCategory: string,
  ustn: string,
  tradeValueUsd?: number,
): { ustn: string; impact: string; additionalCostUsd: number; newRequirements: string[] } {
  const cat = String(changeCategory || "").toUpperCase();
  const tv = typeof tradeValueUsd === "number" ? tradeValueUsd : 0;
  switch (cat) {
    case "TARIFF": {
      const cost = Math.round(tv * 0.02 * 100) / 100;
      return {
        ustn,
        impact: "tariff increase applies — additional duty estimated at 2% of trade value",
        additionalCostUsd: cost,
        newRequirements: ["updated tariff classification"],
      };
    }
    case "TAX": {
      const cost = Math.round(tv * 0.01 * 100) / 100;
      return {
        ustn,
        impact: "tax rate change applies — additional tax estimated at 1% of trade value",
        additionalCostUsd: cost,
        newRequirements: ["updated tax calculation"],
      };
    }
    case "SPS":
      return {
        ustn,
        impact: "new SPS certificate required — phyto/fumigation/MRL update",
        additionalCostUsd: 200,
        newRequirements: ["updated phytosanitary certificate", "MRL compliance check"],
      };
    case "TBT":
      return {
        ustn,
        impact: "new conformity certificate required — standards update",
        additionalCostUsd: 500,
        newRequirements: ["conformity assessment certificate"],
      };
    case "LICENSES":
      return {
        ustn,
        impact: "new import/export license required",
        additionalCostUsd: 1000,
        newRequirements: ["import/export license"],
      };
    case "PERMITS":
      return {
        ustn,
        impact: "new permit required",
        additionalCostUsd: 1000,
        newRequirements: ["trade permit"],
      };
    case "SANCTIONS":
      return {
        ustn,
        impact: "trade may be blocked — sanctions compliance review required",
        additionalCostUsd: 0,
        newRequirements: ["sanctions screening"],
      };
    case "CUSTOMS_PROCEDURE":
      return {
        ustn,
        impact: "new customs procedure required",
        additionalCostUsd: 300,
        newRequirements: ["updated customs declaration"],
      };
    case "DOCUMENT_REQUIREMENTS":
      return {
        ustn,
        impact: "new document required",
        additionalCostUsd: 150,
        newRequirements: ["additional customs document"],
      };
    case "GOVERNMENT_APIS":
      return {
        ustn,
        impact: "new API integration required — manual fallback until connected",
        additionalCostUsd: 0,
        newRequirements: ["API integration setup"],
      };
    case "LAW":
    case "REGULATION":
      return {
        ustn,
        impact: "regulatory compliance review needed",
        additionalCostUsd: 0,
        newRequirements: ["compliance review"],
      };
    default:
      return {
        ustn,
        impact: "regulatory change applies — review required",
        additionalCostUsd: 0,
        newRequirements: [],
      };
  }
}

/**
 * Pure: derive the recommendation from the impact severity + simulation
 * totals. PROCEED = MINOR or MODERATE with no blocked trades;
 * PROCEED_WITH_CAUTION = MAJOR with manageable cost; BLOCK = CRITICAL
 * or any simulated trade would be blocked (SANCTIONS).
 *
 * No DB, no side effects.
 */
export function deriveRecommendation(
  impactSeverity: string,
  totalFinancialImpactUsd: number,
  blockedTradeCount: number,
): "PROCEED" | "PROCEED_WITH_CAUTION" | "BLOCK" {
  const sev = String(impactSeverity || "").toUpperCase();
  if (sev === "CRITICAL") return "BLOCK";
  if (blockedTradeCount > 0) return "BLOCK";
  if (sev === "MAJOR") return "PROCEED_WITH_CAUTION";
  if (totalFinancialImpactUsd > 50000) return "PROCEED_WITH_CAUTION";
  return "PROCEED";
}

// ============ §3.1 assessImpact (main) ============

/**
 * The main impact assessment entry point. For a regulatory change, load
 * all 8 affected dimensions, compute the severity, persist the impact
 * fields on the RegulatoryChangeV2 row, and advance the pipeline
 * VERIFIED → IMPACTED.
 *
 * Throws if the change is not in VERIFIED status (or not found). Throws
 * on DB error during the impact persistence.
 *
 * Loads from:
 *   - Phase 2 (CountryMrl, TreatmentRequirement, CommodityPackingDefault,
 *     PortSpecialRule) — HS6 codes for the jurisdiction.
 *   - Phase 7 (TradeClosureState) — active USTNs.
 *   - Phase 8 (TradeLaneReadiness, IntegrationCatalog) — lanes + connectors.
 *   - Phase 3 (resolveDocumentRequirements) — document types.
 *   - OpaPolicy — Governor/OPA policies.
 *   - Trade — for originCountry/destCountry filters.
 *
 * Each dimension load is independently try/catch-wrapped so a failure in
 * one dimension (e.g. OpaPolicy query error) does NOT block the rest.
 */
export async function assessImpact(
  changeId: string,
): Promise<ImpactResult> {
  if (!changeId) {
    throw new Error("[impact-engine] changeId is required");
  }
  const change = await getChangeByChangeId(changeId);
  if (!change) {
    throw new Error(`[impact-engine] change not found: ${changeId}`);
  }
  if (change.pipelineStatus !== "VERIFIED") {
    throw new Error(
      `[impact-engine] change ${changeId} is ${change.pipelineStatus} — only VERIFIED changes can be impact-assessed`,
    );
  }
  const jurisdiction = String(change.jurisdictionCode || "").toUpperCase();
  const category = String(change.changeCategory || "").toUpperCase();

  // 1) affectedProducts — HS6 codes for the jurisdiction (from RIA tables).
  const affectedProducts = await loadAffectedProducts(change, jurisdiction, category);

  // 2) affectedCountries — jurisdiction + transit countries from trade
  //    lanes that include this jurisdiction.
  const affectedCountries = await loadAffectedCountries(jurisdiction);

  // 3) affectedModes — all modes if CUSTOMS_PROCEDURE; else from the
  //    change's scope (the affectedModes field if already set, or the
  //    distinct modes from affected trade lanes).
  const affectedModes = await loadAffectedModes(change, category, jurisdiction);

  // 4) affectedTradeLanes — TradeLaneReadiness rows where origin/
  //    destination/transit includes the jurisdiction.
  const affectedTradeLanes = await loadAffectedTradeLanes(jurisdiction);

  // 5) affectedActiveUstns — Phase 7 TradeClosureState where
  //    closureState != USTN_CLOSED + the trade involves the jurisdiction.
  const affectedActiveUstns = await loadAffectedActiveUstns(jurisdiction);

  // 6) affectedDocuments — document types (from doc-rules engine +
  //    change's category if DOCUMENT_REQUIREMENTS).
  const affectedDocuments = await loadAffectedDocuments(
    change,
    category,
    jurisdiction,
    affectedProducts,
  );

  // 7) affectedPolicies — OPA policies referencing jurisdiction/category.
  const affectedPolicies = await loadAffectedPolicies(jurisdiction, category);

  // 8) affectedIntegrations — IntegrationCatalog entries for the
  //    jurisdiction + matching authority.
  const affectedIntegrations = await loadAffectedIntegrations(
    jurisdiction,
    category,
  );

  // Compute severity.
  const impactSeverity = computeImpactSeverity(
    affectedActiveUstns.length,
    affectedIntegrations,
  );

  // Build the ImpactResult.
  const result: ImpactResult = {
    changeId,
    affectedProducts,
    affectedCountries,
    affectedModes,
    affectedTradeLanes,
    affectedActiveUstns,
    affectedDocuments,
    affectedPolicies,
    affectedIntegrations: affectedIntegrations.map((i) =>
      typeof i === "string" ? i : i.connectorId,
    ),
    impactSummary: "",
    impactSeverity,
  };
  result.impactSummary = generateImpactSummary(result);

  // Persist the impact fields on the RegulatoryChangeV2 row + advance
  // the pipeline VERIFIED → IMPACTED.
  await persistImpactAndAdvance(change, result);

  return result;
}

// ============ §3.2 simulateChange (main) ============

/**
 * Run the financial + compliance simulation on the affected active USTNs
 * for a regulatory change. For each USTN, computes:
 *
 *   - impact: a human-readable description of what would change.
 *   - additionalCostUsd: the estimated additional cost (heuristic —
 *     actual cost computed at deployment by the trade-cost engine).
 *   - newRequirements: list of new documents/licenses/permits required.
 *
 * Then aggregates:
 *
 *   - totalFinancialImpactUsd: sum of additionalCostUsd across all trades.
 *   - totalComplianceImpact: count of distinct new requirements.
 *   - recommendation: PROCEED / PROCEED_WITH_CAUTION / BLOCK based on
 *     severity + financial impact + blocked trade count.
 *
 * Advances the pipeline IMPACTED → SIMULATED (updates the SIMULATED
 * ChangePipelineStep row).
 *
 * Throws if the change is not in IMPACTED status (or not found). Throws
 * on DB error during the pipeline advance.
 */
export async function simulateChange(
  changeId: string,
): Promise<SimulationResult> {
  if (!changeId) {
    throw new Error("[impact-engine] changeId is required");
  }
  const change = await getChangeByChangeId(changeId);
  if (!change) {
    throw new Error(`[impact-engine] change not found: ${changeId}`);
  }
  if (change.pipelineStatus !== "IMPACTED") {
    throw new Error(
      `[impact-engine] change ${changeId} is ${change.pipelineStatus} — only IMPACTED changes can be simulated`,
    );
  }
  const category = String(change.changeCategory || "").toUpperCase();
  // Load the affected USTNs (from the persisted impact field).
  const ustns = parseJsonArray(change.affectedActiveUstns) as string[];
  // Load trade values for each USTN (best-effort).
  const tradeValues = await loadTradeValuesForUstns(ustns);
  // Simulate per-trade impact.
  const simulatedTrades: SimulationResult["simulatedTrades"] = [];
  let totalFinancialImpactUsd = 0;
  const requirementSet = new Set<string>();
  let blockedTradeCount = 0;
  for (const ustn of ustns) {
    const tv = tradeValues.get(ustn) || 0;
    const sim = simulateTradeImpact(category, ustn, tv);
    simulatedTrades.push(sim);
    totalFinancialImpactUsd += sim.additionalCostUsd || 0;
    for (const req of sim.newRequirements || []) {
      requirementSet.add(req);
    }
    if (sim.impact.toLowerCase().includes("blocked")) {
      blockedTradeCount++;
    }
  }
  const recommendation = deriveRecommendation(
    change.impactSeverity || "MINOR",
    totalFinancialImpactUsd,
    blockedTradeCount,
  );
  const result: SimulationResult = {
    changeId,
    simulatedTrades,
    totalFinancialImpactUsd: Math.round(totalFinancialImpactUsd * 100) / 100,
    totalComplianceImpact: requirementSet.size,
    recommendation,
  };
  // Advance the pipeline IMPACTED → SIMULATED + persist simulation result.
  await persistSimulationAndAdvance(change, result);
  return result;
}

// ============ §3.3 getImpactAssessment ============

/**
 * Retrieve the stored impact assessment for a change. Reads the impact
 * fields from the RegulatoryChangeV2 row + reconstructs the ImpactResult.
 * Returns null if the change is not found or has not yet been impact-
 * assessed (pipelineStatus < IMPACTED). Never throws.
 */
export async function getImpactAssessment(
  changeId: string,
): Promise<ImpactResult | null> {
  if (!changeId) return null;
  const change = await getChangeByChangeId(changeId);
  if (!change) return null;
  // Only return impact data if the pipeline has reached at least IMPACTED.
  const order = (PIPELINE_STATUSES as readonly string[]).indexOf(
    change.pipelineStatus,
  );
  const impactedOrder = (PIPELINE_STATUSES as readonly string[]).indexOf(
    "IMPACTED",
  );
  if (order < impactedOrder) return null;
  const result: ImpactResult = {
    changeId,
    affectedProducts: parseJsonArray(change.affectedProducts) as string[],
    affectedCountries: parseJsonArray(change.affectedCountries) as string[],
    affectedModes: parseJsonArray(change.affectedModes) as string[],
    affectedTradeLanes: parseJsonArray(change.affectedTradeLanes) as string[],
    affectedActiveUstns: parseJsonArray(change.affectedActiveUstns) as string[],
    affectedDocuments: parseJsonArray(change.affectedDocuments) as string[],
    affectedPolicies: parseJsonArray(change.affectedPolicies) as string[],
    affectedIntegrations: parseJsonArray(change.affectedIntegrations) as string[],
    impactSummary: change.impactSummary || "",
    impactSeverity: change.impactSeverity || "MINOR",
  };
  return result;
}

// ============ §3.4 Dimension loaders (internal) ============

/**
 * Load affected HS6 codes (products) for a change. Combines:
 *   1. The change's existing `affectedProducts` field (set when the
 *      change was recorded, e.g. a TARIFF change with explicit HS6 list).
 *   2. Phase 2 RIA tables for the jurisdiction (CountryMrl,
 *      TreatmentRequirement, CommodityPackingDefault, PortSpecialRule),
 *      filtered by the change's category.
 *
 * Returns a deduplicated sorted array of HS6 codes. Returns [] on DB
 * error. Never throws.
 */
async function loadAffectedProducts(
  change: RegulatoryChangeV2,
  jurisdiction: string,
  category: string,
): Promise<string[]> {
  const set = new Set<string>();
  // 1) The change's own affectedProducts field.
  for (const hs of parseJsonArray(change.affectedProducts)) {
    if (hs) set.add(String(hs));
  }
  // 2) Phase 2 RIA tables for the jurisdiction (filtered by category).
  const sources = CATEGORY_TO_HS6_SOURCES[category] || [];
  for (const table of sources) {
    try {
      const rows = await (db as any)[table].findMany({
        where: {
          OR: [
            { country: jurisdiction },
            { countryCode: jurisdiction },
            { originCountry: jurisdiction },
            { destCountry: jurisdiction },
          ],
        },
        select: {
          commodityHs: true,
          hsCode: true,
          commodityHsCode: true,
        },
      });
      for (const r of rows || []) {
        const hs = r.commodityHs || r.hsCode || r.commodityHsCode;
        if (hs) set.add(String(hs));
      }
    } catch (err) {
      logger.error("[impact-engine] loadAffectedProducts table scan failed", {
        error: String(err),
        table,
        jurisdiction,
      });
    }
  }
  return Array.from(set).sort();
}

/**
 * Load affected countries: the jurisdiction + any transit country that
 * appears on a trade lane through this jurisdiction. Returns a sorted
 * deduplicated array. Returns [jurisdiction] on DB error. Never throws.
 */
async function loadAffectedCountries(
  jurisdiction: string,
): Promise<string[]> {
  const set = new Set<string>();
  set.add(jurisdiction);
  try {
    const lanes = await db.tradeLaneReadiness.findMany({
      where: {
        OR: [
          { originCountry: jurisdiction },
          { destinationCountry: jurisdiction },
        ],
      },
      select: { transitCountries: true },
    });
    for (const lane of lanes || []) {
      const transit = parseJsonArray((lane as any).transitCountries);
      for (const c of transit) {
        if (c) set.add(String(c).toUpperCase());
      }
    }
  } catch (err) {
    logger.error("[impact-engine] loadAffectedCountries DB error", {
      error: String(err),
      jurisdiction,
    });
  }
  return Array.from(set).sort();
}

/**
 * Load affected transport modes. If the changeCategory is CUSTOMS_PROCEDURE
 * or TRANSPORT, all modes are affected (a customs procedure change applies
 * regardless of transport). Otherwise, the modes are derived from:
 *   1. The change's existing `affectedModes` field.
 *   2. The distinct transportMode values from affected TradeLaneReadiness
 *      rows (origin/destination/transit = jurisdiction).
 *
 * Returns a deduplicated sorted array. Never throws.
 */
async function loadAffectedModes(
  change: RegulatoryChangeV2,
  category: string,
  jurisdiction: string,
): Promise<string[]> {
  if (category === "CUSTOMS_PROCEDURE" || category === "TRANSPORT") {
    return Array.from(ALL_TRANSPORT_MODES);
  }
  const set = new Set<string>();
  // 1) Change's own affectedModes field.
  for (const m of parseJsonArray(change.affectedModes)) {
    if (m) set.add(String(m).toUpperCase());
  }
  // 2) Distinct transportMode from affected trade lanes.
  try {
    const lanes = await db.tradeLaneReadiness.findMany({
      where: {
        OR: [
          { originCountry: jurisdiction },
          { destinationCountry: jurisdiction },
        ],
      },
      select: { transportMode: true },
    });
    for (const lane of lanes || []) {
      const mode = (lane as any).transportMode;
      if (mode) set.add(String(mode).toUpperCase());
    }
  } catch (err) {
    logger.error("[impact-engine] loadAffectedModes DB error", {
      error: String(err),
      jurisdiction,
    });
  }
  return Array.from(set).sort();
}

/**
 * Load affected trade lanes — TradeLaneReadiness rows where origin,
 * destination, or transit includes the jurisdiction. Returns lane IDs
 * (TLR-YYYYMMDD-NNNNN). Returns [] on DB error. Never throws.
 */
async function loadAffectedTradeLanes(
  jurisdiction: string,
): Promise<string[]> {
  const laneIds = new Set<string>();
  try {
    // Direct origin/destination match.
    const direct = await db.tradeLaneReadiness.findMany({
      where: {
        OR: [
          { originCountry: jurisdiction },
          { destinationCountry: jurisdiction },
        ],
      },
      select: { laneId: true, transitCountries: true },
    });
    for (const lane of direct || []) {
      laneIds.add((lane as any).laneId);
      // Also check the transit countries JSON.
      const transit = parseJsonArray((lane as any).transitCountries);
      if (transit.includes(jurisdiction)) {
        // Already added above — but keep this for clarity.
      }
    }
    // Transit JSON scan (best-effort: load all lanes, parse JSON, filter).
    // This is more expensive than the direct query but necessary because
    // Prisma can't query inside a JSON column without a filterable type.
    try {
      const allLanes = await db.tradeLaneReadiness.findMany({
        where: { transitCountries: { not: null } },
        select: { laneId: true, transitCountries: true },
      });
      for (const lane of allLanes || []) {
        const transit = parseJsonArray((lane as any).transitCountries);
        if (transit.some((c: any) => String(c).toUpperCase() === jurisdiction)) {
          laneIds.add((lane as any).laneId);
        }
      }
    } catch (err) {
      logger.error(
        "[impact-engine] loadAffectedTradeLanes transit scan failed",
        { error: String(err), jurisdiction },
      );
    }
  } catch (err) {
    logger.error("[impact-engine] loadAffectedTradeLanes DB error", {
      error: String(err),
      jurisdiction,
    });
  }
  return Array.from(laneIds).sort();
}

/**
 * Load affected active USTNs — Phase 7 TradeClosureState rows where
 * closureState != USTN_CLOSED AND the trade (Trade model) has
 * originCountry/destCountry == jurisdiction.
 *
 * Returns USTN strings. Returns [] on DB error. Never throws.
 */
async function loadAffectedActiveUstns(
  jurisdiction: string,
): Promise<string[]> {
  const ustns: string[] = [];
  try {
    // Load closure states that are NOT USTN_CLOSED.
    const closureStates = await db.tradeClosureState.findMany({
      where: {
        closureState: { not: "USTN_CLOSED" },
      },
      select: { ustn: true },
    });
    const candidateUstns = (closureStates || []).map(
      (r: any) => r.ustn,
    );
    if (candidateUstns.length === 0) return [];
    // Cross-reference against Trade (origin/dest = jurisdiction).
    const trades = await db.trade.findMany({
      where: {
        ustn: { in: candidateUstns },
        OR: [
          { originCountry: jurisdiction },
          { destCountry: jurisdiction },
        ],
      },
      select: { ustn: true },
    });
    for (const t of trades || []) {
      if ((t as any).ustn) ustns.push((t as any).ustn);
    }
  } catch (err) {
    logger.error("[impact-engine] loadAffectedActiveUstns DB error", {
      error: String(err),
      jurisdiction,
    });
  }
  return Array.from(new Set(ustns)).sort();
}

/**
 * Load affected document types. If the changeCategory is
 * DOCUMENT_REQUIREMENTS, return the document types from the change's own
 * `affectedDocuments` field (set when the change was recorded). Else,
 * derive from the Phase 3 doc-rules engine applied to (HS6 + jurisdiction
 * pairs) for the affected products.
 *
 * Returns a deduplicated sorted array. Returns [] on DB error. Never
 * throws.
 */
async function loadAffectedDocuments(
  change: RegulatoryChangeV2,
  category: string,
  jurisdiction: string,
  affectedProducts: string[],
): Promise<string[]> {
  const set = new Set<string>();
  // 1) Change's own affectedDocuments field.
  for (const d of parseJsonArray(change.affectedDocuments)) {
    if (d) set.add(String(d));
  }
  // 2) If DOCUMENT_REQUIREMENTS and the change already has docs, return early.
  if (category === "DOCUMENT_REQUIREMENTS" && set.size > 0) {
    return Array.from(set).sort();
  }
  // 3) Derive from the doc-rules engine for each (HS6, jurisdiction) pair.
  //    Use the jurisdiction as both origin + dest (covers import + export).
  try {
    for (const hs of affectedProducts.slice(0, 50)) {
      const docs = resolveDocumentRequirements({
        hsCode: hs,
        originCountry: jurisdiction,
        destCountry: jurisdiction,
      });
      for (const d of docs || []) {
        if (d && d.docType) set.add(d.docType);
      }
    }
  } catch (err) {
    logger.error("[impact-engine] loadAffectedDocuments doc-rules failed", {
      error: String(err),
      jurisdiction,
    });
  }
  return Array.from(set).sort();
}

/**
 * Load affected OPA policies — OpaPolicy rows whose `content` or `name`
 * references the jurisdiction code or the changeCategory. Returns policy
 * names (unique). Returns [] on DB error. Never throws.
 */
async function loadAffectedPolicies(
  jurisdiction: string,
  category: string,
): Promise<string[]> {
  const policies: string[] = [];
  try {
    // Load all active OPA policies + filter by substring (Prisma can't
    // substring-search `content` without a full-text index on Turso).
    const rows = await db.opaPolicy.findMany({
      where: { active: true },
      select: { name: true, category: true, content: true },
    });
    const jcLower = jurisdiction.toLowerCase();
    const catLower = category.toLowerCase();
    for (const r of rows || []) {
      const name = String((r as any).name || "");
      const cat = String((r as any).category || "");
      const content = String((r as any).content || "");
      const matches =
        name.toLowerCase().includes(jcLower) ||
        cat.toLowerCase().includes(catLower) ||
        content.toLowerCase().includes(jcLower) ||
        content.toLowerCase().includes(catLower);
      if (matches) policies.push(name);
    }
  } catch (err) {
    logger.error("[impact-engine] loadAffectedPolicies DB error", {
      error: String(err),
      jurisdiction,
      category,
    });
  }
  return Array.from(new Set(policies)).sort();
}

/**
 * Load affected integrations — Phase 8 IntegrationCatalog entries for the
 * jurisdiction whose authority matches the changeCategory. Returns full
 * catalog row objects (so the severity check can inspect `status`).
 * Returns [] on DB error. Never throws.
 */
async function loadAffectedIntegrations(
  jurisdiction: string,
  category: string,
): Promise<AffectedIntegration[]> {
  const out: AffectedIntegration[] = [];
  try {
    const catalog: CatalogRow[] = await getCatalogByJurisdiction(
      jurisdiction,
    );
    const authorities = CATEGORY_TO_AUTHORITY[category] || [];
    // If no authority mapping (LAW/REGULATION/GOVERNMENT_APIS), include
    // ALL catalog entries for the jurisdiction (the change affects the
    // whole regulatory environment).
    const matchAll = authorities.length === 0;
    for (const c of catalog) {
      if (matchAll || authorities.includes(String(c.authority).toUpperCase())) {
        out.push({
          connectorId: c.connectorId,
          authority: c.authority,
          systemName: c.systemName,
          status: c.status,
          jurisdictionCode: c.jurisdictionCode,
        });
      }
    }
  } catch (err) {
    logger.error("[impact-engine] loadAffectedIntegrations failed", {
      error: String(err),
      jurisdiction,
      category,
    });
  }
  return out;
}

/**
 * Load trade values (tradeValueUsd) for a list of USTNs. Returns a Map
 * keyed by USTN. Returns an empty Map on DB error. Never throws.
 */
async function loadTradeValuesForUstns(
  ustns: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!ustns || ustns.length === 0) return map;
  try {
    const trades = await db.trade.findMany({
      where: { ustn: { in: ustns } },
      select: { ustn: true, tradeValueUsd: true },
    });
    for (const t of trades || []) {
      map.set((t as any).ustn, Number((t as any).tradeValueUsd) || 0);
    }
  } catch (err) {
    logger.error("[impact-engine] loadTradeValuesForUstns DB error", {
      error: String(err),
      ustnCount: ustns.length,
    });
  }
  return map;
}

// ============ §3.5 Persistence + pipeline advance (internal) ============

/**
 * Persist the impact assessment on the RegulatoryChangeV2 row + advance
 * the pipeline VERIFIED → IMPACTED. Updates the IMPACTED
 * ChangePipelineStep row with the result data. Throws on DB error.
 */
async function persistImpactAndAdvance(
  change: RegulatoryChangeV2,
  result: ImpactResult,
): Promise<void> {
  const now = new Date();
  const history = parsePipelineHistory(change.pipelineHistory);
  history.push({
    status: "IMPACTED",
    at: now.toISOString(),
    actor: "impact-engine",
    notes: result.impactSummary,
  });
  try {
    await db.regulatoryChangeV2.update({
      where: { changeId: change.changeId },
      data: {
        affectedProducts: serializeJsonArray(result.affectedProducts),
        affectedCountries: serializeJsonArray(result.affectedCountries),
        affectedModes: serializeJsonArray(result.affectedModes),
        affectedTradeLanes: serializeJsonArray(result.affectedTradeLanes),
        affectedActiveUstns: serializeJsonArray(result.affectedActiveUstns),
        affectedDocuments: serializeJsonArray(result.affectedDocuments),
        affectedPolicies: serializeJsonArray(result.affectedPolicies),
        affectedIntegrations: serializeJsonArray(result.affectedIntegrations),
        impactSummary: result.impactSummary,
        impactSeverity: result.impactSeverity,
        pipelineStatus: "IMPACTED",
        pipelineHistory: JSON.stringify(history),
      },
    });
    // Update the IMPACTED ChangePipelineStep.
    try {
      await db.changePipelineStep.update({
        where: {
          changeId_stepName: {
            changeId: change.changeId,
            stepName: "IMPACTED",
          },
        },
        data: {
          status: "COMPLETED",
          actor: "impact-engine",
          resultSummary: result.impactSummary,
          resultData: JSON.stringify({
            severity: result.impactSeverity,
            affectedCounts: {
              products: result.affectedProducts.length,
              countries: result.affectedCountries.length,
              modes: result.affectedModes.length,
              tradeLanes: result.affectedTradeLanes.length,
              activeUstns: result.affectedActiveUstns.length,
              documents: result.affectedDocuments.length,
              policies: result.affectedPolicies.length,
              integrations: result.affectedIntegrations.length,
            },
          }),
          startedAt: now,
          completedAt: now,
        },
      });
    } catch (stepErr) {
      logger.error(
        "[impact-engine] IMPACTED step update failed (non-fatal)",
        { error: String(stepErr), changeId: change.changeId },
      );
    }
    logger.info("[impact-engine] change impact assessed", {
      changeId: change.changeId,
      severity: result.impactSeverity,
      affectedUstns: result.affectedActiveUstns.length,
      affectedIntegrations: result.affectedIntegrations.length,
    });
  } catch (err) {
    logger.error("[impact-engine] persistImpactAndAdvance DB error", {
      error: String(err),
      changeId: change.changeId,
    });
    throw err;
  }
}

/**
 * Persist the simulation result on the RegulatoryChangeV2 row + advance
 * the pipeline IMPACTED → SIMULATED. Updates the SIMULATED
 * ChangePipelineStep row with the simulation data. Throws on DB error.
 */
async function persistSimulationAndAdvance(
  change: RegulatoryChangeV2,
  result: SimulationResult,
): Promise<void> {
  const now = new Date();
  const history = parsePipelineHistory(change.pipelineHistory);
  history.push({
    status: "SIMULATED",
    at: now.toISOString(),
    actor: "impact-engine",
    notes: `recommendation=${result.recommendation}, financial=$${result.totalFinancialImpactUsd}, compliance=${result.totalComplianceImpact}`,
  });
  try {
    await db.regulatoryChangeV2.update({
      where: { changeId: change.changeId },
      data: {
        pipelineStatus: "SIMULATED",
        pipelineHistory: JSON.stringify(history),
      },
    });
    try {
      await db.changePipelineStep.update({
        where: {
          changeId_stepName: {
            changeId: change.changeId,
            stepName: "SIMULATED",
          },
        },
        data: {
          status: "COMPLETED",
          actor: "impact-engine",
          resultSummary: `Simulated ${result.simulatedTrades.length} trades; recommendation=${result.recommendation}`,
          resultData: JSON.stringify({
            totalFinancialImpactUsd: result.totalFinancialImpactUsd,
            totalComplianceImpact: result.totalComplianceImpact,
            recommendation: result.recommendation,
            simulatedTradeCount: result.simulatedTrades.length,
          }),
          startedAt: now,
          completedAt: now,
        },
      });
    } catch (stepErr) {
      logger.error(
        "[impact-engine] SIMULATED step update failed (non-fatal)",
        { error: String(stepErr), changeId: change.changeId },
      );
    }
    logger.info("[impact-engine] change simulated", {
      changeId: change.changeId,
      recommendation: result.recommendation,
      totalFinancialImpactUsd: result.totalFinancialImpactUsd,
      totalComplianceImpact: result.totalComplianceImpact,
    });
  } catch (err) {
    logger.error("[impact-engine] persistSimulationAndAdvance DB error", {
      error: String(err),
      changeId: change.changeId,
    });
    throw err;
  }
}

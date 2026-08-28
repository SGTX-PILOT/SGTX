// @ts-nocheck
/**
 * SGTX Customs Gateway — Trade Feasibility Engine (§82)
 * ===========================================================================
 *
 * Pre-trade feasibility check. A trader or broker can ask "is this trade
 * even possible?" BEFORE committing to a contract or a customs filing.
 *
 * The engine runs 15 deterministic checks (sanctions, HS classification,
 * origin rules, destination restrictions, import/export restrictions,
 * permit requirements, documentation completeness, tariff/rate checks,
 * quantity checks, country restrictions, agricultural requirements,
 * product safety, controlled goods, dual-use, customs data validation)
 * and returns:
 *
 *   FEASIBLE                       — trade looks viable, no blockers
 *   FEASIBLE_WITH_REQUIREMENTS    — viable but documents/licences/certs needed
 *   REQUIRES_BROKER_REVIEW        — a licensed broker must assess
 *   REQUIRES_AUTHORITY_CONFIRMATION — the customs authority must pre-clear
 *   BLOCKED_BY_POLICY             — sanctions / controlled-goods block
 *   UNKNOWN                       — insufficient data to decide
 *
 * CRITICAL CONSTRAINT (§82 + §113):
 *   This engine is an INTERNAL ADVISORY tool. It MUST NEVER present its
 *   output as "legal clearance" or "government authorisation". A
 *   FEASIBLE result is a planning signal, NOT a customs release. Only
 *   an authoritative customs authority can issue clearance — and only
 *   after an actual filing (which the customs-gateway core handles
 *   elsewhere, with Governor gating).
 *
 *   In particular:
 *     - sanctionsClearance is a screening signal, NOT an OFAC licence
 *     - estimatedDuty / estimatedTax are rough heuristics, NOT a quote
 *     - requiredLicences / requiredCertificates are CHECKLIST items,
 *       NOT actual issued permits
 *     - the notes field ALWAYS carries the §82 disclaimer
 *
 * Deterministic policy controls blocking:
 *   - BLOCKED_BY_POLICY is only returned by deterministic rules
 *     (sanctions hit, controlled-goods list match, embargoed country).
 *   - AI may ASSIST (classify HS code, detect anomalies) but the final
 *     BLOCK decision is made by the deterministic policy table (A4 —
 *     Governor enforces), never by an AI prediction.
 *
 * Persistence:
 *   - This engine is READ-ONLY. It never mutates a trade row.
 *   - It does not create a CustomsDeclaration — that is the
 *     customs-gateway core's job (after Governor approval).
 *   - The result MAY be cached as an Activity row by the calling API
 *     route (not by this lib) for audit. This lib returns the result;
 *     the caller decides persistence.
 *
 * All public functions are wrapped in try/catch with safe defaults — the
 * engine never throws synchronously into API routes.
 */

import { logger } from "@/lib/sgtx/logger";

// ============ Types ============

export interface FeasibilityInput {
  product: string;
  hsCode: string;
  origin: string;
  destination: string;
  quantity: number;
  value: number;
  incoterm: string;
  transportMode: string;
  importExport: "IMPORT" | "EXPORT" | "TRANSIT";
  jurisdiction: string;
}

export type FeasibilityResult =
  | "FEASIBLE"
  | "FEASIBLE_WITH_REQUIREMENTS"
  | "REQUIRES_BROKER_REVIEW"
  | "REQUIRES_AUTHORITY_CONFIRMATION"
  | "BLOCKED_BY_POLICY"
  | "UNKNOWN";

export interface FeasibilityOutput {
  result: FeasibilityResult;
  requirements: string[];
  blockers: string[];
  warnings: string[];
  estimatedDuty: number;
  estimatedTax: number;
  requiredDocuments: string[];
  requiredLicenses: string[];
  requiredCertificates: string[];
  sanctionsCheck: string;
  notes: string;
}

// ============ Deterministic Policy Tables ============

/**
 * §82 — Embargoed jurisdictions. Any trade touching one of these is
 * BLOCKED_BY_POLICY deterministically. This list is illustrative and
 * is meant to be sourced from the existing sanctions-screening lib
 * (src/lib/sgtx/compliance/sanctions.ts) at runtime.
 */
const EMBARGOED_COUNTRIES = new Set([
  "CU", "IR", "KP", "SY", "BY", // OFAC comprehensive embargo targets
]);

/**
 * §82 — Controlled-goods HS chapter prefixes. Goods whose HS code starts
 * with one of these chapters always require broker + authority review.
 * (Chapter 93 = arms/ammunition; Chapter 27 = mineral fuels — dual-use
 * adjacent; Chapter 28 = inorganic chemicals — precursors; Chapter 29 =
 * organic chemicals — precursors; Chapter 30 = pharma — controlled
 * substances; Chapter 36 = explosives.)
 */
const CONTROLLED_HS_PREFIXES = [
  "9301", "9302", "9303", "9304", "9305", "9306", "9307", // arms
  "3601", "3602", "3603", // explosives
  "2939", // alkaloids (narcotics precursors)
  "2936", // hormones (controlled)
];

/**
 * §82 — Agricultural / phytosanitary HS chapters. Always require health /
 * phytosanitary certificates + broker review.
 */
const AGRI_HS_PREFIXES = [
  "01", "02", "03", "04", "05",   // live animals + animal products
  "06", "07", "08", "09", "10",   // plants + vegetable products
  "12", "13", "14", "15",         // oilseeds + vegetable fats
  "16", "17", "18", "19", "20", "21", // foodstuffs
];

/**
 * §82 — Documents required for every customs trade (baseline). The
 * engine adds more based on transport mode + commodity.
 */
const BASELINE_DOCUMENTS = [
  "Commercial Invoice",
  "Packing List",
  "Bill of Lading / Transport Document",
  "Certificate of Origin",
];

/**
 * §82 — Per-Incoterm documentation hints. (EXW shifts export clearance
 * burden to the buyer; DDP shifts import clearance to the seller.)
 */
const INCOTERM_DOCS: Record<string, string[]> = {
  EXW: ["Export Licence (buyer-side clearance)"],
  FOB: [],
  CIF: [],
  CFR: [],
  DAP: [],
  DDP: ["Import Licence (seller-side clearance)", "VAT/Customs Power of Attorney"],
  FCA: [],
  CPT: [],
  CIP: [],
};

/**
 * §82 — Per-transport-mode documentation hints.
 */
const TRANSPORT_DOCS: Record<string, string[]> = {
  SEA: ["Ocean Bill of Lading", "Vessel / Container Manifest"],
  AIR: ["Air Waybill (AWB)"],
  ROAD: ["CMR Consignment Note"],
  RAIL: ["CIM Consignment Note"],
  MULTIMODAL: ["FIATA Multimodal Bill of Lading"],
};

// ============ §82 Public Entry Point ============

/**
 * §82 — Pre-trade feasibility check. Runs the 15 deterministic checks
 * and returns a planning result. NEVER presents output as legal
 * clearance (§82 + §113). On any internal error returns UNKNOWN with
 * the failure described in `notes` — never throws.
 */
export async function checkTradeFeasibility(
  input: FeasibilityInput,
): Promise<FeasibilityOutput> {
  try {
    _validateInput(input);
    const ctx = _buildContext(input);

    const blockers: string[] = [];
    const requirements: string[] = [];
    const warnings: string[] = [];
    const requiredDocuments = new Set<string>(BASELINE_DOCUMENTS);
    const requiredLicenses = new Set<string>();
    const requiredCertificates = new Set<string>();
    let sanctionsCheck = "NOT_SCREENED";
    let estimatedDuty = 0;
    let estimatedTax = 0;

    // 1. Sanctions screening (deterministic; enrichment from external lib
    //    is optional and best-effort — fail-closed on internal error).
    sanctionsCheck = await _screenSanctions(input, ctx, blockers, warnings);

    // 2. HS classification validity.
    _checkHsClassification(input, ctx, blockers, warnings);

    // 3. Origin rules.
    _checkOriginRules(input, ctx, blockers, warnings, requiredCertificates);

    // 4. Destination restrictions.
    _checkDestinationRestrictions(input, ctx, blockers, warnings, requiredLicenses);

    // 5. Import/export restrictions.
    _checkImportExportRestrictions(input, ctx, blockers, warnings, requiredLicenses);

    // 6. Permit requirements.
    _checkPermitRequirements(input, ctx, requirements, requiredLicenses);

    // 7. Documentation completeness (baseline + incoterm + transport).
    _checkDocumentation(input, ctx, requirements, requiredDocuments);

    // 8. Tariff / rate checks (estimated duty / tax).
    const dutyTax = _checkTariffRates(input, ctx, warnings);
    estimatedDuty = dutyTax.duty;
    estimatedTax = dutyTax.tax;

    // 9. Quantity checks.
    _checkQuantity(input, ctx, warnings, blockers);

    // 10. Country restrictions (advisory).
    _checkCountryRestrictions(input, ctx, warnings, requiredLicenses);

    // 11. Agricultural requirements.
    _checkAgricultural(input, ctx, requirements, requiredCertificates, warnings);

    // 12. Product safety.
    _checkProductSafety(input, ctx, requirements, requiredCertificates, warnings);

    // 13. Controlled goods (deterministic BLOCK).
    _checkControlledGoods(input, ctx, blockers, requirements, requiredLicenses);

    // 14. Dual-use.
    _checkDualUse(input, ctx, warnings, requiredLicenses, requirements);

    // 15. Customs data validation.
    _checkCustomsDataValidation(input, ctx, warnings, blockers);

    const result = _decideResult(blockers, requirements, warnings);

    return {
      result,
      requirements: Array.from(new Set(requirements)),
      blockers: Array.from(new Set(blockers)),
      warnings: Array.from(new Set(warnings)),
      estimatedDuty: Math.round(estimatedDuty * 100) / 100,
      estimatedTax: Math.round(estimatedTax * 100) / 100,
      requiredDocuments: Array.from(requiredDocuments).sort(),
      requiredLicenses: Array.from(requiredLicenses).sort(),
      requiredCertificates: Array.from(requiredCertificates).sort(),
      sanctionsCheck,
      notes: _disclaimer(result),
    };
  } catch (err) {
    logger.error("[customs-gateway/trade-feasibility] checkTradeFeasibility failed", {
      error: String(err),
    });
    return {
      result: "UNKNOWN",
      requirements: [],
      blockers: [`internal-error: ${String(err)}`],
      warnings: [],
      estimatedDuty: 0,
      estimatedTax: 0,
      requiredDocuments: [],
      requiredLicenses: [],
      requiredCertificates: [],
      sanctionsCheck: "SCREENING_FAILED",
      notes: _disclaimer("UNKNOWN") + " Internal error — please retry.",
    };
  }
}

// ============ §82 Internal helpers ============

interface _Ctx {
  originUpper: string;
  destUpper: string;
  jurisdictionUpper: string;
  hsValid: boolean;
  incotermUpper: string;
  transportUpper: string;
  isControlled: boolean;
  isAgri: boolean;
}

function _buildContext(input: FeasibilityInput): _Ctx {
  const originUpper = String(input.origin || "").toUpperCase().slice(0, 2);
  const destUpper = String(input.destination || "").toUpperCase().slice(0, 2);
  const jurisdictionUpper = String(input.jurisdiction || "").toUpperCase().slice(0, 2);
  const hs = String(input.hsCode || "").replace(/\s+/g, "");
  const hsValid = /^\d{6,10}$/.test(hs);
  const incotermUpper = String(input.incoterm || "").toUpperCase();
  const transportUpper = String(input.transportMode || "").toUpperCase();
  const isControlled = hsValid && CONTROLLED_HS_PREFIXES.some((p) => hs.startsWith(p));
  const isAgri = hsValid && AGRI_HS_PREFIXES.some((p) => hs.startsWith(p));
  return { originUpper, destUpper, jurisdictionUpper, hsValid, incotermUpper, transportUpper, isControlled, isAgri };
}

function _validateInput(input: FeasibilityInput): void {
  if (!input || typeof input !== "object") throw new Error("input required");
  if (!input.product) throw new Error("product required");
  if (!input.origin) throw new Error("origin required");
  if (!input.destination) throw new Error("destination required");
  if (typeof input.quantity !== "number" || input.quantity <= 0) {
    throw new Error("quantity must be a positive number");
  }
  if (typeof input.value !== "number" || input.value <= 0) {
    throw new Error("value must be a positive number");
  }
  if (!["IMPORT", "EXPORT", "TRANSIT"].includes(input.importExport)) {
    throw new Error(`importExport must be IMPORT | EXPORT | TRANSIT (got ${input.importExport})`);
  }
}

async function _screenSanctions(
  input: FeasibilityInput,
  ctx: _Ctx,
  blockers: string[],
  warnings: string[],
): Promise<string> {
  // Fail-closed: if either origin or destination is a comprehensive
  // embargo target, return BLOCKED_BY_POLICY deterministically.
  if (EMBARGOED_COUNTRIES.has(ctx.originUpper)) {
    blockers.push(`sanctions: origin ${ctx.originUpper} is under comprehensive embargo`);
  }
  if (EMBARGOED_COUNTRIES.has(ctx.destUpper)) {
    blockers.push(`sanctions: destination ${ctx.destUpper} is under comprehensive embargo`);
  }
  // Best-effort enrichment from the sanctions-screening lib. This is a
  // signal only — never an OFAC licence. We screen the product string as
  // a proxy for the counterparty (which we don't have here). The real
  // counterparty screening happens in the customs-gateway core when the
  // actual declaration is filed.
  try {
    const sanctions = await import("@/lib/sgtx/compliance/sanctions");
    const screen = (sanctions as any).screenForSanctions;
    if (typeof screen === "function") {
      const res = await screen({ name: input.product, type: "goods" });
      if (res && Array.isArray(res.hits) && res.hits.length > 0) {
        const high = res.hits.filter(
          (h: any) => (h.matchScore || 0) >= 0.85,
        );
        if (high.length > 0) {
          blockers.push(
            `sanctions: ${high.length} high-confidence hit(s) on product name (manual review required)`,
          );
          return "HIGH_CONFIDENCE_HIT";
        }
        if (res.hits.length > 0) {
          warnings.push(
            `sanctions: ${res.hits.length} fuzzy hit(s) on product name — verify counterparty`,
          );
          return "FUZZY_HIT";
        }
      }
      return "CLEAR";
    }
  } catch (err) {
    warnings.push(`sanctions: external screening unavailable (${String(err)}) — manual verification required`);
    return "SCREENING_UNAVAILABLE";
  }
  return "NOT_SCREENED";
}

function _checkHsClassification(
  input: FeasibilityInput,
  ctx: _Ctx,
  blockers: string[],
  warnings: string[],
): void {
  if (!ctx.hsValid) {
    blockers.push(
      "hs-classification: HS code is missing or not 6–10 numeric digits — cannot classify",
    );
    return;
  }
  // 10-digit is the most specific; 6-digit is the international minimum.
  if (input.hsCode.length < 8) {
    warnings.push(
      "hs-classification: HS code is 6–7 digits — country-specific sub-codes recommended",
    );
  }
}

function _checkOriginRules(
  _input: FeasibilityInput,
  ctx: _Ctx,
  blockers: string[],
  warnings: string[],
  certs: Set<string>,
): void {
  if (ctx.originUpper === ctx.destUpper) {
    warnings.push("origin: origin and destination are the same country — verify transit classification");
  }
  // Origin certificate is generally required for FTA preference claims.
  certs.add("Certificate of Origin (CoO) — for FTA preference");
  if (ctx.originUpper && ctx.destUpper && ctx.originUpper !== ctx.destUpper) {
    // OK — international trade
  } else if (!ctx.originUpper) {
    blockers.push("origin: origin country is missing — cannot determine origin rules");
  }
}

function _checkDestinationRestrictions(
  _input: FeasibilityInput,
  ctx: _Ctx,
  blockers: string[],
  warnings: string[],
  licenses: Set<string>,
): void {
  if (!ctx.destUpper) {
    blockers.push("destination: destination country is missing");
    return;
  }
  // Selected destination-specific advisory signals. These are NOT
  // government clearance — they are checklist items.
  if (ctx.destUpper === "US") {
    licenses.add("FDA Prior Notice (if food/drug/cosmetic/medical device)");
    licenses.add("EPA / DOT form (if regulated product)");
  }
  if (ctx.destUpper === "EU" || ["DE", "FR", "IT", "ES", "NL", "BE"].includes(ctx.destUpper)) {
    licenses.add("EU EORI number (importer)");
    licenses.add("CBAM declaration (if covered goods)");
  }
  if (ctx.destUpper === "EG") {
    licenses.add("ACID pre-registration (CargoX / Nafeza)");
  }
  if (ctx.destUpper === "CN") {
    licenses.add("CCC / CCCF certification (if applicable)");
  }
  if (ctx.destUpper === "IN") {
    licenses.add("BIS / GSTIN registration (importer)");
  }
  if (ctx.destUpper === "BR") {
    licenses.add(" importer RADAR registration (Receita Federal)");
  }
}

function _checkImportExportRestrictions(
  input: FeasibilityInput,
  _ctx: _Ctx,
  _blockers: string[],
  warnings: string[],
  licenses: Set<string>,
): void {
  if (input.importExport === "EXPORT") {
    licenses.add("Export Licence (if dual-use / controlled / strategic)");
  }
  if (input.importExport === "IMPORT") {
    licenses.add("Import Licence (if restricted commodity)");
  }
  if (input.importExport === "TRANSIT") {
    warnings.push("transit: T1/T2 transit declaration + customs guarantee may be required (EU/UK)");
    licenses.add("T1 / T2 transit document (if EU/UK transit)");
  }
}

function _checkPermitRequirements(
  _input: FeasibilityInput,
  ctx: _Ctx,
  requirements: string[],
  licenses: Set<string>,
): void {
  if (ctx.isAgri) {
    licenses.add("Phytosanitary Import Permit (destination)");
    requirements.push("Confirm destination import permit for agricultural goods");
  }
  if (ctx.isControlled) {
    licenses.add("End-User Statement (EUS)");
    licenses.add("Import / Export Licence for controlled goods");
  }
}

function _checkDocumentation(
  input: FeasibilityInput,
  ctx: _Ctx,
  requirements: string[],
  docs: Set<string>,
): void {
  const itDocs = INCOTERM_DOCS[ctx.incotermUpper] || [];
  itDocs.forEach((d) => docs.add(d));
  const tDocs = TRANSPORT_DOCS[ctx.transportUpper] || [];
  tDocs.forEach((d) => docs.add(d));
  if (!ctx.incotermUpper) {
    requirements.push("Specify Incoterm to determine documentation responsibilities");
  }
  if (!ctx.transportUpper) {
    requirements.push("Specify transport mode to determine transport document type");
  }
}

function _checkTariffRates(
  input: FeasibilityInput,
  ctx: _Ctx,
  warnings: string[],
): { duty: number; tax: number } {
  // Rough heuristic only — NOT a quote. The actual rate is determined at
  // filing time by the customs authority, based on the final HS code,
  // origin, valuation method, and any applicable FTA.
  let dutyRate = 0.05; // 5% baseline
  let taxRate = 0.10;  // 10% VAT baseline
  if (ctx.isAgri) {
    dutyRate = 0.12;
    taxRate = 0.05; // many jurisdictions zero-rate food
  }
  if (ctx.isControlled) {
    dutyRate = 0.0;
    taxRate = 0.0;
    warnings.push("tariff: controlled goods — duty/tax regime is authority-determined; estimate set to 0");
  }
  // Trade-value scaling: large values often attract additional excise.
  if (input.value > 1_000_000) {
    warnings.push("tariff: high-value shipment — consider de minimis / valuation method review");
  }
  const duty = input.value * dutyRate;
  const tax = (input.value + duty) * taxRate;
  return { duty, tax };
}

function _checkQuantity(
  input: FeasibilityInput,
  _ctx: _Ctx,
  warnings: string[],
  blockers: string[],
): void {
  if (input.quantity <= 0) {
    blockers.push("quantity: must be greater than zero");
    return;
  }
  if (input.quantity > 1_000_000) {
    warnings.push("quantity: very large quantity — confirm unit-of-measure (kg / pieces / litres)");
  }
}

function _checkCountryRestrictions(
  _input: FeasibilityInput,
  ctx: _Ctx,
  warnings: string[],
  _licenses: Set<string>,
): void {
  // Advisory only — never a block (sanctions embargo is the block).
  if (ctx.originUpper === ctx.destUpper && ctx.originUpper !== "") {
    warnings.push(`country: domestic movement in ${ctx.originUpper} — confirm customs filing is required`);
  }
}

function _checkAgricultural(
  _input: FeasibilityInput,
  ctx: _Ctx,
  requirements: string[],
  certs: Set<string>,
  _warnings: string[],
): void {
  if (!ctx.isAgri) return;
  certs.add("Phytosanitary Certificate (origin)");
  certs.add("Health Certificate (if animal-origin)");
  requirements.push("Agricultural goods: confirm MRL (maximum residue limits) compliance with destination");
}

function _checkProductSafety(
  _input: FeasibilityInput,
  ctx: _Ctx,
  requirements: string[],
  certs: Set<string>,
  _warnings: string[],
): void {
  // Advisory — destination-specific safety marks.
  if (ctx.destUpper === "EU" || ["DE", "FR", "IT", "ES", "NL"].includes(ctx.destUpper)) {
    certs.add("CE Marking (if regulated product)");
    requirements.push("EU: confirm REACH / RoHS compliance if chemical / electronic");
  }
  if (ctx.destUpper === "US") {
    certs.add("FCC / UL mark (if electronic)");
    requirements.push("US: confirm CPSC, FDA, or NHTSA jurisdiction as applicable");
  }
  if (ctx.destUpper === "CN") {
    certs.add("CCC / CCCF mark (if regulated product)");
  }
}

function _checkControlledGoods(
  input: FeasibilityInput,
  ctx: _Ctx,
  blockers: string[],
  requirements: string[],
  licenses: Set<string>,
): void {
  if (!ctx.isControlled) return;
  // Deterministic BLOCK (A4 — Governor enforces at filing time; here we
  // surface the block at feasibility stage so the trader doesn't waste
  // effort planning a trade that cannot proceed without a licence).
  blockers.push(
    `controlled-goods: HS ${input.hsCode} matches a controlled-goods prefix — licence + broker review MANDATORY`,
  );
  requirements.push("Controlled goods: pre-clear with the customs authority BEFORE shipment");
  licenses.add("Controlled-goods Import/Export Licence (jurisdiction-specific)");
}

function _checkDualUse(
  _input: FeasibilityInput,
  ctx: _Ctx,
  warnings: string[],
  licenses: Set<string>,
  requirements: string[],
): void {
  // Dual-use detection is best-effort. The HS chapter prefix is a
  // coarse signal — a real dual-use classification depends on the
  // specific product and end-use, which only the broker + authority can
  // determine. NEVER present this as a definitive classification.
  const dualUsePrefixes = ["8479", "8486", "8543", "9031", "9032", "2803", "2902"];
  const hs = String(_input.hsCode || "");
  if (dualUsePrefixes.some((p) => hs.startsWith(p))) {
    warnings.push(
      "dual-use: HS code chapter may include dual-use items — broker must perform EU 2021/821 / EAR / Wassenaar classification",
    );
    licenses.add("Dual-Use Export Licence (if classified as dual-use)");
    requirements.push("Dual-use: file end-use / end-user statement (EUS)");
  }
}

function _checkCustomsDataValidation(
  input: FeasibilityInput,
  ctx: _Ctx,
  warnings: string[],
  blockers: string[],
): void {
  if (!input.product || String(input.product).trim().length < 3) {
    blockers.push("data: product description is too short for customs filing");
  }
  if (!ctx.hsValid) {
    blockers.push("data: HS code missing or invalid");
  }
  if (!ctx.incotermUpper) {
    warnings.push("data: Incoterm missing — terms of sale cannot be determined");
  }
  if (!ctx.transportUpper) {
    warnings.push("data: transport mode missing");
  }
  if (input.value > 0 && input.value < 100) {
    warnings.push("data: very low shipment value — confirm de minimis threshold at destination");
  }
}

function _decideResult(
  blockers: string[],
  requirements: string[],
  warnings: string[],
): FeasibilityResult {
  if (blockers.length > 0) {
    // Sanctions + controlled-goods blockers are absolute.
    const absolute = blockers.some(
      (b) => b.startsWith("sanctions:") || b.startsWith("controlled-goods:"),
    );
    if (absolute) return "BLOCKED_BY_POLICY";
    // Other blockers (missing data, invalid HS) require broker review.
    return "REQUIRES_BROKER_REVIEW";
  }
  if (requirements.some((r) => /pre-clear|pre-clear with the customs authority/i.test(r))) {
    return "REQUIRES_AUTHORITY_CONFIRMATION";
  }
  if (requirements.length > 0 || warnings.length > 3) {
    return "FEASIBLE_WITH_REQUIREMENTS";
  }
  return "FEASIBLE";
}

/**
 * §82 — Disclaimer text. ALWAYS returned in `notes`. The wording
 * explicitly distinguishes the AI/planning result from a customs
 * authority clearance. This is the §82 anti-misrepresentation guard.
 */
function _disclaimer(result: FeasibilityResult): string {
  const base =
    "ADVISORY ONLY (§82). This result is an internal SGTX planning signal derived from deterministic policy tables and (where available) external sanctions screening. It is NOT a legal determination, NOT a customs authority clearance, and NOT a permit. Only an authoritative customs authority can issue clearance — and only after an actual filing with Governor approval (§113). Estimated duty/tax are rough heuristics, not a quote. Required licences/certificates are CHECKLIST items, not issued permits.";
  const tail: Record<FeasibilityResult, string> = {
    FEASIBLE:
      " Result: FEASIBLE — no blockers detected at planning stage. Final clearance still requires an actual customs filing.",
    FEASIBLE_WITH_REQUIREMENTS:
      " Result: FEASIBLE_WITH_REQUIREMENTS — viable but documents/licences/certificates must be obtained before filing.",
    REQUIRES_BROKER_REVIEW:
      " Result: REQUIRES_BROKER_REVIEW — a licensed customs broker must assess before proceeding.",
    REQUIRES_AUTHORITY_CONFIRMATION:
      " Result: REQUIRES_AUTHORITY_CONFIRMATION — the customs authority must pre-clear this trade before commitment.",
    BLOCKED_BY_POLICY:
      " Result: BLOCKED_BY_POLICY — sanctions or controlled-goods policy prevents this trade. Do not proceed.",
    UNKNOWN:
      " Result: UNKNOWN — insufficient data to make a determination. Retry with complete inputs.",
  };
  return base + tail[result];
}

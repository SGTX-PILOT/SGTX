// @ts-nocheck
/**
 * SGTX GRiRE — Product × Corridor Document Matrix (G-01)
 * ===========================================
 *
 * Returns the product- AND corridor-specific document set required to clear
 * customs for a given (HS code, origin, destination) triple. The matrix below
 * hardcodes the top 20 trade lanes for SGTX's anchor commodities (frozen
 * fruit, coffee, electronics, textiles, food) and falls back to GRiRE's
 * generic country-required-documents lookup when no exact lane match exists.
 *
 * Each entry encodes the *real* document stack a broker would assemble for
 * that lane — including product-specific certs (Halal, CE, RoHS, SASO CoC,
 * GSP Form A, EUR.1, ATR.1, FDA Prior Notice, FSMA, Phytosanitary, etc.).
 *
 * Blueprint Part 54 — "What docs do I need for THIS product on THIS lane?"
 */

import { logger } from "@/lib/sgtx/logger";
import { getRequiredDocuments } from "@/lib/sgtx/grire";

// ── Types ────────────────────────────────────────────────────────────────

export type DocFormat = "ORIGINAL" | "ELECTRONIC" | "ORIGINAL_OR_ELECTRONIC";
export type TriggerEvent =
  | "PRE_SHIPMENT"
  | "AT_LOADING"
  | "IN_TRANSIT"
  | "PRE_ARRIVAL"
  | "AT_CLEARANCE"
  | "POST_CLEARANCE";

export interface CorridorDocument {
  docType: string;
  docName: string;
  mandatory: boolean;
  issuingAuthority: string;
  format: DocFormat;
  languageRequirement: string;
  triggerEvent: TriggerEvent;
  notes: string;
}

export interface CorridorMatrixResult {
  hsCode: string;
  originCountry: string;
  destinationCountry: string;
  lane: string;
  documents: CorridorDocument[];
  source: string;
  generatedAt: string;
}

// ── HS-code family classifier (so we can match by commodity family) ─────

interface HsFamily {
  family: string;
  label: string;
  prefixes: string[];
}

const HS_FAMILIES: HsFamily[] = [
  { family: "frozen_fruit", label: "Frozen fruit / berries", prefixes: ["0811"] },
  { family: "coffee", label: "Coffee, tea, mate & spices", prefixes: ["0901", "0902", "0903", "0904", "0905", "0906"] },
  { family: "electronics", label: "Electronics / electrical machinery", prefixes: ["8471", "8517", "8525", "8528", "8504", "8544", "8542", "8541"] },
  { family: "textiles", label: "Textiles & garments", prefixes: ["50", "51", "52", "53", "54", "55", "56", "57", "58", "59", "60", "61", "62", "63"] },
  { family: "food", label: "Foodstuffs (general)", prefixes: ["02", "03", "04", "07", "08", "09", "15", "16", "17", "18", "19", "20", "21", "22"] },
  { family: "fresh_produce", label: "Fresh fruit & vegetables", prefixes: ["0701", "0702", "0703", "0704", "0705", "0706", "0707", "0708", "0709", "0710", "0711", "0712", "0713", "0714", "0801", "0802", "0803", "0804", "0805", "0806", "0807", "0808", "0809", "0810"] },
  { family: "meat", label: "Meat & edible offal", prefixes: ["0201", "0202", "0203", "0204", "0205", "0206", "0207", "0208", "0209", "0210"] },
  { family: "dairy", label: "Dairy", prefixes: ["0401", "0402", "0403", "0404", "0405", "0406"] },
  { family: "pharma", label: "Pharmaceuticals", prefixes: ["3002", "3003", "3004", "3005", "3006"] },
  { family: "chemicals", label: "Chemicals", prefixes: ["28", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39"] },
];

function classifyHsFamily(hsCode: string): HsFamily | null {
  const code = (hsCode ?? "").trim();
  if (!code) return null;
  for (const fam of HS_FAMILIES) {
    if (fam.prefixes.some((p) => code.startsWith(p))) return fam;
  }
  return null;
}

// ── Document factory helpers (keeps matrix readable) ────────────────────

const doc = (
  docType: string,
  docName: string,
  mandatory: boolean,
  issuingAuthority: string,
  format: DocFormat,
  languageRequirement: string,
  triggerEvent: TriggerEvent,
  notes: string,
): CorridorDocument => ({
  docType,
  docName,
  mandatory,
  issuingAuthority,
  format,
  languageRequirement,
  triggerEvent,
  notes,
});

// Common reusable documents
const COMMON_DOCS = {
  packingList: (lang = "English") =>
    doc("PACKING_LIST", "Packing List", true, "Shipper / Exporter", "ORIGINAL_OR_ELECTRONIC", lang, "AT_LOADING", "Detailed carton/pallet breakdown with weights & dimensions."),
  commercialInvoice: (lang = "English") =>
    doc("COMMERCIAL_INVOICE", "Commercial Invoice", true, "Shipper / Exporter", "ORIGINAL_OR_ELECTRONIC", lang, "AT_LOADING", "CIF/FOB value, currency, HS code per line, Incoterms 2020."),
  bl: () =>
    doc("BILL_OF_LADING", "Bill of Lading / AWB / CMR", true, "Carrier", "ORIGINAL_OR_ELECTRONIC", "English", "AT_LOADING", "Negotiable or sea waybill; consignee per L/C requirements."),
  phytosanitary: () =>
    doc("PHYTOSANITARY", "Phytosanitary Certificate", true, "Origin NPPO", "ORIGINAL", "English + origin language", "PRE_SHIPMENT", "Issued by National Plant Protection Organisation; verify destination pest list."),
  healthCert: () =>
    doc("HEALTH_CERTIFICATE", "Health / Veterinary Certificate", true, "Origin competent authority", "ORIGINAL", "English + destination language", "PRE_SHIPMENT", "Required for animal-origin products and high-risk food."),
  coo: () =>
    doc("CERTIFICATE_OF_ORIGIN", "Certificate of Origin (generic)", true, "Chamber of Commerce", "ORIGINAL_OR_ELECTRONIC", "English", "PRE_SHIPMENT", "Non-preferential origin attestation."),
  halal: () =>
    doc("HALAL_CERTIFICATE", "Halal Certificate", true, "Recognised Islamic body (JAKIM/MUI/GAC/MUIS)", "ORIGINAL", "Arabic + English", "PRE_SHIPMENT", "Must be issued by a body recognised by destination country."),
};

// ── Lane matrix (top 20 trade lanes for SGTX anchor commodities) ────────
//
// Key: `${originISO2}->${destISO2}|${family}`
// When no family-specific lane exists, the generic lane (`*`) is used.

type LaneKey = string; // `${origin}->${dest}|${family|*}`

const LANE_MATRIX: Record<LaneKey, CorridorDocument[]> = {
  // ── Egypt → EU (frozen fruit) ───────────────────────────────────────
  "EG->DE|frozen_fruit": [
    doc("PHYTOSANITARY", "Phytosanitary Certificate", true, "Egyptian NPPO (PPA)", "ORIGINAL", "English", "PRE_SHIPMENT", "CAPA-issued; destination pest list must be checked."),
    doc("EUR1", "EUR.1 Movement Certificate", false, "Chamber of Commerce (Egypt)", "ORIGINAL", "English", "PRE_SHIPMENT", "EG-EU Association Agreement preferential origin."),
    doc("HEALTH_CERTIFICATE", "Health Certificate (EU)", true, "Egyptian Food Safety Authority (NFFS)", "ORIGINAL", "English", "PRE_SHIPMENT", "EU 2017/625 official control."),
    doc("COLD_TREATMENT", "Cold Treatment / Pre-cooling Report", true, "Approved treatment facility", "ORIGINAL", "English", "PRE_SHIPMENT", "Mandatory for cold-disinfestation of fruit flies."),
    COMMON_DOCS.packingList("English"),
    COMMON_DOCS.commercialInvoice("English"),
    COMMON_DOCS.bl(),
  ],
  "EG->FR|frozen_fruit": [
    doc("PHYTOSANITARY", "Phytosanitary Certificate", true, "Egyptian NPPO (PPA)", "ORIGINAL", "French + English", "PRE_SHIPMENT", "France DGAL-recognised."),
    doc("EUR1", "EUR.1 Movement Certificate", false, "Chamber of Commerce (Egypt)", "ORIGINAL", "English", "PRE_SHIPMENT", "EG-EU Association Agreement preferential origin."),
    doc("HEALTH_CERTIFICATE", "Health Certificate (EU)", true, "NFFS Egypt", "ORIGINAL", "French + English", "PRE_SHIPMENT", "EU 2017/625 official control."),
    COMMON_DOCS.packingList("French"),
    COMMON_DOCS.commercialInvoice("French"),
    COMMON_DOCS.bl(),
  ],
  "EG->NL|frozen_fruit": [
    doc("PHYTOSANITARY", "Phytosanitary Certificate", true, "Egyptian NPPO (PPA)", "ORIGINAL", "English", "PRE_SHIPMENT", "NVWA-recognised."),
    doc("EUR1", "EUR.1 Movement Certificate", false, "Chamber of Commerce (Egypt)", "ORIGINAL", "English", "PRE_SHIPMENT", "EG-EU Association Agreement preferential origin."),
    doc("HEALTH_CERTIFICATE", "Health Certificate (EU)", true, "NFFS Egypt", "ORIGINAL", "Dutch + English", "PRE_SHIPMENT", "EU 2017/625 official control."),
    doc("COLD_TREATMENT", "Cold Treatment Report", true, "Approved treatment facility", "ORIGINAL", "English", "PRE_SHIPMENT", "Port of Rotterdam inspection."),
    COMMON_DOCS.packingList("English"),
    COMMON_DOCS.commercialInvoice("English"),
    COMMON_DOCS.bl(),
  ],
  // ── Egypt → GCC (frozen fruit) ──────────────────────────────────────
  "EG->SA|frozen_fruit": [
    COMMON_DOCS.phytosanitary(),
    COMMON_DOCS.halal(),
    doc("SASO_COC", "SASO Certificate of Conformity (SABER)", true, "SASO-approved CB", "ELECTRONIC", "Arabic + English", "PRE_SHIPMENT", "Mandatory for SASO-regulated products; SABER registration."),
    COMMON_DOCS.coo(),
    COMMON_DOCS.packingList("Arabic"),
    COMMON_DOCS.commercialInvoice("Arabic + English"),
    COMMON_DOCS.bl(),
  ],
  "EG->AE|frozen_fruit": [
    COMMON_DOCS.phytosanitary(),
    COMMON_DOCS.halal(),
    COMMON_DOCS.coo(),
    COMMON_DOCS.packingList("Arabic + English"),
    COMMON_DOCS.commercialInvoice("English"),
    COMMON_DOCS.bl(),
  ],
  // ── Egypt → UK (frozen fruit) ───────────────────────────────────────
  "EG->GB|frozen_fruit": [
    COMMON_DOCS.phytosanitary(),
    doc("GSP_FORM_A", "GSP Form A", false, "Chamber of Commerce (Egypt)", "ORIGINAL", "English", "PRE_SHIPMENT", "UK GSP scheme for developing countries (post-Brexit)."),
    COMMON_DOCS.healthCert(),
    COMMON_DOCS.packingList("English"),
    COMMON_DOCS.commercialInvoice("English"),
    COMMON_DOCS.bl(),
  ],
  // ── Vietnam → EU (coffee) ───────────────────────────────────────────
  "VN->DE|coffee": [
    COMMON_DOCS.phytosanitary(),
    doc("EUR1", "EUR.1 Movement Certificate", false, "VCCI Chamber of Commerce", "ORIGINAL", "English", "PRE_SHIPMENT", "EVFTA preferential origin (since Aug 2020)."),
    COMMON_DOCS.healthCert(),
    COMMON_DOCS.packingList("English"),
    COMMON_DOCS.commercialInvoice("English"),
    COMMON_DOCS.bl(),
  ],
  // ── Vietnam → US (coffee) ───────────────────────────────────────────
  "VN->US|coffee": [
    doc("FDA_PRIOR_NOTICE", "FDA Prior Notice", true, "US FDA (PN System)", "ELECTRONIC", "English", "PRE_ARRIVAL", "Submit via FDA Prior Notice System Interface (PNSI) before arrival."),
    COMMON_DOCS.phytosanitary(),
    COMMON_DOCS.coo(),
    COMMON_DOCS.packingList("English"),
    COMMON_DOCS.commercialInvoice("English"),
    COMMON_DOCS.bl(),
  ],
  // ── China → EU (electronics) ────────────────────────────────────────
  "CN->DE|electronics": [
    doc("CE_MARKING", "CE Marking (Declaration of Conformity)", true, "Manufacturer (EU authorised rep)", "ORIGINAL", "English + German", "PRE_SHIPMENT", "EU Directives 2014/35/EU (LVD), 2014/30/EU (EMC), 2011/65/EU (RoHS)."),
    doc("DOC", "Declaration of Conformity (DoC)", true, "Manufacturer", "ORIGINAL", "English + destination language", "PRE_SHIPMENT", "EU authorised representative mandatory if manufacturer is non-EU."),
    doc("ROHS", "RoHS Compliance Declaration", true, "Manufacturer", "ORIGINAL", "English", "PRE_SHIPMENT", "EU 2011/65/EU + 2015/863 amendments."),
    COMMON_DOCS.commercialInvoice("English"),
    COMMON_DOCS.packingList("English"),
    COMMON_DOCS.bl(),
  ],
  // ── China → US (electronics) ────────────────────────────────────────
  "CN->US|electronics": [
    doc("FCC_SDOC", "FCC Supplier's Declaration of Conformity", true, "Manufacturer / Importer", "ORIGINAL", "English", "PRE_SHIPMENT", "FCC 47 CFR Part 15 for unintentional radiators."),
    doc("FDA_PRIOR_NOTICE", "FDA Prior Notice (if radiation-emitting)", false, "US FDA", "ELECTRONIC", "English", "PRE_ARRIVAL", "Required for laser products, microwaves etc. (21 CFR 1040)."),
    doc("UL_CERT", "UL Safety Certification", false, "UL LLC", "ORIGINAL", "English", "PRE_SHIPMENT", "Voluntary but expected by US retailers."),
    COMMON_DOCS.commercialInvoice("English"),
    COMMON_DOCS.packingList("English"),
    COMMON_DOCS.bl(),
  ],
  // ── Turkey → EU (textiles) ──────────────────────────────────────────
  "TR->DE|textiles": [
    doc("ATR1", "ATR.1 Movement Certificate", false, "Chamber of Commerce (Turkey)", "ORIGINAL", "English", "PRE_SHIPMENT", "EU-Turkey Customs Union (preferential for most industrial goods)."),
    doc("EUR1", "EUR.1 Movement Certificate", false, "Chamber of Commerce (Turkey)", "ORIGINAL", "English", "PRE_SHIPMENT", "Fallback for products outside Customs Union scope."),
    doc("CERTIFICATE_OF_ORIGIN", "Certificate of Origin (non-preferential)", true, "Chamber of Commerce (Turkey)", "ORIGINAL", "English", "PRE_SHIPMENT", "Required for textile quotas / surveillance."),
    COMMON_DOCS.packingList("English"),
    COMMON_DOCS.commercialInvoice("English"),
    COMMON_DOCS.bl(),
  ],
  // ── Turkey → UAE (textiles) ─────────────────────────────────────────
  "TR->AE|textiles": [
    COMMON_DOCS.coo(),
    COMMON_DOCS.packingList("Arabic + English"),
    COMMON_DOCS.commercialInvoice("English"),
    COMMON_DOCS.bl(),
  ],
  // ── Brazil → US (coffee) ────────────────────────────────────────────
  "BR->US|coffee": [
    doc("FDA_PRIOR_NOTICE", "FDA Prior Notice", true, "US FDA", "ELECTRONIC", "English", "PRE_ARRIVAL", "Submit via FDA PNSI before arrival."),
    COMMON_DOCS.phytosanitary(),
    COMMON_DOCS.coo(),
    COMMON_DOCS.packingList("English"),
    COMMON_DOCS.commercialInvoice("English"),
    COMMON_DOCS.bl(),
  ],
  // ── India → UAE (textiles) ──────────────────────────────────────────
  "IN->AE|textiles": [
    doc("PHYTOSANITARY", "Phytosanitary Certificate (if natural fibre)", false, "India NPPO", "ORIGINAL", "English", "PRE_SHIPMENT", "Only for raw cotton / jute / linen shipments."),
    COMMON_DOCS.coo(),
    doc("SASO_COC", "SASO Certificate of Conformity (if destined via KSA)", false, "SASO-approved CB", "ELECTRONIC", "Arabic + English", "PRE_SHIPMENT", "Required only if transiting / re-exporting via Saudi Arabia."),
    COMMON_DOCS.packingList("Arabic + English"),
    COMMON_DOCS.commercialInvoice("English"),
    COMMON_DOCS.bl(),
  ],
  // ── Thailand → US (food) ────────────────────────────────────────────
  "TH->US|food": [
    doc("FDA_PRIOR_NOTICE", "FDA Prior Notice", true, "US FDA", "ELECTRONIC", "English", "PRE_ARRIVAL", "Submit via FDA PNSI."),
    COMMON_DOCS.phytosanitary(),
    doc("FSMA", "FSMA Facility Registration + FSV", true, "US FDA", "ELECTRONIC", "English", "PRE_SHIPMENT", "Food Safety Modernization Act — foreign supplier verification (FSVP)."),
    COMMON_DOCS.coo(),
    COMMON_DOCS.packingList("English"),
    COMMON_DOCS.commercialInvoice("English"),
    COMMON_DOCS.bl(),
  ],
  // ── South Africa → EU (food / fruit) ────────────────────────────────
  "ZA->DE|food": [
    COMMON_DOCS.phytosanitary(),
    doc("EUR1", "EUR.1 Movement Certificate", false, "Chamber of Commerce (SA)", "ORIGINAL", "English", "PRE_SHIPMENT", "SADC-EU Economic Partnership Agreement (EPA)."),
    COMMON_DOCS.healthCert(),
    COMMON_DOCS.packingList("English"),
    COMMON_DOCS.commercialInvoice("English"),
    COMMON_DOCS.bl(),
  ],
  // ── Kenya → EU (food / flowers) ─────────────────────────────────────
  "KE->DE|food": [
    COMMON_DOCS.phytosanitary(),
    doc("EUR1", "EUR.1 Movement Certificate", false, "Kenya Chamber", "ORIGINAL", "English", "PRE_SHIPMENT", "EU-Kenya EPA (ratified 2024)."),
    COMMON_DOCS.healthCert(),
    doc("MRL_REPORT", "Pesticide Residue (MRL) Test Report", true, "ISO 17025 accredited lab", "ORIGINAL", "English", "PRE_SHIPMENT", "EU MRL Regulation (EC) 396/2005 compliance."),
    COMMON_DOCS.packingList("English"),
    COMMON_DOCS.commercialInvoice("English"),
    COMMON_DOCS.bl(),
  ],
  // ── Morocco → EU (food / produce) ───────────────────────────────────
  "MA->DE|food": [
    COMMON_DOCS.phytosanitary(),
    doc("EUR1", "EUR.1 Movement Certificate", false, "Moroccan Chamber", "ORIGINAL", "English", "PRE_SHIPMENT", "EU-Morocco Association Agreement."),
    COMMON_DOCS.healthCert(),
    COMMON_DOCS.packingList("English"),
    COMMON_DOCS.commercialInvoice("English"),
    COMMON_DOCS.bl(),
  ],
  // ── Argentina → China (food / soy) ──────────────────────────────────
  "AR->CN|food": [
    COMMON_DOCS.phytosanitary(),
    doc("GACC_REGISTRATION", "GACC Exporter Registration", true, "GACC China (via SENASA)", "ELECTRONIC", "Chinese + English", "PRE_SHIPMENT", "Exporter must be registered with GACC before shipment."),
    COMMON_DOCS.healthCert(),
    COMMON_DOCS.coo(),
    COMMON_DOCS.packingList("Chinese + English"),
    COMMON_DOCS.commercialInvoice("Chinese + English"),
    COMMON_DOCS.bl(),
  ],
  // ── Australia → China (food / dairy / meat) ─────────────────────────
  "AU->CN|food": [
    COMMON_DOCS.phytosanitary(),
    doc("GACC_REGISTRATION", "GACC Establishment Registration", true, "GACC China (via DAFF)", "ELECTRONIC", "Chinese + English", "PRE_SHIPMENT", "Establishment must be GACC-listed (ChAFTA)."),
    COMMON_DOCS.healthCert(),
    doc("FTA_CO", "ChAFTA Certificate of Origin", false, "Australian Chamber", "ORIGINAL", "English", "PRE_SHIPMENT", "China-Australia FTA preferential rate."),
    COMMON_DOCS.packingList("Chinese + English"),
    COMMON_DOCS.commercialInvoice("Chinese + English"),
    COMMON_DOCS.bl(),
  ],
};

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Returns the product- and corridor-specific document set required for the
 * given (HS code, origin, destination) triple.
 *
 * Strategy:
 *   1. Try exact family lane match: `${origin}->${dest}|${family}`
 *   2. Try generic lane match:       `${origin}->${dest}|*`
 *   3. Fall back to GRiRE country-required-documents (DB-backed)
 *   4. If nothing found, return COMMON_DOCS (invoice + packing list + B/L)
 */
export async function getProductCorridorDocuments(
  hsCode: string,
  originCountry: string,
  destinationCountry: string,
): Promise<CorridorDocument[]> {
  try {
    const origin = (originCountry ?? "").toUpperCase().trim();
    const dest = (destinationCountry ?? "").toUpperCase().trim();
    const hs = (hsCode ?? "").trim();
    if (!origin || !dest || !hs) {
      logger.warn("product-corridor-matrix: missing params", { origin, dest, hs });
      return [COMMON_DOCS.commercialInvoice(), COMMON_DOCS.packingList(), COMMON_DOCS.bl()];
    }

    const family = classifyHsFamily(hs);
    const familyKey = family ? `${origin}->${dest}|${family.family}` : null;
    const genericKey = `${origin}->${dest}|*`;

    // 1. Exact family lane
    if (familyKey && LANE_MATRIX[familyKey]) {
      logger.info("product-corridor-matrix: family lane hit", { key: familyKey, family: family!.label });
      return LANE_MATRIX[familyKey];
    }
    // 2. Generic lane
    if (LANE_MATRIX[genericKey]) {
      logger.info("product-corridor-matrix: generic lane hit", { key: genericKey });
      return LANE_MATRIX[genericKey];
    }

    // 3. GRiRE country-required-documents (DB)
    try {
      const countryDocs = await getRequiredDocuments(dest, hs);
      if (countryDocs && countryDocs.length > 0) {
        logger.info("product-corridor-matrix: GRiRE fallback hit", { dest, count: countryDocs.length });
        const mapped: CorridorDocument[] = countryDocs.map((d) =>
          doc(
            d.documentType,
            d.documentType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
            d.required,
            d.issuingAuthority ?? "See regulation",
            d.formatRequirement?.toUpperCase()?.includes("ELECTRONIC") ? "ELECTRONIC" : "ORIGINAL_OR_ELECTRONIC",
            d.languageRequirement ?? "English",
            (d.triggerEvent as TriggerEvent) ?? "PRE_SHIPMENT",
            d.regulationReference ?? d.mandatoryFor ?? "",
          ),
        );
        // Always append the universal transport docs
        mapped.push(COMMON_DOCS.commercialInvoice(), COMMON_DOCS.packingList(), COMMON_DOCS.bl());
        return mapped;
      }
    } catch (dbErr: any) {
      logger.warn("product-corridor-matrix: GRiRE fallback failed", { error: dbErr?.message });
    }

    // 4. Universal baseline
    logger.info("product-corridor-matrix: baseline fallback", { origin, dest, hs });
    return [COMMON_DOCS.commercialInvoice(), COMMON_DOCS.packingList(), COMMON_DOCS.bl()];
  } catch (err: any) {
    logger.error("product-corridor-matrix: caught exception", { error: err?.message });
    return [COMMON_DOCS.commercialInvoice(), COMMON_DOCS.packingList(), COMMON_DOCS.bl()];
  }
}

/** Returns the full matrix result (with metadata) for API consumers. */
export async function getProductCorridorMatrixResult(
  hsCode: string,
  originCountry: string,
  destinationCountry: string,
): Promise<CorridorMatrixResult> {
  const documents = await getProductCorridorDocuments(hsCode, originCountry, destinationCountry);
  const family = classifyHsFamily(hsCode);
  return {
    hsCode: hsCode.trim(),
    originCountry: originCountry.toUpperCase().trim(),
    destinationCountry: destinationCountry.toUpperCase().trim(),
    lane: `${originCountry.toUpperCase()}→${destinationCountry.toUpperCase()}${family ? ` (${family.label})` : ""}`,
    documents,
    source: family && LANE_MATRIX[`${originCountry.toUpperCase()}->${destinationCountry.toUpperCase()}|${family.family}`]
      ? "SGTX_LANE_MATRIX"
      : "GRiRE_FALLBACK",
    generatedAt: new Date().toISOString(),
  };
}

/** Lists the matrix's hardcoded lanes (for diagnostics / UI). */
export function listMatrixLanes(): Array<{ lane: string; family: string; documentCount: number }> {
  const out: Array<{ lane: string; family: string; documentCount: number }> = [];
  for (const [key, docs] of Object.entries(LANE_MATRIX)) {
    const [lane, family] = key.split("|");
    out.push({ lane, family: family ?? "*", documentCount: docs.length });
  }
  return out.sort((a, b) => a.lane.localeCompare(b.lane));
}

// SGTX Part 4.5 — Documentation Requirements rules engine
// One source of truth: every document is defined once with its triggers.
// RIA pre-selects mandatory documents based on commodity, origin, destination, incoterm, transport mode.

export type DocTrigger = "SHIPMENT" | "SETTLEMENT" | "CUSTOMS" | "FINANCING";

export interface DocumentRequirementSpec {
  docType: string;
  docName: string;
  trigger: DocTrigger;
  mandatory: boolean;
  issuingAuthority?: string;
  format?: string;
  notes?: string;
}

// Agricultural HS code prefixes (chapters 01-24, mostly food/perishables)
const AGRI_HS_PREFIXES = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24"];
const FOOD_HS_PREFIXES = ["02", "03", "04", "07", "08", "09", "11", "15", "16", "17", "18", "19", "20", "21", "22", "23"];
const TEXTILE_HS_PREFIXES = ["50", "51", "52", "53", "54", "55", "56", "57", "58", "59", "60", "61", "62", "63"];

const hsStartsWith = (hs: string | undefined | null, prefixes: string[]) => {
  if (!hs) return false;
  const clean = hs.replace(/[^0-9]/g, "").slice(0, 2);
  return prefixes.includes(clean);
};

export interface DocReqInput {
  hsCode?: string | null;
  originCountry?: string | null;
  destCountry?: string | null;
  incoterm?: string | null;
  transportMode?: string | null;
  coldChain?: boolean | null;
  lcSelected?: boolean;
  financingRequested?: boolean;
  preferenceAgreement?: boolean;
}

export function resolveDocumentRequirements(input: DocReqInput): DocumentRequirementSpec[] {
  const docs: DocumentRequirementSpec[] = [];
  const {
    hsCode, incoterm, transportMode, coldChain,
    lcSelected = false, financingRequested = false, preferenceAgreement = false,
  } = input;

  const isAgricultural = hsStartsWith(hsCode, AGRI_HS_PREFIXES);
  const isFood = hsStartsWith(hsCode, FOOD_HS_PREFIXES);
  const isOrganic = false;

  // Always-mandatory documents
  docs.push({ docType: "COMMERCIAL_INVOICE", docName: "Commercial Invoice", trigger: "SETTLEMENT", mandatory: true, issuingAuthority: "SELLER", format: "ELECTRONIC_ORIGINAL", notes: "Required for payment, customs, and financing." });
  docs.push({ docType: "PACKING_LIST", docName: "Packing List", trigger: "CUSTOMS", mandatory: true, issuingAuthority: "SELLER", format: "ELECTRONIC", notes: "Detailed per-container, per-pallet breakdown." });
  docs.push({ docType: "BILL_LADING", docName: transportMode === "AIR" ? "Air Waybill (AWB)" : "Bill of Lading (B/L)", trigger: "SHIPMENT", mandatory: true, issuingAuthority: "SHIPPING_LINE", format: "ORIGINAL", notes: transportMode === "AIR" ? "MAWB/HAWB issued by carrier" : "Original B/L required for LC settlement" });

  const cooMandatory = (!!incoterm && ["CIF", "CIP", "DDP", "DAP"].includes(incoterm)) || lcSelected || preferenceAgreement;
  docs.push({
    docType: "COO",
    docName: preferenceAgreement ? "Certificate of Origin (EUR.1)" : "Certificate of Origin",
    trigger: "CUSTOMS",
    mandatory: cooMandatory,
    issuingAuthority: "CHAMBER_OF_COMMERCE",
    format: "ORIGINAL",
    notes: preferenceAgreement ? "EUR.1 movement certificate for EU preference" : "Issued by Chamber of Commerce; legalised if required by destination",
  });

  if (isAgricultural) {
    docs.push({ docType: "PHYTO", docName: "Phytosanitary Certificate", trigger: "SHIPMENT", mandatory: true, issuingAuthority: "CUSTOMS", format: "ORIGINAL", notes: "Issued by origin plant-protection authority; mandatory for plants and plant products" });
  }
  if (isFood) {
    docs.push({ docType: "HEALTH_CERT", docName: "Health Certificate", trigger: "SHIPMENT", mandatory: true, issuingAuthority: "CUSTOMS", format: "ORIGINAL", notes: "Issued by origin food safety authority" });
  }

  docs.push({ docType: "FUMIGATION", docName: "Fumigation / ISPM-15 Certificate", trigger: "SHIPMENT", mandatory: false, issuingAuthority: "THIRD_PARTY", format: "ELECTRONIC_ORIGINAL", notes: "Required when wooden pallets/packaging used (ISPM-15 heat treatment or methyl bromide)" });

  const insuranceMandatory = !!incoterm && ["CIF", "CIP"].includes(incoterm);
  docs.push({ docType: "INSURANCE_CERT", docName: "Insurance Certificate", trigger: "SETTLEMENT", mandatory: insuranceMandatory, issuingAuthority: "SELLER", format: "ORIGINAL", notes: insuranceMandatory ? `Mandatory under ${incoterm} — seller arranges and provides certificate` : "Required only if insurance is mandatory or elected" });

  docs.push({ docType: "INSPECTION_CERT", docName: "Inspection Certificate", trigger: "SETTLEMENT", mandatory: lcSelected, issuingAuthority: "THIRD_PARTY", format: "ELECTRONIC_ORIGINAL", notes: "SGS/Bureau Veritas or buyer-nominated inspector; mandatory for LC" });

  if (isAgricultural || isFood) {
    docs.push({ docType: "LAB_REPORT", docName: "Laboratory Test Report (MRL/Residues)", trigger: "CUSTOMS", mandatory: false, issuingAuthority: "THIRD_PARTY", format: "ELECTRONIC", notes: "Required by destination MRL regulations (RIA-detected)" });
  }

  docs.push({ docType: "EXPORT_LICENSE", docName: "Export Licence", trigger: "CUSTOMS", mandatory: false, issuingAuthority: "CUSTOMS", format: "ORIGINAL", notes: "Required for restricted / dual-use / quota commodities" });
  docs.push({ docType: "IMPORT_LICENSE", docName: "Import Licence", trigger: "CUSTOMS", mandatory: false, issuingAuthority: "CUSTOMS", format: "ORIGINAL", notes: "Required by destination for restricted / quota commodities" });

  if (coldChain) {
    docs.push({ docType: "COLD_TREATMENT", docName: "Cold Treatment Certificate", trigger: "SHIPMENT", mandatory: true, issuingAuthority: "THIRD_PARTY", format: "ELECTRONIC_ORIGINAL", notes: "Required for cold-treatment commodities (e.g., fresh citrus to certain markets)" });
    docs.push({ docType: "COLD_CHAIN_LOG", docName: "Cold Chain Temperature Log", trigger: "SHIPMENT", mandatory: true, issuingAuthority: "SHIPPING_LINE", format: "ELECTRONIC", notes: "Continuous reefer temperature recorder from loading to discharge" });
  }

  if (preferenceAgreement) {
    docs.push({ docType: "EUR1", docName: "EUR.1 Movement Certificate", trigger: "CUSTOMS", mandatory: true, issuingAuthority: "CHAMBER_OF_COMMERCE", format: "ORIGINAL", notes: "EU preferential origin certificate" });
  }

  if (isOrganic) {
    docs.push({ docType: "GOTS", docName: "GOTS / Organic Certificate", trigger: "SETTLEMENT", mandatory: false, issuingAuthority: "THIRD_PARTY", format: "ELECTRONIC_ORIGINAL" });
  }
  if (isFood && (input.destCountry === "AE" || input.destCountry === "SA" || input.destCountry === "EG")) {
    docs.push({ docType: "HALAL", docName: "Halal Certificate", trigger: "SETTLEMENT", mandatory: true, issuingAuthority: "THIRD_PARTY", format: "ORIGINAL", notes: `Mandatory for food exports to ${input.destCountry}` });
  }

  if (lcSelected) {
    docs.push({ docType: "LC_APPLICATION", docName: "LC Application", trigger: "FINANCING", mandatory: true, issuingAuthority: "BUYER", format: "ELECTRONIC", notes: "Submitted to issuing bank" });
    docs.push({ docType: "LC_CONFIRMATION", docName: "LC Confirmation", trigger: "FINANCING", mandatory: false, issuingAuthority: "BUYER", format: "ELECTRONIC", notes: "Issued by confirming bank in seller's country" });
  }

  if (financingRequested) {
    docs.push({ docType: "FINANCING_AGREEMENT", docName: "Financing Agreement", trigger: "FINANCING", mandatory: true, issuingAuthority: "SELLER", format: "ORIGINAL", notes: "Between borrower and financier" });
    docs.push({ docType: "COLLATERAL", docName: "Collateral Documentation", trigger: "FINANCING", mandatory: false, issuingAuthority: "SELLER", format: "ORIGINAL", notes: "Goods / warehouse receipt / receivables" });
  }

  return docs;
}

export const TRIGGER_TYPES: DocTrigger[] = ["SHIPMENT", "SETTLEMENT", "CUSTOMS", "FINANCING"];

export function groupByTrigger(docs: DocumentRequirementSpec[]): Record<DocTrigger, DocumentRequirementSpec[]> {
  return {
    SHIPMENT: docs.filter(d => d.trigger === "SHIPMENT"),
    SETTLEMENT: docs.filter(d => d.trigger === "SETTLEMENT"),
    CUSTOMS: docs.filter(d => d.trigger === "CUSTOMS"),
    FINANCING: docs.filter(d => d.trigger === "FINANCING"),
  };
}

// Reference for TEXTILE_HS_PREFIXES usage (kept for future expansion)
export const __TEXTILE_HS = TEXTILE_HS_PREFIXES;

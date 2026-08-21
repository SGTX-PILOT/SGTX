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

// Electrical / electronic machinery HS chapters (84 = nuclear reactors/machinery,
// 85 = electrical machinery and equipment). Used to gate CCC / BIS certifications.
const ELECTRONICS_HS_PREFIXES = ["84", "85"];

// EU member-state ISO-3166-1 alpha-2 codes (used to detect EU origin for the
// EX-A export declaration requirement). Excludes non-EU EFTA states.
const EU_MEMBER_COUNTRY_CODES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE",
]);

const isEuCountry = (code: string | null | undefined): boolean =>
  !!code && EU_MEMBER_COUNTRY_CODES.has(code.toUpperCase());

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
  const originCountry = (input.originCountry || "").toUpperCase();
  const destCountry = (input.destCountry || "").toUpperCase();

  const isAgricultural = hsStartsWith(hsCode, AGRI_HS_PREFIXES);
  const isFood = hsStartsWith(hsCode, FOOD_HS_PREFIXES);
  const isElectronics = hsStartsWith(hsCode, ELECTRONICS_HS_PREFIXES);
  const isOrganic = false;

  // Always-mandatory documents
  docs.push({ docType: "COMMERCIAL_INVOICE", docName: "Commercial Invoice", trigger: "SETTLEMENT", mandatory: true, issuingAuthority: "SELLER", format: "ELECTRONIC_ORIGINAL", notes: "Required for payment, customs, and financing." });
  docs.push({ docType: "PACKING_LIST", docName: "Packing List", trigger: "CUSTOMS", mandatory: true, issuingAuthority: "SELLER", format: "ELECTRONIC", notes: "Detailed per-container, per-pallet breakdown." });

  // Transport document — mode-specific (Fix 2 — Task FIX-THC-DOCS-SURCHARGES).
  // Previously the doc NAME was conditionally tweaked for AIR but the doc TYPE
  // was hard-coded to BILL_LADING for every mode, which made AWB / CMR / CIM /
  // RoRo B/L indistinguishable downstream. Now both fields branch together.
  const modeUpper = (transportMode || "").toUpperCase();
  const transportDoc: DocumentRequirementSpec =
    modeUpper === "AIR"
      ? {
          docType: "AIR_WAYBILL",
          docName: "Air Waybill (AWB)",
          trigger: "SHIPMENT",
          mandatory: true,
          issuingAuthority: "AIRLINE",
          format: "ELECTRONIC_ORIGINAL",
          notes: "MAWB/HAWB issued by carrier",
        }
      : modeUpper === "TRUCK" || modeUpper === "ROAD"
        ? {
            docType: "CMR",
            docName: "CMR Consignment Note",
            trigger: "SHIPMENT",
            mandatory: true,
            issuingAuthority: "CARRIER",
            format: "ORIGINAL",
            notes: "CMR consignment note per 1956 CMR Convention (road transport)",
          }
        : modeUpper === "RAIL"
          ? {
              docType: "CIM_NOTE",
              docName: "CIM Consignment Note",
              trigger: "SHIPMENT",
              mandatory: true,
              issuingAuthority: "RAIL_OPERATOR",
              format: "ORIGINAL",
              notes: "CIM consignment note per COTIF/CIM Convention (rail transport)",
            }
          : modeUpper === "RO_RO" || modeUpper === "RORO"
            ? {
                docType: "RORO_BOL",
                docName: "RoRo Bill of Lading / Cargo Ticket",
                trigger: "SHIPMENT",
                mandatory: true,
                issuingAuthority: "SHIPPING_LINE",
                format: "ORIGINAL",
                notes: "RoRo bill of lading or cargo ticket issued by the roll-on/roll-off carrier",
              }
            : {
                docType: "BILL_LADING",
                docName: "Bill of Lading (B/L)",
                trigger: "SHIPMENT",
                mandatory: true,
                issuingAuthority: "SHIPPING_LINE",
                format: "ORIGINAL",
                notes: "Original B/L required for LC settlement",
              };
  docs.push(transportDoc);

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
  if (isFood && (destCountry === "AE" || destCountry === "SA" || destCountry === "EG")) {
    docs.push({ docType: "HALAL", docName: "Halal Certificate", trigger: "SETTLEMENT", mandatory: true, issuingAuthority: "THIRD_PARTY", format: "ORIGINAL", notes: `Mandatory for food exports to ${destCountry}` });
  }

  // ============================================================
  // Loading / Origin country documents (Task FIX-CONTRACTS-COUNTRY-DOCS)
  // ============================================================
  // China — Export Licence (mandatory for all outbound shipments)
  if (originCountry === "CN") {
    docs.push({
      docType: "EXPORT_LICENSE_CN",
      docName: "China Export Licence",
      trigger: "CUSTOMS",
      mandatory: true,
      issuingAuthority: "CUSTOMS",
      format: "ORIGINAL",
      notes: "Mandatory Chinese export licence issued by MOFCOM (Ministry of Commerce). Required for all outbound shipments from the PRC.",
    });
  }

  // Egypt — GOEIC Exporter Registration (mandatory for exports)
  if (originCountry === "EG") {
    docs.push({
      docType: "GOEIC_REGISTRATION",
      docName: "GOEIC Export Registration",
      trigger: "CUSTOMS",
      mandatory: true,
      issuingAuthority: "CUSTOMS",
      format: "ELECTRONIC",
      notes: "General Organisation for Export and Import Control (GOEIC) exporter registration. Mandatory for Egyptian exporters before customs clearance.",
    });
  }

  // USA — AES (Automated Export System) Filing with the Census Bureau
  if (originCountry === "US") {
    docs.push({
      docType: "AES_FILING",
      docName: "AES Export Filing (Census Bureau)",
      trigger: "CUSTOMS",
      mandatory: true,
      issuingAuthority: "CUSTOMS",
      format: "ELECTRONIC",
      notes: "Electronic Export Information (EEI) filed via the Automated Export System (AES) with the US Census Bureau. ITAR/EAR thresholds apply.",
    });
  }

  // EU member state — EX-A export declaration (customs office of exit)
  if (isEuCountry(originCountry)) {
    docs.push({
      docType: "EXPORT_DECLARATION_EU",
      docName: "EU Export Declaration (EX-A)",
      trigger: "CUSTOMS",
      mandatory: true,
      issuingAuthority: "CUSTOMS",
      format: "ELECTRONIC",
      notes: `EX-A export declaration filed with the customs authority of ${originCountry} (member state of exit) under the Union Customs Code (Reg. 952/2013).`,
    });
  }

  // India — DGFT Export Licence (conditional: only if commodity is restricted)
  if (originCountry === "IN") {
    docs.push({
      docType: "DGFT_LICENSE",
      docName: "DGFT Export Licence (if restricted)",
      trigger: "CUSTOMS",
      mandatory: false,
      issuingAuthority: "CUSTOMS",
      format: "ORIGINAL",
      notes: "Directorate General of Foreign Trade (DGFT) export licence. Required only when the commodity appears on the ITC(HS) restricted / SCOMET list.",
    });
  }

  // ============================================================
  // Destination country documents (Task FIX-CONTRACTS-COUNTRY-DOCS)
  // ============================================================
  // Brazil — Siscomex Import Licence (conditional for certain HS codes)
  if (destCountry === "BR") {
    docs.push({
      docType: "IMPORT_LICENSE_BR",
      docName: "Brazil Import Licence (Siscomex)",
      trigger: "CUSTOMS",
      mandatory: false,
      issuingAuthority: "CUSTOMS",
      format: "ELECTRONIC",
      notes: "Import licence registered in Siscomex (Sistema Integrado de Comércio Exterior). Mandatory for certain HS codes (used goods, sensitive categories, anexos da Portaria SECEX); otherwise only a Siscomex import declaration is required.",
    });
  }

  // China — CCC (China Compulsory Certificate), mandatory for electronics
  if (destCountry === "CN" && isElectronics) {
    docs.push({
      docType: "CCC_CERTIFICATE",
      docName: "China Compulsory Certificate (CCC)",
      trigger: "CUSTOMS",
      mandatory: true,
      issuingAuthority: "THIRD_PARTY",
      format: "ORIGINAL",
      notes: "Mandatory CCC mark for electrical/electronic goods (HS chapters 84/85) entering the PRC. Issued by a CNCA-accredited certification body.",
    });
  }

  // Saudi Arabia — SASO Certificate of Conformity (mandatory for most goods)
  if (destCountry === "SA") {
    docs.push({
      docType: "SASO_CERTIFICATE",
      docName: "SASO Certificate of Conformity",
      trigger: "CUSTOMS",
      mandatory: true,
      issuingAuthority: "THIRD_PARTY",
      format: "ORIGINAL",
      notes: "Certificate of Conformity (CoC) required by the Saudi Standards, Metrology and Quality Organization (SASO) under the SALEEM / SABER platform for clearance of most consumer and industrial goods.",
    });
  }

  // USA — FDA Prior Notice (mandatory for food shipments)
  if (destCountry === "US" && isFood) {
    docs.push({
      docType: "FDA_PRIOR_NOTICE",
      docName: "FDA Prior Notice",
      trigger: "CUSTOMS",
      mandatory: true,
      issuingAuthority: "CUSTOMS",
      format: "ELECTRONIC",
      notes: "Prior Notice of Imported Food must be filed with the US FDA (Bioterrorism Act of 2002, FSMA) before arrival of the shipment at the US port of entry.",
    });
  }

  // India — BIS Certification (conditional for electronics)
  if (destCountry === "IN" && isElectronics) {
    docs.push({
      docType: "BIS_CERTIFICATE",
      docName: "BIS Certification (if applicable)",
      trigger: "CUSTOMS",
      mandatory: false,
      issuingAuthority: "THIRD_PARTY",
      format: "ORIGINAL",
      notes: "Bureau of Indian Standards (BIS) certification. Required for a defined list of electronic / electrical goods under the BIS Compulsory Registration Scheme (CRS).",
    });
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

// Re-exports for downstream consumers (Task FIX-CONTRACTS-COUNTRY-DOCS)
export const __ELECTRONICS_HS = ELECTRONICS_HS_PREFIXES;
export const __EU_MEMBER_COUNTRY_CODES = EU_MEMBER_COUNTRY_CODES;
export { isEuCountry };

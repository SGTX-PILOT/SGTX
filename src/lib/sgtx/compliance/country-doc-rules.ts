// SGTX Country-Specific Document Rules
// Comprehensive document requirements per country for trade lanes.
// Covers: EG, EU, US, CN, SA, AE, JP, AU, NZ, TR, BR, IN, KE, GH, MA

export interface CountryDocRule {
  country: string;
  requiredDocs: { docType: string; name: string; mandatory: boolean; authority: string; notes?: string }[];
  prohibitedItems: string[];
  specialRequirements: string[];
}

export function getCountryDocRules(country: string): CountryDocRule | null {
  const c = country.toUpperCase();
  const rules: Record<string, CountryDocRule> = {
    EG: {
      country: "EG",
      requiredDocs: [
        { docType: "COMMERCIAL_INVOICE", name: "Commercial Invoice (Arabic or bilingual)", mandatory: true, authority: "Egyptian Tax Authority" },
        { docType: "PACKING_LIST", name: "Packing List", mandatory: true, authority: "Exporter" },
        { docType: "COO", name: "Certificate of Origin", mandatory: true, authority: "Egyptian Chamber of Commerce" },
        { docType: "BL_AWB", name: "Bill of Lading / Air Waybill", mandatory: true, authority: "Carrier" },
        { docType: "ACID", name: "ACID (Advance Cargo Information Declaration)", mandatory: true, authority: "Nafeza", notes: "Mandatory before loading since 2021" },
        { docType: "GOEIC", name: "GOEIC Registration", mandatory: true, authority: "GOEIC", notes: "Required for traders" },
        { docType: "PHYTOSANITARY", name: "Phytosanitary Certificate", mandatory: false, authority: "PPA Egypt", notes: "Required for plants/plant products" },
        { docType: "E_INVOICE", name: "ETA e-Invoice", mandatory: true, authority: "Egyptian Tax Authority", notes: "Mandatory since 2023" },
      ],
      prohibitedItems: ["Alcohol (restricted)", "Pork products (restricted)", "Weapons", "Drugs"],
      specialRequirements: ["ACID must be obtained before vessel loading", "FX repatriation within 180 days (CBE Law 194/2020)"],
    },
    DE: EU_DOC_RULES("DE"),
    FR: EU_DOC_RULES("FR"),
    NL: EU_DOC_RULES("NL"),
    IT: EU_DOC_RULES("IT"),
    US: {
      country: "US",
      requiredDocs: [
        { docType: "COMMERCIAL_INVOICE", name: "Commercial Invoice", mandatory: true, authority: "Exporter" },
        { docType: "PACKING_LIST", name: "Packing List", mandatory: true, authority: "Exporter" },
        { docType: "COO", name: "Certificate of Origin (USCBP Form 450)", mandatory: false, authority: "Chamber of Commerce" },
        { docType: "BL_AWB", name: "Bill of Lading / Air Waybill", mandatory: true, authority: "Carrier" },
        { docType: "ISF", name: "ISF 10+2 (Importer Security Filing)", mandatory: true, authority: "CBP", notes: "24h before vessel loading (SEA)" },
        { docType: "FDA_PRIOR_NOTICE", name: "FDA Prior Notice", mandatory: false, authority: "FDA", notes: "Required for food" },
        { docType: "ACE_ENTRY", name: "ACE Entry Summary", mandatory: true, authority: "CBP" },
        { docType: "QIZ_CERT", name: "QIZ Certification", mandatory: false, authority: "US-Israel binational", notes: "For Egypt→US QIZ goods" },
      ],
      prohibitedItems: ["Cuban-origin goods", "Iran-origin goods", "Certain Russian goods", "Counterfeit items"],
      specialRequirements: ["ISF 10+2 due 24h before vessel loading", "FDA Prior Notice for food imports", "BIS license for dual-use goods"],
    },
    CN: {
      country: "CN",
      requiredDocs: [
        { docType: "COMMERCIAL_INVOICE", name: "Commercial Invoice", mandatory: true, authority: "Exporter" },
        { docType: "PACKING_LIST", name: "Packing List", mandatory: true, authority: "Exporter" },
        { docType: "COO", name: "Certificate of Origin", mandatory: true, authority: "CCPIT" },
        { docType: "BL_AWB", name: "Bill of Lading / Air Waybill", mandatory: true, authority: "Carrier" },
        { docType: "GACC_DECLARATION", name: "China Single Window Declaration", mandatory: true, authority: "GACC" },
        { docType: "CCC", name: "CCC Certification", mandatory: false, authority: "CNCA", notes: "Required for electronics/machinery" },
        { docType: "PHYTOSANITARY", name: "Phytosanitary e-Cert", mandatory: false, authority: "GACC", notes: "Required for agri goods" },
      ],
      prohibitedItems: ["Certain publications", "Gambling equipment", "Certain chemicals"],
      specialRequirements: ["CCC mandatory for HS 84-85, 87, 94", "China Single Window filing before arrival"],
    },
    SA: GCC_DOC_RULES("SA"),
    AE: GCC_DOC_RULES("AE"),
    JP: {
      country: "JP",
      requiredDocs: [
        { docType: "COMMERCIAL_INVOICE", name: "Commercial Invoice", mandatory: true, authority: "Exporter" },
        { docType: "PACKING_LIST", name: "Packing List", mandatory: true, authority: "Exporter" },
        { docType: "COO", name: "Certificate of Origin", mandatory: false, authority: "Chamber of Commerce" },
        { docType: "BL_AWB", name: "Bill of Lading / Air Waybill", mandatory: true, authority: "Carrier" },
        { docType: "JIC_DECLARATION", name: "NACCS Declaration", mandatory: true, authority: "Japan Customs (NACCS)" },
      ],
      prohibitedItems: ["Certain agricultural products", "Counterfeit goods", "Weapons"],
      specialRequirements: ["AFAX for air freight", "JIS certification for some electronics"],
    },
    AU: {
      country: "AU",
      requiredDocs: [
        { docType: "COMMERCIAL_INVOICE", name: "Commercial Invoice", mandatory: true, authority: "Exporter" },
        { docType: "COO", name: "Certificate of Origin", mandatory: false, authority: "Chamber of Commerce" },
        { docType: "BL_AWB", name: "Bill of Lading", mandatory: true, authority: "Carrier" },
        { docType: "AEP", name: "AEP (Advanced Export Information)", mandatory: true, authority: "Australian Border Force" },
        { docType: "PHYTOSANITARY", name: "Phytosanitary Certificate", mandatory: false, authority: "DAFF", notes: "Strict biosecurity" },
      ],
      prohibitedItems: ["Biosecurity risk materials", "Certain foods without treatment", "Used packaging"],
      specialRequirements: ["Strict biosecurity — DAFF inspection mandatory for agri", "AEP required before arrival"],
    },
    TR: {
      country: "TR",
      requiredDocs: [
        { docType: "COMMERCIAL_INVOICE", name: "Commercial Invoice (e-Archive)", mandatory: true, authority: "Turkish Revenue Administration" },
        { docType: "COO", name: "ATR Movement Certificate (EU-Turkey)", mandatory: false, authority: "Chamber of Commerce", notes: "For EU-Turkey FTA" },
        { docType: "BL_AWB", name: "Bill of Lading", mandatory: true, authority: "Carrier" },
        { docType: "TEKSIG", name: "TekSig Declaration", mandatory: true, authority: "Turkish Customs" },
      ],
      prohibitedItems: ["Certain Syrian goods", "Counterfeit"],
      specialRequirements: ["e-Archive invoice mandatory", "ATR for EU preference"],
    },
    BR: {
      country: "BR",
      requiredDocs: [
        { docType: "COMMERCIAL_INVOICE", name: "Nota Fiscal (electronic)", mandatory: true, authority: "SEFAZ" },
        { docType: "COO", name: "Certificate of Origin", mandatory: false, authority: "Chamber of Commerce" },
        { docType: "BL_AWB", name: "Bill of Lading", mandatory: true, authority: "Carrier" },
        { docType: "SISCOMEX", name: "Siscomex Registration", mandatory: true, authority: "Receita Federal" },
        { docType: "INMETRO", name: "INMETRO Certification", mandatory: false, authority: "INMETRO", notes: "Required for electronics" },
      ],
      prohibitedItems: ["Certain used goods", "Counterfeit"],
      specialRequirements: ["Siscomex mandatory", "Nota Fiscal electronic", "INMETRO for electronics"],
    },
    IN: {
      country: "IN",
      requiredDocs: [
        { docType: "COMMERCIAL_INVOICE", name: "GST e-Invoice", mandatory: true, authority: "GSTN" },
        { docType: "COO", name: "Certificate of Origin", mandatory: false, authority: "Chamber of Commerce" },
        { docType: "BL_AWB", name: "Bill of Lading", mandatory: true, authority: "Carrier" },
        { docType: "ICEGATE", name: "ICEGATE Declaration", mandatory: true, authority: "CBIC" },
        { docType: "BIS", name: "BIS Certification", mandatory: false, authority: "BIS", notes: "Required for electronics" },
        { docType: "APEDA", name: "APEDA Certificate", mandatory: false, authority: "APEDA", notes: "Required for agri exports" },
      ],
      prohibitedItems: ["Certain Chinese apps/goods", "Counterfeit"],
      specialRequirements: ["GST e-Invoice mandatory", "ICEGATE filing", "BIS for electronics"],
    },
    KE: {
      country: "KE",
      requiredDocs: [
        { docType: "COMMERCIAL_INVOICE", name: "Commercial Invoice", mandatory: true, authority: "Exporter" },
        { docType: "COO", name: "Certificate of Origin (COMESA)", mandatory: false, authority: "KEPROBA" },
        { docType: "BL_AWB", name: "Bill of Lading", mandatory: true, authority: "Carrier" },
        { docType: "SIMBA", name: "KRA Simba Declaration", mandatory: true, authority: "KRA" },
        { docType: "PVOC", name: "PVoC (Pre-Export Verification of Conformity)", mandatory: true, authority: "KEBS" },
        { docType: "KEBS", name: "KEBS Standardization Mark", mandatory: false, authority: "KEBS" },
      ],
      prohibitedItems: ["Plastic bags", "Counterfeit", "Certain GMO products"],
      specialRequirements: ["PVoC mandatory before export to Kenya", "Simba customs declaration"],
    },
    GH: {
      country: "GH",
      requiredDocs: [
        { docType: "COMMERCIAL_INVOICE", name: "Commercial Invoice", mandatory: true, authority: "Exporter" },
        { docType: "COO", name: "Certificate of Origin (ECOWAS/AfCFTA)", mandatory: false, authority: "GEPA" },
        { docType: "BL_AWB", name: "Bill of Lading", mandatory: true, authority: "Carrier" },
        { docType: "GCNET", name: "GCNet Declaration", mandatory: true, authority: "GRA Customs" },
        { docType: "GSA_FORM", name: "GSA e-Form", mandatory: true, authority: "Ghana Shippers Authority" },
        { docType: "FDA_CERT", name: "FDA Certificate", mandatory: false, authority: "Ghana FDA", notes: "Required for food/drugs" },
      ],
      prohibitedItems: ["Counterfeit", "Certain toxic chemicals"],
      specialRequirements: ["GCNet mandatory", "GSA e-Form for imports", "AfCFTA preference available"],
    },
    MA: {
      country: "MA",
      requiredDocs: [
        { docType: "COMMERCIAL_INVOICE", name: "Commercial Invoice", mandatory: true, authority: "Exporter" },
        { docType: "COO", name: "Certificate of Origin (EUR.1/Agadir)", mandatory: false, authority: "Chamber of Commerce" },
        { docType: "BL_AWB", name: "Bill of Lading", mandatory: true, authority: "Carrier" },
        { docType: "ADII", name: "ADII Declaration (Douane)", mandatory: true, authority: "Administration des Douanes" },
        { docType: "DAMANEX", name: "DAMANEX (import authorization)", mandatory: false, authority: "Office des Changes", notes: "For restricted goods" },
        { docType: "ONSSA", name: "ONSSA Certificate", mandatory: false, authority: "ONSSA", notes: "Required for food" },
      ],
      prohibitedItems: ["Counterfeit", "Certain sanctioned goods"],
      specialRequirements: ["ADII customs declaration", "EUR.1 for EU preference (Pan-Euro-Med)", "Agadir for MA-EG-TN-JO cumulation"],
    },
  };
  return rules[c] || null;
}

function EU_DOC_RULES(country: string): CountryDocRule {
  return {
    country,
    requiredDocs: [
      { docType: "COMMERCIAL_INVOICE", name: "Commercial Invoice", mandatory: true, authority: "Exporter" },
      { docType: "PACKING_LIST", name: "Packing List", mandatory: true, authority: "Exporter" },
      { docType: "COO", name: "EUR.1 Movement Certificate", mandatory: false, authority: "Chamber of Commerce", notes: "For FTA preference" },
      { docType: "BL_AWB", name: "Bill of Lading / Air Waybill", mandatory: true, authority: "Carrier" },
      { docType: "ENS", name: "ENS (Entry Summary Declaration)", mandatory: true, authority: "EU ICS2", notes: "Mandatory since Jan 2025" },
      { docType: "CBAM_REPORT", name: "CBAM Emissions Report", mandatory: false, authority: "European Commission", notes: "For steel/aluminium/cement/fertiliser/hydrogen/electricity — definitive from Jan 2026" },
      { docType: "EUDR_DDS", name: "EUDR Due Diligence Statement", mandatory: false, authority: "EU Information System", notes: "For wood/cocoa/coffee/soy/palm/rubber/cattle — from Dec 2025" },
      { docType: "CE_MARK", name: "CE Marking + Declaration of Conformity", mandatory: false, authority: "EU Notified Body", notes: "For machinery/electronics/toys/medical" },
      { docType: "REACH_SVHC", name: "REACH SVHC Declaration", mandatory: false, authority: "ECHA", notes: "For chemicals/plastics" },
    ],
    prohibitedItems: ["Sanctioned Russian/Belarusian goods", "Counterfeit", "Certain GMOs without authorization"],
    specialRequirements: ["ICS2 ENS mandatory since Jan 2025", "CBAM definitive from Jan 2026", "EUDR from Dec 2025", "EUR.1 for FTA preference"],
  };
}

function GCC_DOC_RULES(country: string): CountryDocRule {
  const isSA = country === "SA";
  return {
    country,
    requiredDocs: [
      { docType: "COMMERCIAL_INVOICE", name: "Commercial Invoice", mandatory: true, authority: "Exporter" },
      { docType: "PACKING_LIST", name: "Packing List", mandatory: true, authority: "Exporter" },
      { docType: "COO", name: "AR.1 Arab Certificate of Origin", mandatory: false, authority: "Chamber of Commerce", notes: "For GAFTA preference" },
      { docType: "BL_AWB", name: "Bill of Lading", mandatory: true, authority: "Carrier" },
      { docType: "CUSTOMS_DECL", name: isSA ? "FASAH Declaration" : "Dubai Trade Declaration", mandatory: true, authority: isSA ? "FASAH" : "Dubai Customs" },
      { docType: "HALAL_CERT", name: "Halal Certificate", mandatory: false, authority: "Local Halal Authority", notes: "For meat/animal products" },
    ],
    prohibitedItems: ["Alcohol (restricted in SA/KW)", "Pork products", "Counterfeit"],
    specialRequirements: ["GCC CET 5% standard", "GAFTA 0% for Arab-origin goods", "Halal mandatory for meat"],
  };
}

export function getRequiredDocsForLane(
  originCountry: string,
  destCountry: string,
  hsCode: string,
  commodity: string,
): { docs: { docType: string; name: string; mandatory: boolean; authority: string }[]; notes: string[] } {
  const origin = getCountryDocRules(originCountry);
  const dest = getCountryDocRules(destCountry);
  if (!dest) return { docs: [], notes: [`No doc rules for destination ${destCountry} — manual review required`] };

  const docs = dest.requiredDocs.filter(d => d.mandatory);
  const notes: string[] = [];

  // Add origin-specific docs
  if (origin) {
    const originMandatory = origin.requiredDocs.filter(d => d.mandatory && !docs.some(dd => dd.docType === d.docType));
    docs.push(...originMandatory);
  }

  // Commodity-specific notes
  const chapter = parseInt((hsCode || "").substring(0, 2), 10);
  if (chapter >= 1 && chapter <= 22) notes.push("Food commodity — phytosanitary + FDA/health certificates likely required");
  if (chapter >= 84 && chapter <= 85) notes.push("Electronics — CE/CCC/BIS/INMETRO certification likely required for destination");
  if (chapter === 44 || chapter === 47 || chapter === 48) notes.push("Wood/paper — FSC certification + EUDR due diligence (EU dest)");

  notes.push(...dest.specialRequirements);

  return { docs, notes };
}

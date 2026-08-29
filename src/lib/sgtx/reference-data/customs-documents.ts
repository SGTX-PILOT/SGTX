// @ts-nocheck
// Customs Document Reference — 50+ document types
// Sources: WCO, EU, US CBP, Egypt Customs, ICC
export interface CustomsDocument { code: string; name: string; category: string; requiredFor: string; issuingAuthority: string; format: string; validity: string; legalRef: string; }
export const DOCUMENTS: CustomsDocument[] = [
  // Commercial
  {code:"COMMERCIAL_INVOICE",name:"Commercial Invoice",category:"COMMERCIAL",requiredFor:"IMPORT/EXPORT",issuingAuthority:"Seller",format:"ELECTRONIC",validity:"Per shipment",legalRef:"WCO Revised Kyoto Convention"},
  {code:"PACKING_LIST",name:"Packing List",category:"COMMERCIAL",requiredFor:"IMPORT/EXPORT",issuingAuthority:"Seller",format:"ELECTRONIC",validity:"Per shipment",legalRef:"WCO RKC"},
  {code:"PROFORMA_INVOICE",name:"Proforma Invoice",category:"COMMERCIAL",requiredFor:"PRE-CONTRACT",issuingAuthority:"Seller",format:"ELECTRONIC",validity:"30-90 days",legalRef:"ICC"},
  // Transport
  {code:"BILL_OF_LADING",name:"Bill of Lading (B/L)",category:"TRANSPORT",requiredFor:"OCEAN",issuingAuthority:"Carrier",format:"BOTH",validity:"Until delivery",legalRef:"Hague-Visby Rules"},
  {code:"SEA_WAYBILL",name:"Sea Waybill",category:"TRANSPORT",requiredFor:"OCEAN",issuingAuthority:"Carrier",format:"ELECTRONIC",validity:"Until delivery",legalRef:"UNCLOS"},
  {code:"AIR_WAYBILL",name:"Air Waybill (AWB/MAWB)",category:"TRANSPORT",requiredFor:"AIR",issuingAuthority:"Airline",format:"ELECTRONIC",validity:"Until delivery",legalRef:"Warsaw Convention / Montreal Convention 1999"},
  {code:"HOUSE_AIR_WAYBILL",name:"House Air Waybill (HAWB)",category:"TRANSPORT",requiredFor:"AIR",issuingAuthority:"Freight Forwarder",format:"ELECTRONIC",validity:"Until delivery",legalRef:"IATA Resolution 600"},
  {code:"CMR",name:"CMR Consignment Note",category:"TRANSPORT",requiredFor:"ROAD",issuingAuthority:"Carrier",format:"BOTH",validity:"Until delivery",legalRef:"CMR Convention 1956"},
  {code:"CIM",name:"CIM Consignment Note",category:"TRANSPORT",requiredFor:"RAIL",issuingAuthority:"Railway",format:"ELECTRONIC",validity:"Until delivery",legalRef:"COTIF/CIM Convention"},
  // Customs
  {code:"CUSTOMS_DECLARATION",name:"Customs Declaration (SAD/Import/Export)",category:"CUSTOMS",requiredFor:"IMPORT/EXPORT",issuingAuthority:"Broker/Declarant",format:"ELECTRONIC",validity:"Per declaration",legalRef:"WCO RKC / National law"},
  {code:"ENTRY_SUMMARY",name:"Entry Summary (ISF/ENS)",category:"CUSTOMS",requiredFor:"IMPORT",issuingAuthority:"Importer/Broker",format:"ELECTRONIC",validity:"Pre-arrival",legalRef:"US SAFE Port Act / EU ICS2"},
  {code:"TRANSIT_DECLARATION",name:"Transit Declaration (T1/T2)",category:"CUSTOMS",requiredFor:"TRANSIT",issuingAuthority:"Broker",format:"ELECTRONIC",validity:"Transit period",legalRef:"EU NCTS / TIR Convention"},
  // Origin
  {code:"CERTIFICATE_OF_ORIGIN",name:"Certificate of Origin (COO)",category:"ORIGIN",requiredFor:"FTA/IMPORT",issuingAuthority:"Chamber of Commerce",format:"BOTH",validity:"Per shipment",legalRef:"WCO RKC / ICC"},
  {code:"EUR1",name:"EUR.1 Movement Certificate",category:"ORIGIN",requiredFor:"EU FTA IMPORT",issuingAuthority:"Customs Authority",format:"ORIGINAL",validity:"Per shipment",legalRef:"EU FTA Agreements"},
  {code:"FORM_A",name:"GSP Form A",category:"ORIGIN",requiredFor:"GSP IMPORT",issuingAuthority:"Customs Authority",format:"ORIGINAL",validity:"Per shipment",legalRef:"GSP Scheme"},
  {code:"ORIGIN_DECLARATION",name:"Origin Declaration (Invoice Declaration)",category:"ORIGIN",requiredFor:"FTA IMPORT",issuingAuthority:"Exporter (approved)",format:"ELECTRONIC",validity:"Per shipment",legalRef:"EU FTA / RCEP"},
  // Health / SPS
  {code:"PHYTOSANITARY",name:"Phytosanitary Certificate",category:"SPS",requiredFor:"PLANT IMPORT",issuingAuthority:"NPPO",format:"BOTH",validity:"Per shipment",legalRef:"IPPC / ISPM 12"},
  {code:"HEALTH_CERTIFICATE",name:"Health Certificate (Animal/Animal Products)",category:"SPS",requiredFor:"ANIMAL IMPORT",issuingAuthority:"Veterinary Authority",format:"ORIGINAL",validity:"Per shipment",legalRef:"WTO SPS Agreement"},
  {code:"VETERINARY_CERTIFICATE",name:"Veterinary Certificate",category:"SPS",requiredFor:"ANIMAL IMPORT",issuingAuthority:"Veterinary Authority",format:"ORIGINAL",validity:"Per shipment",legalRef:"OIE/WOAH"},
  {code:"FOOD_SAFETY_CERT",name:"Food Safety Certificate",category:"SPS",requiredFor:"FOOD IMPORT",issuingAuthority:"Food Safety Authority",format:"ORIGINAL",validity:"Per shipment",legalRef:"Codex Alimentarius"},
  {code:"COLD_TREATMENT_CERT",name:"Cold Treatment Certificate",category:"SPS",requiredFor:"COLD CHAIN IMPORT",issuingAuthority:"Treatment Facility",format:"ORIGINAL",validity:"Per shipment",legalRef:"ISPM 7 / 18"},
  {code:"FUMIGATION_CERT",name:"Fumigation Certificate",category:"SPS",requiredFor:"WOOD PACKAGING",issuingAuthority:"Treatment Facility",format:"ORIGINAL",validity:"Per shipment",legalRef:"ISPM 15"},
  // Quality / Conformity
  {code:"HALAL_CERT",name:"Halal Certificate",category:"CONFORMITY",requiredFor:"ME/SEA IMPORT",issuingAuthority:"Recognised Halal Body",format:"ORIGINAL",validity:"1-2 years",legalRef:"National Halal standards"},
  {code:"ORGANIC_CERT",name:"Organic Certificate",category:"CONFORMITY",requiredFor:"ORGANIC IMPORT",issuingAuthority:"Certification Body",format:"ORIGINAL",validity:"1 year",legalRef:"EU 2018/848 / USDA NOP"},
  {code:"SASO_COC",name:"SASO Certificate of Conformity",category:"CONFORMITY",requiredFor:"SAUDI IMPORT",issuingAuthority:"SASO-approved body",format:"ELECTRONIC",validity:"Per shipment",legalRef:"SASO SALEEM"},
  {code:"CE_MARK",name:"CE Marking Declaration of Conformity",category:"CONFORMITY",requiredFor:"EU IMPORT",issuingAuthority:"Manufacturer",format:"ELECTRONIC",validity:"Product lifecycle",legalRef:"EU CE Marking Directives"},
  {code:"GCC_CERT",name:"GCC Certificate of Conformity",category:"CONFORMITY",requiredFor:"GCC IMPORT",issuingAuthority:"GSO-approved body",format:"ELECTRONIC",validity:"Per shipment",legalRef:"GSO regulations"},
  // Insurance
  {code:"INSURANCE_CERT",name:"Insurance Certificate",category:"INSURANCE",requiredFor:"CIF/CIP",issuingAuthority:"Insurer",format:"BOTH",validity:"Per shipment",legalRef:"Institute Cargo Clauses"},
  // Financial
  {code:"LC",name:"Letter of Credit",category:"FINANCIAL",requiredFor:"PAYMENT",issuingAuthority:"Issuing Bank",format:"ELECTRONIC",validity:"LC validity period",legalRef:"UCP 600"},
  {code:"BANK_GUARANTEE",name:"Bank Guarantee",category:"FINANCIAL",requiredFor:"CUSTOMS BOND",issuingAuthority:"Bank",format:"ORIGINAL",validity:"Per obligation",legalRef:"URDG 758"},
  // Dangerous Goods
  {code:"DG_DECLARATION",name:"Dangerous Goods Declaration",category:"DG",requiredFor:"DG TRANSPORT",issuingAuthority:"Shipper",format:"ELECTRONIC",validity:"Per shipment",legalRef:"IMDG Code / IATA DGR / ADR"},
  {code:"MSDS",name:"Material Safety Data Sheet (SDS)",category:"DG",requiredFor:"CHEMICAL TRANSPORT",issuingAuthority:"Manufacturer",format:"ELECTRONIC",validity:"Per product",legalRef:"GHS / REACH"},
  // Shipper's Declaration
  {code:"SHIPPERS_DECLARATION",name:"Shipper's Declaration for Dangerous Goods",category:"DG",requiredFor:"DG TRANSPORT",issuingAuthority:"Shipper",format:"ORIGINAL",validity:"Per shipment",legalRef:"IATA DGR / IMDG"},
];
export function getDocument(code: string): CustomsDocument | null { return DOCUMENTS.find(d => d.code === code.toUpperCase()) || null; }
export function getDocumentsByCategory(category: string): CustomsDocument[] { return DOCUMENTS.filter(d => d.category === category.toUpperCase()); }
export function getDocumentsForImport(): CustomsDocument[] { return DOCUMENTS.filter(d => d.requiredFor.includes("IMPORT")); }
export function getDocumentsForExport(): CustomsDocument[] { return DOCUMENTS.filter(d => d.requiredFor.includes("EXPORT")); }
export function listAllDocuments(): CustomsDocument[] { return DOCUMENTS; }

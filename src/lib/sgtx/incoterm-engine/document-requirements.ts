// @ts-nocheck
/**
 * SGTX v17 Phase 2 — Incoterm Document Requirements
 * ===========================================================================
 *
 * Returns the per-incoterm mandatory + optional document set for any
 * Incoterm 2020 × transport mode × origin × destination pair.
 *
 * The 11 incoterms covered: EXW, FCA, CPT, CIP, DAP, DPU, DDP, FAS, FOB,
 * CFR, CIF.
 *
 * Document set is determined by three orthogonal drivers:
 *   1. Incoterm responsibility matrix — who issues the transport document
 *      (seller for FOB/CFR/CIF/FAS, etc.), who clears export (EXW → buyer;
 *      everyone else → seller), who clears import (DDP → seller; everyone
 *      else → buyer), who provides insurance certificate (CIF/CIP → seller).
 *   2. Transport mode — sea → Bill of Lading (B/L); air → Air Waybill (AWB);
 *      road → CMR consignment note; rail → CIM/SMGS; multimodal → FBL
 *      (FIATA Multimodal Transport Bill of Lading).
 *   3. Country pair — origin / destination may require additional docs
 *      (e.g. Egypt → ACID, EU → ENS, China → CoC). The country-specific
 *      documents are looked up from the existing customs-docs reference.
 *
 * Issuer classification:
 *   BUYER    — the buyer issues this doc (e.g. import declaration in EXW)
 *   SELLER   — the seller issues this doc (e.g. export commercial invoice)
 *   CARRIER  — the carrier issues this doc (e.g. B/L, AWB, CMR)
 *   CUSTOMS  — the customs authority issues this doc (e.g. clearance)
 *   INSURER  — the insurer issues this doc (e.g. insurance certificate)
 *
 * The library is pure + synchronous — no DB lookups. The buyer wizard uses
 * it to render the documentation requirements section; the seller workflow
 * uses it to validate that all seller-issued documents are present before
 * quote submission; the Governor uses it for G1U22 (documentation
 * completeness) and G2U18 (mandatory services priced).
 */

import {
  getIncotermResponsibility,
  SVC_INSURANCE,
  SVC_CUSTOMS_EXPORT,
  SVC_CUSTOMS_IMPORT,
} from "@/lib/sgtx/incoterms/responsibility-engine";
import { getIncoterm as getReferenceIncoterm } from "@/lib/sgtx/reference-data/incoterms-2020";
import { logger } from "@/lib/sgtx/logger";

// ============ Types ============

export type DocumentIssuer = "BUYER" | "SELLER" | "CARRIER" | "CUSTOMS" | "INSURER";

export type TransportMode = "SEA" | "AIR" | "RAIL" | "TRUCK" | "RORO" | "MULTIMODAL";

export type DocumentCategory =
  | "COMMERCIAL"
  | "TRANSPORT"
  | "CUSTOMS"
  | "INSURANCE"
  | "CERTIFICATE"
  | "FINANCIAL";

export interface DocumentRequirement {
  /** Stable document type code (e.g. "BL", "AWB", "COMMERCIAL_INVOICE"). */
  documentType: string;
  /** Human-readable label. */
  label: string;
  /** Issuer of the document. */
  issuer: DocumentIssuer;
  /** Document category (drives the UI grouping). */
  category: DocumentCategory;
  /** Mandatory (true) or optional (false). */
  mandatory: boolean;
  /** True if the document is required specifically because of the incoterm (vs. universally required). */
  incotermDriven: boolean;
  /** True if the document is required specifically because of the transport mode. */
  modeDriven: boolean;
  /** Free-text note explaining why this document is required. */
  note?: string;
}

export interface DocumentCompletenessResult {
  complete: boolean;
  missing: string[];
  warnings: string[];
  /** Documents present but not required by the incoterm/mode (informational). */
  extra: string[];
}

export interface DocumentInput {
  documentType: string;
  /** Optional issuer declaration on the document itself (validated against expected issuer). */
  issuer?: DocumentIssuer;
  /** Optional status flag — "ISSUED" means the document is on file. */
  status?: "DRAFT" | "ISSUED" | "VERIFIED" | "REJECTED";
}

// ============ Constants — Document type codes ============

export const DOC_BL = "BL"; // Bill of Lading (sea)
export const DOC_AWB = "AWB"; // Air Waybill
export const DOC_CMR = "CMR"; // Road consignment note
export const DOC_CIM = "CIM"; // Rail consignment note
export const DOC_FBL = "FBL"; // FIATA Multimodal Transport B/L
export const DOC_SWD = "SWD"; // Sea Waybill (non-negotiable)
export const DOC_COMMERCIAL_INVOICE = "COMMERCIAL_INVOICE";
export const DOC_PACKING_LIST = "PACKING_LIST";
export const DOC_CERTIFICATE_OF_ORIGIN = "CERTIFICATE_OF_ORIGIN";
export const DOC_EXPORT_DECLARATION = "EXPORT_DECLARATION";
export const DOC_IMPORT_DECLARATION = "IMPORT_DECLARATION";
export const DOC_INSURANCE_CERTIFICATE = "INSURANCE_CERTIFICATE";
export const DOC_INSURANCE_POLICY = "INSURANCE_POLICY";
export const DOC_PHYTOSANITARY_CERT = "PHYTOSANITARY_CERT";
export const DOC_DUTY_PAYMENT_PROOF = "DUTY_PAYMENT_PROOF";
export const DOC_VGM = "VGM"; // Verified Gross Mass (sea — SOLAS amendment)
export const DOC_SHIPPERS_DECLARATION = "SHIPPERS_DECLARATION"; // DG shippers declaration

// ============ Transport mode → transport document mapping ============

const TRANSPORT_DOC_BY_MODE: Record<TransportMode, DocumentRequirement> = {
  SEA: {
    documentType: DOC_BL,
    label: "Bill of Lading (B/L)",
    issuer: "CARRIER",
    category: "TRANSPORT",
    mandatory: true,
    incotermDriven: false,
    modeDriven: true,
    note: "Ocean carriage requires a Bill of Lading issued by the carrier. On-board B/L is mandatory for FOB/CFR/CIF.",
  },
  AIR: {
    documentType: DOC_AWB,
    label: "Air Waybill (AWB)",
    issuer: "CARRIER",
    category: "TRANSPORT",
    mandatory: true,
    incotermDriven: false,
    modeDriven: true,
    note: "Air carriage requires an Air Waybill (MAWB / HAWB) issued by the carrier.",
  },
  RAIL: {
    documentType: DOC_CIM,
    label: "CIM / SMGS Rail Consignment Note",
    issuer: "CARRIER",
    category: "TRANSPORT",
    mandatory: true,
    incotermDriven: false,
    modeDriven: true,
    note: "Rail carriage requires a CIM (COTIF) or SMGS rail consignment note issued by the carrier.",
  },
  TRUCK: {
    documentType: DOC_CMR,
    label: "CMR Road Consignment Note",
    issuer: "CARRIER",
    category: "TRANSPORT",
    mandatory: true,
    incotermDriven: false,
    modeDriven: true,
    note: "Road carriage requires a CMR consignment note issued by the carrier.",
  },
  RORO: {
    documentType: DOC_BL,
    label: "Bill of Lading (Ro-Ro)",
    issuer: "CARRIER",
    category: "TRANSPORT",
    mandatory: true,
    incotermDriven: false,
    modeDriven: true,
    note: "Ro-Ro carriage uses a Bill of Lading (or dock receipt) issued by the carrier.",
  },
  MULTIMODAL: {
    documentType: DOC_FBL,
    label: "FIATA Multimodal Transport B/L (FBL)",
    issuer: "CARRIER",
    category: "TRANSPORT",
    mandatory: true,
    incotermDriven: false,
    modeDriven: true,
    note: "Multimodal carriage uses a FIATA FBL (or negotiable B/L) issued by the carrier / freight forwarder.",
  },
};

// ============ Universal commercial documents (required for every incoterm) ============

const UNIVERSAL_COMMERCIAL_DOCS: DocumentRequirement[] = [
  {
    documentType: DOC_COMMERCIAL_INVOICE,
    label: "Commercial Invoice",
    issuer: "SELLER",
    category: "COMMERCIAL",
    mandatory: true,
    incotermDriven: false,
    modeDriven: false,
    note: "Seller issues a commercial invoice — required for customs clearance + payment.",
  },
  {
    documentType: DOC_PACKING_LIST,
    label: "Packing List",
    issuer: "SELLER",
    category: "COMMERCIAL",
    mandatory: true,
    incotermDriven: false,
    modeDriven: false,
    note: "Seller issues a packing list detailing contents, weights, and dimensions per carton / pallet / container.",
  },
  {
    documentType: DOC_CERTIFICATE_OF_ORIGIN,
    label: "Certificate of Origin",
    issuer: "CUSTOMS",
    category: "CERTIFICATE",
    mandatory: true,
    incotermDriven: false,
    modeDriven: false,
    note: "Required for FTA preference claims + import clearance. Issued by the chamber of commerce / customs authority in the origin country.",
  },
];

// ============ Incoterm-specific document requirements ============

/**
 * Per-incoterm document requirements layered on top of the universal set.
 * Each entry includes the issuer, whether it's mandatory, and the rationale.
 *
 * The key rules:
 *   • EXW → buyer issues / obtains EVERYTHING (export + import docs).
 *   • FCA / CPT / CIP / DAP / DPU / FOB / CFR / CIF / FAS → seller issues
 *     export docs, buyer issues import docs.
 *   • CIF / CIP → seller must procure + provide the insurance certificate.
 *   • DDP → seller issues / obtains EVERYTHING (export + import + duty payment proof).
 *   • DDP is the only incoterm where the seller provides import-clearance docs.
 */
const INCOTERM_SPECIFIC_DOCS: Record<string, DocumentRequirement[]> = {
  EXW: [
    {
      documentType: DOC_EXPORT_DECLARATION,
      label: "Export Declaration (EXW — buyer issues)",
      issuer: "BUYER",
      category: "CUSTOMS",
      mandatory: true,
      incotermDriven: true,
      modeDriven: false,
      note: "EXW allocates export clearance to the BUYER — buyer must file the export declaration in the seller's country (often impractical; FCA recommended).",
    },
    {
      documentType: DOC_IMPORT_DECLARATION,
      label: "Import Declaration",
      issuer: "BUYER",
      category: "CUSTOMS",
      mandatory: true,
      incotermDriven: true,
      modeDriven: false,
      note: "Buyer clears import customs.",
    },
    {
      documentType: DOC_DUTY_PAYMENT_PROOF,
      label: "Import Duty Payment Proof",
      issuer: "BUYER",
      category: "CUSTOMS",
      mandatory: true,
      incotermDriven: true,
      modeDriven: false,
      note: "Buyer pays import duties and retains proof of payment.",
    },
  ],
  FCA: [
    {
      documentType: DOC_EXPORT_DECLARATION,
      label: "Export Declaration",
      issuer: "SELLER",
      category: "CUSTOMS",
      mandatory: true,
      incotermDriven: true,
      modeDriven: false,
      note: "FCA allocates export clearance to the SELLER. For sea, the seller can request an on-board B/L from the carrier (Incoterms 2020 mechanism).",
    },
    {
      documentType: DOC_IMPORT_DECLARATION,
      label: "Import Declaration",
      issuer: "BUYER",
      category: "CUSTOMS",
      mandatory: true,
      incotermDriven: true,
      modeDriven: false,
      note: "Buyer clears import customs.",
    },
    {
      documentType: DOC_DUTY_PAYMENT_PROOF,
      label: "Import Duty Payment Proof",
      issuer: "BUYER",
      category: "CUSTOMS",
      mandatory: true,
      incotermDriven: true,
      modeDriven: false,
      note: "Buyer pays import duties.",
    },
  ],
  CPT: [
    {
      documentType: DOC_EXPORT_DECLARATION,
      label: "Export Declaration",
      issuer: "SELLER",
      category: "CUSTOMS",
      mandatory: true,
      incotermDriven: true,
      modeDriven: false,
      note: "Seller clears export customs.",
    },
    {
      documentType: DOC_IMPORT_DECLARATION,
      label: "Import Declaration",
      issuer: "BUYER",
      category: "CUSTOMS",
      mandatory: true,
      incotermDriven: true,
      modeDriven: false,
      note: "Buyer clears import customs.",
    },
    {
      documentType: DOC_DUTY_PAYMENT_PROOF,
      label: "Import Duty Payment Proof",
      issuer: "BUYER",
      category: "CUSTOMS",
      mandatory: true,
      incotermDriven: true,
      modeDriven: false,
      note: "Buyer pays import duties.",
    },
  ],
  CIP: [
    {
      documentType: DOC_EXPORT_DECLARATION,
      label: "Export Declaration",
      issuer: "SELLER",
      category: "CUSTOMS",
      mandatory: true,
      incotermDriven: true,
      modeDriven: false,
      note: "Seller clears export customs.",
    },
    {
      documentType: DOC_IMPORT_DECLARATION,
      label: "Import Declaration",
      issuer: "BUYER",
      category: "CUSTOMS",
      mandatory: true,
      incotermDriven: true,
      modeDriven: false,
      note: "Buyer clears import customs.",
    },
    {
      documentType: DOC_INSURANCE_CERTIFICATE,
      label: "Insurance Certificate (ICC Clause A)",
      issuer: "INSURER",
      category: "INSURANCE",
      mandatory: true,
      incotermDriven: true,
      modeDriven: false,
      note: "CIP mandates the seller procure cargo insurance with Institute Cargo Clauses (A) — maximum cover — and provide the certificate to the buyer.",
    },
    {
      documentType: DOC_DUTY_PAYMENT_PROOF,
      label: "Import Duty Payment Proof",
      issuer: "BUYER",
      category: "CUSTOMS",
      mandatory: true,
      incotermDriven: true,
      modeDriven: false,
      note: "Buyer pays import duties.",
    },
  ],
  DAP: [
    {
      documentType: DOC_EXPORT_DECLARATION,
      label: "Export Declaration",
      issuer: "SELLER",
      category: "CUSTOMS",
      mandatory: true,
      incotermDriven: true,
      modeDriven: false,
      note: "Seller clears export customs.",
    },
    {
      documentType: DOC_IMPORT_DECLARATION,
      label: "Import Declaration",
      issuer: "BUYER",
      category: "CUSTOMS",
      mandatory: true,
      incotermDriven: true,
      modeDriven: false,
      note: "DAP — buyer clears import customs (seller delivers but does NOT clear).",
    },
    {
      documentType: DOC_DUTY_PAYMENT_PROOF,
      label: "Import Duty Payment Proof",
      issuer: "BUYER",
      category: "CUSTOMS",
      mandatory: true,
      incotermDriven: true,
      modeDriven: false,
      note: "Buyer pays import duties.",
    },
  ],
  DPU: [
    {
      documentType: DOC_EXPORT_DECLARATION,
      label: "Export Declaration",
      issuer: "SELLER",
      category: "CUSTOMS",
      mandatory: true,
      incotermDriven: true,
      modeDriven: false,
      note: "Seller clears export customs.",
    },
    {
      documentType: DOC_IMPORT_DECLARATION,
      label: "Import Declaration",
      issuer: "BUYER",
      category: "CUSTOMS",
      mandatory: true,
      incotermDriven: true,
      modeDriven: false,
      note: "DPU — buyer clears import customs (seller delivers AFTER unloading but does NOT clear import).",
    },
    {
      documentType: DOC_DUTY_PAYMENT_PROOF,
      label: "Import Duty Payment Proof",
      issuer: "BUYER",
      category: "CUSTOMS",
      mandatory: true,
      incotermDriven: true,
      modeDriven: false,
      note: "Buyer pays import duties.",
    },
  ],
  DDP: [
    {
      documentType: DOC_EXPORT_DECLARATION,
      label: "Export Declaration",
      issuer: "SELLER",
      category: "CUSTOMS",
      mandatory: true,
      incotermDriven: true,
      modeDriven: false,
      note: "Seller clears export customs.",
    },
    {
      documentType: DOC_IMPORT_DECLARATION,
      label: "Import Declaration (DDP — seller issues)",
      issuer: "SELLER",
      category: "CUSTOMS",
      mandatory: true,
      incotermDriven: true,
      modeDriven: false,
      note: "DDP — seller clears import customs (often requires a local fiscal representative in the destination country).",
    },
    {
      documentType: DOC_DUTY_PAYMENT_PROOF,
      label: "Import Duty Payment Proof (DDP — seller pays)",
      issuer: "SELLER",
      category: "CUSTOMS",
      mandatory: true,
      incotermDriven: true,
      modeDriven: false,
      note: "DDP — seller pays import duties + VAT/GST and retains proof of payment.",
    },
    {
      documentType: DOC_INSURANCE_CERTIFICATE,
      label: "Insurance Certificate (recommended)",
      issuer: "INSURER",
      category: "INSURANCE",
      mandatory: false,
      incotermDriven: true,
      modeDriven: false,
      note: "DDP — seller carries risk until delivery; insurance is customary but not mandatory under the incoterm.",
    },
  ],
  FAS: [
    {
      documentType: DOC_EXPORT_DECLARATION,
      label: "Export Declaration",
      issuer: "SELLER",
      category: "CUSTOMS",
      mandatory: true,
      incotermDriven: true,
      modeDriven: false,
      note: "FAS — seller clears export customs and delivers goods alongside the vessel.",
    },
    {
      documentType: DOC_IMPORT_DECLARATION,
      label: "Import Declaration",
      issuer: "BUYER",
      category: "CUSTOMS",
      mandatory: true,
      incotermDriven: true,
      modeDriven: false,
      note: "Buyer clears import customs.",
    },
    {
      documentType: DOC_DUTY_PAYMENT_PROOF,
      label: "Import Duty Payment Proof",
      issuer: "BUYER",
      category: "CUSTOMS",
      mandatory: true,
      incotermDriven: true,
      modeDriven: false,
      note: "Buyer pays import duties.",
    },
    {
      documentType: DOC_VGM,
      label: "VGM (Verified Gross Mass)",
      issuer: "SELLER",
      category: "CERTIFICATE",
      mandatory: true,
      incotermDriven: false,
      modeDriven: true,
      note: "SOLAS amendment — Verified Gross Mass declaration required for all containerised sea cargo.",
    },
  ],
  FOB: [
    {
      documentType: DOC_EXPORT_DECLARATION,
      label: "Export Declaration",
      issuer: "SELLER",
      category: "CUSTOMS",
      mandatory: true,
      incotermDriven: true,
      modeDriven: false,
      note: "FOB — seller clears export customs and loads goods on board the vessel.",
    },
    {
      documentType: DOC_IMPORT_DECLARATION,
      label: "Import Declaration",
      issuer: "BUYER",
      category: "CUSTOMS",
      mandatory: true,
      incotermDriven: true,
      modeDriven: false,
      note: "Buyer clears import customs.",
    },
    {
      documentType: DOC_DUTY_PAYMENT_PROOF,
      label: "Import Duty Payment Proof",
      issuer: "BUYER",
      category: "CUSTOMS",
      mandatory: true,
      incotermDriven: true,
      modeDriven: false,
      note: "Buyer pays import duties.",
    },
    {
      documentType: DOC_VGM,
      label: "VGM (Verified Gross Mass)",
      issuer: "SELLER",
      category: "CERTIFICATE",
      mandatory: true,
      incotermDriven: false,
      modeDriven: true,
      note: "SOLAS amendment — VGM required for containerised sea cargo. Seller is responsible under FOB.",
    },
  ],
  CFR: [
    {
      documentType: DOC_EXPORT_DECLARATION,
      label: "Export Declaration",
      issuer: "SELLER",
      category: "CUSTOMS",
      mandatory: true,
      incotermDriven: true,
      modeDriven: false,
      note: "CFR — seller clears export customs and pays freight to destination port.",
    },
    {
      documentType: DOC_IMPORT_DECLARATION,
      label: "Import Declaration",
      issuer: "BUYER",
      category: "CUSTOMS",
      mandatory: true,
      incotermDriven: true,
      modeDriven: false,
      note: "Buyer clears import customs.",
    },
    {
      documentType: DOC_DUTY_PAYMENT_PROOF,
      label: "Import Duty Payment Proof",
      issuer: "BUYER",
      category: "CUSTOMS",
      mandatory: true,
      incotermDriven: true,
      modeDriven: false,
      note: "Buyer pays import duties.",
    },
    {
      documentType: DOC_VGM,
      label: "VGM (Verified Gross Mass)",
      issuer: "SELLER",
      category: "CERTIFICATE",
      mandatory: true,
      incotermDriven: false,
      modeDriven: true,
      note: "SOLAS amendment — VGM required for containerised sea cargo. Seller is responsible under CFR.",
    },
  ],
  CIF: [
    {
      documentType: DOC_EXPORT_DECLARATION,
      label: "Export Declaration",
      issuer: "SELLER",
      category: "CUSTOMS",
      mandatory: true,
      incotermDriven: true,
      modeDriven: false,
      note: "CIF — seller clears export customs, pays freight + insurance to destination port.",
    },
    {
      documentType: DOC_INSURANCE_CERTIFICATE,
      label: "Insurance Certificate (ICC Clause C)",
      issuer: "INSURER",
      category: "INSURANCE",
      mandatory: true,
      incotermDriven: true,
      modeDriven: false,
      note: "CIF mandates the seller procure cargo insurance with Institute Cargo Clauses (C) — minimum cover — and provide the certificate to the buyer. Buyer may upgrade to all-risks cover separately.",
    },
    {
      documentType: DOC_IMPORT_DECLARATION,
      label: "Import Declaration",
      issuer: "BUYER",
      category: "CUSTOMS",
      mandatory: true,
      incotermDriven: true,
      modeDriven: false,
      note: "Buyer clears import customs.",
    },
    {
      documentType: DOC_DUTY_PAYMENT_PROOF,
      label: "Import Duty Payment Proof",
      issuer: "BUYER",
      category: "CUSTOMS",
      mandatory: true,
      incotermDriven: true,
      modeDriven: false,
      note: "Buyer pays import duties.",
    },
    {
      documentType: DOC_VGM,
      label: "VGM (Verified Gross Mass)",
      issuer: "SELLER",
      category: "CERTIFICATE",
      mandatory: true,
      incotermDriven: false,
      modeDriven: true,
      note: "SOLAS amendment — VGM required for containerised sea cargo. Seller is responsible under CIF.",
    },
  ],
};

// ============ Main API ============

/**
 * Get the document requirements for an incoterm × transport mode × country pair.
 *
 * Returns the union of:
 *   • Universal commercial documents (invoice, packing list, certificate of origin)
 *   • Transport-mode-specific documents (B/L, AWB, CMR, CIM, FBL)
 *   • Incoterm-specific documents (export/import declarations, insurance
 *     certificate, duty payment proof, VGM)
 *
 * @param incoterm      — one of EXW, FCA, CPT, CIP, DAP, DPU, DDP, FAS, FOB, CFR, CIF
 * @param transportMode — SEA | AIR | RAIL | TRUCK | RORO | MULTIMODAL
 * @param originCountry — ISO-3 country code of origin (reserved for future
 *                        country-specific doc additions; currently advisory)
 * @param destCountry   — ISO-3 country code of destination (reserved for future
 *                        country-specific doc additions; currently advisory)
 */
export function getDocumentRequirements(
  incoterm: string,
  transportMode: string,
  originCountry?: string,
  destCountry?: string,
): DocumentRequirement[] {
  const key = (incoterm || "").trim().toUpperCase();
  const mode = ((transportMode || "SEA") as string).trim().toUpperCase() as TransportMode;
  const docs: DocumentRequirement[] = [];

  // Universal commercial documents
  docs.push(...UNIVERSAL_COMMERCIAL_DOCS);

  // Transport-mode-specific transport document
  const transportDoc = TRANSPORT_DOC_BY_MODE[mode] || TRANSPORT_DOC_BY_MODE.SEA;
  docs.push({ ...transportDoc });

  // Incoterm-specific documents
  const incotermDocs = INCOTERM_SPECIFIC_DOCS[key];
  if (incotermDocs) {
    docs.push(...incotermDocs);
  } else {
    logger.warn("[incoterm-docs] unknown incoterm, returning universal + mode docs only", {
      incoterm,
    });
  }

  // Advisory: country-specific doc notes (informational, doesn't add mandatory rows here)
  // The country-specific mandatory docs (e.g. Egypt ACID, EU ENS, China CoC) are
  // surfaced by the existing customs-docs reference + the GRiRE country profile;
  // here we just emit an advisory note in the returned doc set if a country
  // pair is provided.
  if (originCountry && destCountry && key) {
    // Reserved hook — future expansion can consult
    // src/lib/sgtx/compliance/country-doc-rules.ts to enrich this list.
  }

  return docs;
}

/**
 * Get the issuer for a specific document type under a given incoterm.
 * Returns the issuer classification or null if the document type is not
 * recognized for this incoterm.
 */
export function getDocumentIssuer(
  incoterm: string,
  docType: string,
  transportMode: string = "SEA",
): DocumentIssuer | null {
  try {
    const docs = getDocumentRequirements(incoterm, transportMode);
    const found = docs.find(
      (d) => d.documentType === docType || d.documentType.toUpperCase() === String(docType).toUpperCase(),
    );
    return found ? found.issuer : null;
  } catch (err: any) {
    logger.warn("[incoterm-docs] getDocumentIssuer failed", {
      incoterm,
      docType,
      error: err?.message,
    });
    return null;
  }
}

/**
 * Validate that the supplied documents cover every mandatory document
 * required by the incoterm × transport mode. Returns:
 *   • complete — true when all mandatory docs are present (status !== "REJECTED")
 *   • missing  — list of mandatory document types not present
 *   • warnings — advisory notes for present-but-draft or extra docs
 *   • extra    — list of present docs not required by this incoterm/mode
 */
export function validateDocumentCompleteness(
  incoterm: string,
  documents: DocumentInput[],
  transportMode: string = "SEA",
): DocumentCompletenessResult {
  const warnings: string[] = [];
  const extra: string[] = [];
  try {
    const required = getDocumentRequirements(incoterm, transportMode);
    const mandatory = required.filter((d) => d.mandatory);
    const present = new Set<string>();
    for (const d of documents || []) {
      if (!d) continue;
      const tag = String(d.documentType || "").trim().toUpperCase();
      if (!tag) continue;
      present.add(tag);
      if (d.status === "DRAFT") {
        warnings.push(`Document "${tag}" is in DRAFT status — must be ISSUED before trade closure.`);
      }
      if (d.status === "REJECTED") {
        warnings.push(`Document "${tag}" was REJECTED — must be re-issued.`);
      }
    }
    const missing: string[] = mandatory
      .filter((d) => !present.has(d.documentType.toUpperCase()))
      .map((d) => d.documentType);
    // Extras: present docs that aren't required.
    const requiredTags = new Set(required.map((d) => d.documentType.toUpperCase()));
    for (const tag of present) {
      if (!requiredTags.has(tag)) {
        extra.push(tag);
      }
    }
    return {
      complete: missing.length === 0,
      missing,
      warnings,
      extra,
    };
  } catch (err: any) {
    warnings.push(
      `Document completeness check failed: ${err?.message || "unknown error"}.`,
    );
    return { complete: false, missing: [], warnings, extra };
  }
}

// ============ Convenience exports ============

/**
 * Group document requirements by category for the UI. Returns an object
 * keyed by DocumentCategory with the list of docs in each category.
 */
export function groupDocumentsByCategory(
  docs: DocumentRequirement[],
): Record<DocumentCategory, DocumentRequirement[]> {
  const groups: Record<DocumentCategory, DocumentRequirement[]> = {
    COMMERCIAL: [],
    TRANSPORT: [],
    CUSTOMS: [],
    INSURANCE: [],
    CERTIFICATE: [],
    FINANCIAL: [],
  };
  for (const d of docs || []) {
    if (groups[d.category]) groups[d.category].push(d);
  }
  return groups;
}

/**
 * Returns true if the given incoterm requires the seller to procure
 * cargo insurance (CIF + CIP). Used by the buyer wizard's insurance
 * section and the seller workflow's mandatory services checklist.
 */
export function incotermRequiresSellerInsurance(incoterm: string): boolean {
  try {
    const r = getIncotermResponsibility(incoterm);
    return (
      r.insuranceRequired &&
      r.insuranceResponsibleParty === "SELLER"
    );
  } catch {
    return false;
  }
}

/**
 * Returns true if the given incoterm requires the SELLER to handle
 * import customs clearance (DDP only). Used by the buyer wizard + seller
 * workflow to surface the "DDP requires local fiscal representative"
 * advisory.
 */
export function incotermSellerHandlesImport(incoterm: string): boolean {
  try {
    const r = getIncotermResponsibility(incoterm);
    return r.customsImportResponsible === "SELLER";
  } catch {
    return false;
  }
}

/**
 * Returns true if the given incoterm requires the BUYER to handle
 * export customs clearance (EXW only). Used to surface the "EXW is
 * not recommended for international trade" advisory in the buyer wizard.
 */
export function incotermBuyerHandlesExport(incoterm: string): boolean {
  try {
    const r = getIncotermResponsibility(incoterm);
    return r.customsExportResponsible === "BUYER";
  } catch {
    return false;
  }
}

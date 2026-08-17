// SGTX "Why is SGTX asking me this?" — Field Explanations (CCL-004)
// =============================================================================
// Every dynamically generated or conditionally required field should have a
// small "Why?" help action that opens a concise plain-language explanation.
//
// This is a STATIC dictionary of field rationales — no complex internal logic
// is exposed. Uses plain business language.
//
// Blueprint Part 4 — Buyer Trade Request § "Why? contextual explanation"

export type FieldCategory =
  | "PRODUCT"
  | "TRANSPORT"
  | "INCOTERM"
  | "DOCUMENTATION"
  | "ACCEPTANCE"
  | "INSURANCE"
  | "SETTLEMENT"
  | "QUANTITY"
  | "DESTINATION"
  | "SCHEDULE";

export interface FieldHelpEntry {
  fieldKey: string;
  category: FieldCategory;
  shortReason: string;
  detailedReason?: string;
}

// Canonical dictionary of field explanations.
// Keyed by the form field's identifier.
export const FIELD_HELP_DICTIONARY: Record<string, FieldHelpEntry> = {
  // ── Product / Commodity ──────────────────────────────────────────────
  commodityType: {
    fieldKey: "commodityType",
    category: "PRODUCT",
    shortReason: "Determines the applicable product specifications, certificates, and handling requirements.",
    detailedReason: "SGTX uses the commodity type to load the Product Form Agent, which generates the relevant dynamic fields (temperature, grade, packaging, quality requirements) and identifies the required certificates for the destination.",
  },
  productName: {
    fieldKey: "productName",
    category: "PRODUCT",
    shortReason: "Identifies the exact product for HS code detection and customs documentation.",
  },
  hsCode: {
    fieldKey: "hsCode",
    category: "PRODUCT",
    shortReason: "The HS code determines tariffs, required certificates, and regulatory compliance for the destination country.",
    detailedReason: "The Harmonized System code is the international standard for classifying traded products. SGTX uses it to: (1) calculate customs duties, (2) determine required documents (phytosanitary, health certificates), (3) check MRL/pesticide limits, and (4) verify trade-route compliance.",
  },
  reeferTemperature: {
    fieldKey: "reeferTemperature",
    category: "PRODUCT",
    shortReason: "Required because the selected commodity requires temperature-controlled transport.",
    detailedReason: "Frozen and chilled commodities must be transported at specific temperatures to maintain quality and comply with food safety regulations. The temperature is set on the reefer container and monitored throughout transit.",
  },
  packaging: {
    fieldKey: "packaging",
    category: "PRODUCT",
    shortReason: "Affects container utilization, pallet configuration, and customs declaration.",
  },
  grade: {
    fieldKey: "grade",
    category: "ACCEPTANCE",
    shortReason: "Used by QC/inspection workflows to verify the delivered goods meet the agreed quality standard.",
  },

  // ── Transport ────────────────────────────────────────────────────────
  transportMode: {
    fieldKey: "transportMode",
    category: "TRANSPORT",
    shortReason: "Determines equipment types, transit time, cost structure, and required documents (B/L vs AWB).",
    detailedReason: "Ocean → containers and bill of lading. Air → ULDs and air waybill. Truck → trailers. Rail → wagons. Each mode has different transit times, cost structures, and document requirements.",
  },
  equipmentType: {
    fieldKey: "equipmentType",
    category: "TRANSPORT",
    shortReason: "Only relevant equipment types are shown based on your selected transport mode.",
    detailedReason: "Ocean → 20ft/40ft/40HC/reefer containers. Air → ULDs (Unit Load Devices). Truck → trailers. Rail → wagons. SGTX only shows the equipment that matches your transport mode.",
  },
  containerSize: {
    fieldKey: "containerSize",
    category: "TRANSPORT",
    shortReason: "Determines capacity, cost, and pallet configuration for ocean freight.",
  },

  // ── Incoterm ─────────────────────────────────────────────────────────
  incoterm: {
    fieldKey: "incoterm",
    category: "INCOTERM",
    shortReason: "Defines who arranges freight, insurance, and customs — and when risk transfers.",
    detailedReason: "Incoterms (International Commercial Terms) are universally recognized trade terms that define the responsibilities of buyer and seller. For example, CIF means the seller arranges freight and insurance to the destination port, while FOB means the buyer takes responsibility once goods are loaded on the vessel.",
  },
  cif_explanation: {
    fieldKey: "cif_explanation",
    category: "INCOTERM",
    shortReason: "CIF — Seller arranges the agreed freight and insurance to the destination port.",
    detailedReason: "Under CIF (Cost, Insurance, Freight), the seller pays for the ocean freight and minimum insurance to the destination port. Risk transfers to the buyer once goods are loaded on the vessel at the origin port. The buyer handles import clearance and duties.",
  },

  // ── Documentation ────────────────────────────────────────────────────
  phytoCertificate: {
    fieldKey: "phytoCertificate",
    category: "DOCUMENTATION",
    shortReason: "Required because of the selected commodity and destination.",
    detailedReason: "A Phytosanitary Certificate is required for the international trade of plants and plant products. It certifies that the goods have been inspected and are free from pests and diseases. Required by the destination country's agricultural authority.",
  },
  certificateOfOrigin: {
    fieldKey: "certificateOfOrigin",
    category: "DOCUMENTATION",
    shortReason: "Required for the selected trade route/jurisdiction to determine tariff rates and preferential treatment.",
    detailedReason: "The Certificate of Origin declares where the goods were produced. It's required for customs clearance and determines whether the goods qualify for preferential tariff rates under free trade agreements (e.g., EU-Egypt Association Agreement, Pan-Euro-Med).",
  },
  healthCertificate: {
    fieldKey: "healthCertificate",
    category: "DOCUMENTATION",
    shortReason: "Required for food/commodity imports by the destination country's health authority.",
  },
  halalCertificate: {
    fieldKey: "halalCertificate",
    category: "DOCUMENTATION",
    shortReason: "Required for food products imported into certain destinations (e.g., AE, SA, EG).",
  },
  insuranceCertificate: {
    fieldKey: "insuranceCertificate",
    category: "DOCUMENTATION",
    shortReason: "Requested because your selected commercial terms (CIF/CIP) include insurance.",
    detailedReason: "When the Incoterm is CIF or CIP, the seller is required to provide minimum insurance coverage. The Insurance Certificate evidences this coverage and is needed for claims in case of loss or damage during transit.",
  },
  commercialInvoice: {
    fieldKey: "commercialInvoice",
    category: "DOCUMENTATION",
    shortReason: "The primary trade document — required for customs clearance and payment.",
  },
  packingList: {
    fieldKey: "packingList",
    category: "DOCUMENTATION",
    shortReason: "Details the contents, weights, and packaging of each shipment — required for customs and logistics.",
  },

  // ── Acceptance Criteria ──────────────────────────────────────────────
  acceptanceCriterion: {
    fieldKey: "acceptanceCriterion",
    category: "ACCEPTANCE",
    shortReason: "Used by QC/inspection workflows to verify the delivered goods meet the agreed standard.",
    detailedReason: "Acceptance criteria define the measurable standards the goods must meet (e.g., sugar content ≥ 18%, defect rate ≤ 3%). These are used by the QC inspection team to pass or fail the shipment. Without acceptance criteria, disputes are harder to resolve.",
  },

  // ── Insurance ────────────────────────────────────────────────────────
  insuranceRequirement: {
    fieldKey: "insuranceRequirement",
    category: "INSURANCE",
    shortReason: "Requested because your selected commercial terms/requirements include insurance.",
    detailedReason: "CIF and CIP incoterms require the seller to provide insurance. For other incoterms, insurance is optional but recommended to protect against loss or damage during transit.",
  },
  insuranceResponsibleParty: {
    fieldKey: "insuranceResponsibleParty",
    category: "INSURANCE",
    shortReason: "Determined by the Incoterm — SGTX auto-configures this based on your selection.",
  },

  // ── Settlement ───────────────────────────────────────────────────────
  settlementStructure: {
    fieldKey: "settlementStructure",
    category: "SETTLEMENT",
    shortReason: "Determines how and when payment is released — affects bank instrument selection.",
    detailedReason: "Documentary Credit (LC) provides the highest security but costs more. Documentary Collection is cheaper but riskier. Open Account is simplest but offers the least protection. The choice depends on your relationship with the counterparty and the trade criticality.",
  },
  currency: {
    fieldKey: "currency",
    category: "SETTLEMENT",
    shortReason: "Affects FX exposure and the settlement amount. SGTX monitors live FX rates.",
  },

  // ── Quantity ──────────────────────────────────────────────────────────
  netWeight: {
    fieldKey: "netWeight",
    category: "QUANTITY",
    shortReason: "Determines container utilization, freight cost, and customs valuation.",
  },
  grossWeight: {
    fieldKey: "grossWeight",
    category: "QUANTITY",
    shortReason: "Used for VGM (Verified Gross Mass) compliance and container safety.",
  },

  // ── Destination ──────────────────────────────────────────────────────
  destCountry: {
    fieldKey: "destCountry",
    category: "DESTINATION",
    shortReason: "Determines import regulations, required certificates, customs duties, and sanctions checks.",
  },
  destPort: {
    fieldKey: "destPort",
    category: "DESTINATION",
    shortReason: "Affects port charges, handling, and the final delivery logistics.",
  },

  // ── Schedule ─────────────────────────────────────────────────────────
  earliestDeliveryDate: {
    fieldKey: "earliestDeliveryDate",
    category: "SCHEDULE",
    shortReason: "Defines the earliest acceptable delivery — used to match sailing schedules.",
  },
  latestDeliveryDate: {
    fieldKey: "latestDeliveryDate",
    category: "SCHEDULE",
    shortReason: "The deadline after which the trade may be cancelled or penalties apply.",
  },
  preferredDeliveryDate: {
    fieldKey: "preferredDeliveryDate",
    category: "SCHEDULE",
    shortReason: "SGTX matches this against available sailing schedules and vessel ETAs.",
  },

  // ── Special Instructions ─────────────────────────────────────────────
  specialInstructions: {
    fieldKey: "specialInstructions",
    category: "DOCUMENTATION",
    shortReason: "Optional free-text for any trade-specific requirements not captured elsewhere.",
  },
};

/**
 * Get the "Why?" explanation for a field. Returns null if no explanation
 * is registered (the field is self-explanatory or not dynamically generated).
 */
export function getFieldHelp(fieldKey: string): FieldHelpEntry | null {
  return FIELD_HELP_DICTIONARY[fieldKey] || null;
}

/**
 * Get all field explanations for a category. Used to display a category-level
 * "Why are these fields required?" panel.
 */
export function getFieldsByCategory(category: FieldCategory): FieldHelpEntry[] {
  return Object.values(FIELD_HELP_DICTIONARY).filter((e) => e.category === category);
}

/**
 * Generate a contextual "Why?" explanation for a dynamically-required document.
 * Used when the RIA/document engine adds a requirement based on commodity + destination.
 */
export function explainDocumentRequirement(
  docType: string,
  context: { hsCode?: string; destCountry?: string; incoterm?: string; coldChain?: boolean }
): string {
  const help = FIELD_HELP_DICTIONARY[docType];
  if (help) return help.shortReason;

  // Fallback: generate a contextual explanation
  const reasons: string[] = [];
  if (context.hsCode) reasons.push("the selected commodity");
  if (context.destCountry) reasons.push(`destination ${context.destCountry}`);
  if (context.incoterm) reasons.push(`Incoterm ${context.incoterm}`);
  if (context.coldChain) reasons.push("cold-chain requirements");

  if (reasons.length === 0) {
    return "Required based on your trade configuration.";
  }
  return `Required because of ${reasons.join(", ")}.`;
}

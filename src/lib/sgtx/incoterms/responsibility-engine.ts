// SGTX Central Incoterm Responsibility Engine (Blueprint §VIII.10)
// ---------------------------------------------------------------------------
// Single source of truth for Incoterms 2020 responsibility allocation.
// NOT hardcoded per-screen — every UI, fee-split, document generator, and
// Governor gate pulls from this engine so the rule set lives in ONE place.
//
// Drives:
//   • mandatory services (what MUST be procured, by whom)
//   • optional services (what MAY be procured, by whom)
//   • payer responsibility (logistics cost lines)
//   • fee responsibility (PSP split, surcharges)
//   • document requirements (who issues which transport doc)
//   • insurance obligation & responsible party
//   • customs export / import responsibility
//   • destination charges / THC responsibility
//
// Coverage: all 10 Incoterms 2020 — EXW, FCA, FOB, CFR, CIF, CPT, CIP, DAP, DPU, DDP.
//
// Per §VIII.10, CFR mandates: Trucking, Ocean Freight, Export Customs, THC.
// Per §VIII.10, CIF/CIP mandate: insurance (seller procures minimum cover).
// Per §VIII.10, DDP: seller handles import clearance + duties (max obligation).
// Per §VIII.10, DPU: seller handles unloading at destination (only Incoterm that does).

export type IncotermParty = "BUYER" | "SELLER";

export interface IncotermService {
  service: string;
  payer: IncotermParty;
}

export interface IncotermResponsibility {
  incoterm: string;
  /** Free-text description of where seller's logistics responsibility ends. */
  sellerLogisticsTo: string;
  /** Seller pays main carriage (ocean/air/land freight). */
  sellerFreight: boolean;
  /** Seller pays destination charges (destination THC, delivery drayage). */
  sellerDestCharges: boolean;
  /** Seller pays import duties (only DDP). */
  sellerDuties: boolean;
  /** Services the incoterm MANDATES for this trade (with payer). */
  mandatoryServices: IncotermService[];
  /** Services that are optional under this incoterm (with payer if procured). */
  optionalServices: IncotermService[];
  /** Insurance is mandatory under the incoterm (CIF, CIP). */
  insuranceRequired: boolean;
  /** Party responsible for procuring insurance (when applicable). */
  insuranceResponsibleParty: IncotermParty;
  /** Party responsible for export customs clearance. */
  customsExportResponsible: IncotermParty;
  /** Party responsible for import customs clearance. */
  customsImportResponsible: IncotermParty;
  /** Party responsible for destination THC (terminal handling at delivery point). */
  thcResponsible: IncotermParty;
}

// ---------------------------------------------------------------------------
// Canonical service tags. These line up with LogisticsServiceType (TRUCKING,
// OCEAN_FREIGHT, THC, INSURANCE, DESTINATION_HANDLING) plus the clearance
// services CUSTOMS_BROKERAGE_EXPORT / CUSTOMS_BROKERAGE_IMPORT which the
// existing LogisticsServiceType models as CUSTOMS_BROKERAGE; we split them
// here because Incoterm responsibility differentiates export vs import.
// ---------------------------------------------------------------------------

export const SVC_TRUCKING = "TRUCKING";
export const SVC_OCEAN_FREIGHT = "OCEAN_FREIGHT";
export const SVC_THC = "THC";
export const SVC_INSURANCE = "INSURANCE";
export const SVC_DESTINATION_HANDLING = "DESTINATION_HANDLING";
export const SVC_CUSTOMS_EXPORT = "CUSTOMS_BROKERAGE_EXPORT";
export const SVC_CUSTOMS_IMPORT = "CUSTOMS_BROKERAGE_IMPORT";
export const SVC_WAREHOUSING = "WAREHOUSING";

// ---------------------------------------------------------------------------
// The matrix. Every line is sourced from Incoterms 2020 (ICC Publication 723).
// ---------------------------------------------------------------------------

const MATRIX: Record<string, IncotermResponsibility> = {
  EXW: {
    incoterm: "EXW",
    sellerLogisticsTo: "Seller's premises (named place) — goods made available",
    sellerFreight: false,
    sellerDestCharges: false,
    sellerDuties: false,
    mandatoryServices: [
      { service: SVC_TRUCKING, payer: "BUYER" },
      { service: SVC_CUSTOMS_EXPORT, payer: "BUYER" },
      { service: SVC_CUSTOMS_IMPORT, payer: "BUYER" },
    ],
    optionalServices: [
      { service: SVC_OCEAN_FREIGHT, payer: "BUYER" },
      { service: SVC_THC, payer: "BUYER" },
      { service: SVC_INSURANCE, payer: "BUYER" },
      { service: SVC_DESTINATION_HANDLING, payer: "BUYER" },
      { service: SVC_WAREHOUSING, payer: "BUYER" },
    ],
    insuranceRequired: false,
    insuranceResponsibleParty: "BUYER",
    customsExportResponsible: "BUYER",
    customsImportResponsible: "BUYER",
    thcResponsible: "BUYER",
  },

  FCA: {
    incoterm: "FCA",
    sellerLogisticsTo: "Named place (carrier handoff at origin)",
    sellerFreight: false,
    sellerDestCharges: false,
    sellerDuties: false,
    mandatoryServices: [
      { service: SVC_TRUCKING, payer: "SELLER" }, // origin trucking to handoff
      { service: SVC_CUSTOMS_EXPORT, payer: "SELLER" },
      { service: SVC_CUSTOMS_IMPORT, payer: "BUYER" },
    ],
    optionalServices: [
      { service: SVC_OCEAN_FREIGHT, payer: "BUYER" },
      { service: SVC_THC, payer: "BUYER" },
      { service: SVC_INSURANCE, payer: "BUYER" },
      { service: SVC_DESTINATION_HANDLING, payer: "BUYER" },
    ],
    insuranceRequired: false,
    insuranceResponsibleParty: "BUYER",
    customsExportResponsible: "SELLER",
    customsImportResponsible: "BUYER",
    thcResponsible: "BUYER",
  },

  FOB: {
    incoterm: "FOB",
    sellerLogisticsTo: "On board vessel at named port of shipment",
    sellerFreight: false,
    sellerDestCharges: false,
    sellerDuties: false,
    mandatoryServices: [
      { service: SVC_TRUCKING, payer: "SELLER" }, // origin to port
      { service: SVC_CUSTOMS_EXPORT, payer: "SELLER" },
      { service: SVC_THC, payer: "SELLER" }, // origin THC (loading)
      { service: SVC_OCEAN_FREIGHT, payer: "BUYER" },
      { service: SVC_CUSTOMS_IMPORT, payer: "BUYER" },
      { service: SVC_DESTINATION_HANDLING, payer: "BUYER" },
    ],
    optionalServices: [
      { service: SVC_INSURANCE, payer: "BUYER" },
    ],
    insuranceRequired: false,
    insuranceResponsibleParty: "BUYER",
    customsExportResponsible: "SELLER",
    customsImportResponsible: "BUYER",
    thcResponsible: "BUYER", // destination THC
  },

  // §VIII.10 — CFR mandates: Trucking, Ocean Freight, Export Customs, THC (seller)
  CFR: {
    incoterm: "CFR",
    sellerLogisticsTo: "Named port of destination (risk transfers at origin on-board)",
    sellerFreight: true,
    sellerDestCharges: false,
    sellerDuties: false,
    mandatoryServices: [
      { service: SVC_TRUCKING, payer: "SELLER" },
      { service: SVC_OCEAN_FREIGHT, payer: "SELLER" },
      { service: SVC_CUSTOMS_EXPORT, payer: "SELLER" },
      { service: SVC_THC, payer: "SELLER" }, // origin THC per §VIII.10
      { service: SVC_CUSTOMS_IMPORT, payer: "BUYER" },
      { service: SVC_DESTINATION_HANDLING, payer: "BUYER" },
    ],
    optionalServices: [
      { service: SVC_INSURANCE, payer: "BUYER" },
    ],
    insuranceRequired: false,
    insuranceResponsibleParty: "BUYER",
    customsExportResponsible: "SELLER",
    customsImportResponsible: "BUYER",
    thcResponsible: "BUYER", // destination THC
  },

  // CIF = CFR + seller must procure minimum insurance (Institute Cargo Clauses (C))
  CIF: {
    incoterm: "CIF",
    sellerLogisticsTo: "Named port of destination (risk transfers at origin on-board)",
    sellerFreight: true,
    sellerDestCharges: false,
    sellerDuties: false,
    mandatoryServices: [
      { service: SVC_TRUCKING, payer: "SELLER" },
      { service: SVC_OCEAN_FREIGHT, payer: "SELLER" },
      { service: SVC_CUSTOMS_EXPORT, payer: "SELLER" },
      { service: SVC_THC, payer: "SELLER" }, // origin THC
      { service: SVC_INSURANCE, payer: "SELLER" }, // minimum cover (Clause C)
      { service: SVC_CUSTOMS_IMPORT, payer: "BUYER" },
      { service: SVC_DESTINATION_HANDLING, payer: "BUYER" },
    ],
    optionalServices: [],
    insuranceRequired: true,
    insuranceResponsibleParty: "SELLER",
    customsExportResponsible: "SELLER",
    customsImportResponsible: "BUYER",
    thcResponsible: "BUYER", // destination THC
  },

  CPT: {
    incoterm: "CPT",
    sellerLogisticsTo: "Named place of destination (carrier handoff)",
    sellerFreight: true,
    sellerDestCharges: false,
    sellerDuties: false,
    mandatoryServices: [
      { service: SVC_TRUCKING, payer: "SELLER" },
      { service: SVC_OCEAN_FREIGHT, payer: "SELLER" },
      { service: SVC_CUSTOMS_EXPORT, payer: "SELLER" },
      { service: SVC_CUSTOMS_IMPORT, payer: "BUYER" },
      { service: SVC_DESTINATION_HANDLING, payer: "BUYER" },
    ],
    optionalServices: [
      { service: SVC_THC, payer: "BUYER" },
      { service: SVC_INSURANCE, payer: "BUYER" },
    ],
    insuranceRequired: false,
    insuranceResponsibleParty: "BUYER",
    customsExportResponsible: "SELLER",
    customsImportResponsible: "BUYER",
    thcResponsible: "BUYER",
  },

  // CIP = CPT + seller must procure insurance (Institute Cargo Clauses (A) — maximum cover)
  CIP: {
    incoterm: "CIP",
    sellerLogisticsTo: "Named place of destination (carrier handoff)",
    sellerFreight: true,
    sellerDestCharges: false,
    sellerDuties: false,
    mandatoryServices: [
      { service: SVC_TRUCKING, payer: "SELLER" },
      { service: SVC_OCEAN_FREIGHT, payer: "SELLER" },
      { service: SVC_CUSTOMS_EXPORT, payer: "SELLER" },
      { service: SVC_INSURANCE, payer: "SELLER" }, // maximum cover (Clause A)
      { service: SVC_CUSTOMS_IMPORT, payer: "BUYER" },
      { service: SVC_DESTINATION_HANDLING, payer: "BUYER" },
    ],
    optionalServices: [
      { service: SVC_THC, payer: "BUYER" },
    ],
    insuranceRequired: true,
    insuranceResponsibleParty: "SELLER",
    customsExportResponsible: "SELLER",
    customsImportResponsible: "BUYER",
    thcResponsible: "BUYER",
  },

  DAP: {
    incoterm: "DAP",
    sellerLogisticsTo: "Named place of destination (ready for unloading)",
    sellerFreight: true,
    sellerDestCharges: false, // seller delivers but does NOT unload
    sellerDuties: false,
    mandatoryServices: [
      { service: SVC_TRUCKING, payer: "SELLER" }, // origin + main + destination drayage
      { service: SVC_OCEAN_FREIGHT, payer: "SELLER" },
      { service: SVC_CUSTOMS_EXPORT, payer: "SELLER" },
      { service: SVC_DESTINATION_HANDLING, payer: "SELLER" }, // delivery to place
      { service: SVC_CUSTOMS_IMPORT, payer: "BUYER" },
    ],
    optionalServices: [
      { service: SVC_INSURANCE, payer: "SELLER" },
      { service: SVC_THC, payer: "BUYER" }, // unloading THC at buyer's place
    ],
    insuranceRequired: false,
    insuranceResponsibleParty: "SELLER", // typical practice though optional
    customsExportResponsible: "SELLER",
    customsImportResponsible: "BUYER",
    thcResponsible: "BUYER",
  },

  // DPU = DAP + seller unloads (only Incoterm where seller unloads at destination)
  DPU: {
    incoterm: "DPU",
    sellerLogisticsTo: "Named place of destination (unloaded)",
    sellerFreight: true,
    sellerDestCharges: true, // includes unloading
    sellerDuties: false,
    mandatoryServices: [
      { service: SVC_TRUCKING, payer: "SELLER" },
      { service: SVC_OCEAN_FREIGHT, payer: "SELLER" },
      { service: SVC_CUSTOMS_EXPORT, payer: "SELLER" },
      { service: SVC_THC, payer: "SELLER" }, // destination THC + unloading
      { service: SVC_DESTINATION_HANDLING, payer: "SELLER" },
      { service: SVC_CUSTOMS_IMPORT, payer: "BUYER" },
    ],
    optionalServices: [
      { service: SVC_INSURANCE, payer: "SELLER" },
    ],
    insuranceRequired: false,
    insuranceResponsibleParty: "SELLER",
    customsExportResponsible: "SELLER",
    customsImportResponsible: "BUYER",
    thcResponsible: "SELLER",
  },

  // DDP = seller handles EVERYTHING including import duties (max seller obligation)
  DDP: {
    incoterm: "DDP",
    sellerLogisticsTo: "Named place of destination (cleared for import, duties paid)",
    sellerFreight: true,
    sellerDestCharges: true,
    sellerDuties: true,
    mandatoryServices: [
      { service: SVC_TRUCKING, payer: "SELLER" },
      { service: SVC_OCEAN_FREIGHT, payer: "SELLER" },
      { service: SVC_CUSTOMS_EXPORT, payer: "SELLER" },
      { service: SVC_CUSTOMS_IMPORT, payer: "SELLER" },
      { service: SVC_THC, payer: "SELLER" },
      { service: SVC_DESTINATION_HANDLING, payer: "SELLER" },
    ],
    optionalServices: [
      { service: SVC_INSURANCE, payer: "SELLER" },
    ],
    insuranceRequired: false,
    insuranceResponsibleParty: "SELLER",
    customsExportResponsible: "SELLER",
    customsImportResponsible: "SELLER",
    thcResponsible: "SELLER",
  },
};

export const SUPPORTED_INCOTERMS = Object.keys(MATRIX);

/**
 * Return the full responsibility matrix for the given incoterm.
 * Throws on unknown incoterms so callers can fail-closed rather than silently
 * treat an unrecognized code as EXW.
 */
export function getIncotermResponsibility(incoterm: string): IncotermResponsibility {
  const key = (incoterm || "").trim().toUpperCase();
  const r = MATRIX[key];
  if (!r) {
    throw new Error(
      `Unknown incoterm "${incoterm}". Supported: ${SUPPORTED_INCOTERMS.join(", ")}.`,
    );
  }
  // Return a shallow clone so callers can't mutate the canonical matrix.
  return {
    ...r,
    mandatoryServices: [...r.mandatoryServices],
    optionalServices: [...r.optionalServices],
  };
}

/**
 * Return the list of service tags that are MANDATORY for the given incoterm
 * (regardless of payer). Used by Phase 2 gate G2U18 to verify the seller has
 * priced every mandatory service line.
 */
export function getMandatoryServices(incoterm: string): string[] {
  return getIncotermResponsibility(incoterm).mandatoryServices.map((s) => s.service);
}

/**
 * Return the list of service tags that are OPTIONAL (buyer/seller may procure).
 */
export function getOptionalServices(incoterm: string): string[] {
  return getIncotermResponsibility(incoterm).optionalServices.map((s) => s.service);
}

/**
 * Validate that the supplied logistics entries cover every mandatory service
 * for the given incoterm. Each entry in `logistics` is expected to expose at
 * least one of: `serviceType`, `service`, or `type` (string tag matching the
 * SVC_* constants). Extra (non-mandatory) entries are allowed.
 *
 * Returns { valid, missing } — `missing` lists the service tags that have no
 * matching entry. `valid` is true when `missing.length === 0`.
 */
export function validateIncotermConsistency(
  incoterm: string,
  logistics: any[],
): { valid: boolean; missing: string[] } {
  const mandatory = getMandatoryServices(incoterm);
  const provided = new Set<string>();
  for (const entry of logistics || []) {
    if (!entry) continue;
    const tag =
      entry.serviceType || entry.service || entry.type || entry.serviceCode;
    if (typeof tag === "string") provided.add(tag.toUpperCase());
  }
  const missing = mandatory.filter((m) => !provided.has(m.toUpperCase()));
  return { valid: missing.length === 0, missing };
}

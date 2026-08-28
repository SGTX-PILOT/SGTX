// @ts-nocheck
/**
 * SGTX Part 26 — Incoterm Engine (machine-readable responsibilities)
 * ===========================================================================
 *
 * Returns the full machine-readable responsibility matrix for any Incoterm
 * 2020. Covers all 11 terms: EXW, FCA, CPT, CIP, DAP, DPU, DDP, FAS, FOB,
 * CFR, CIF.
 *
 * For each Incoterm, the engine returns responsibility allocations across
 * 12 dimensions, plus the risk-transfer point and the lifecycle stage each
 * responsibility belongs to:
 *
 *   cost          — who pays the main carriage
 *   risk          — who bears the risk of loss/damage
 *   transport     — who arranges the transport contract
 *   insurance     — who procures cargo insurance (mandatory in CIF/CIP)
 *   exportCustoms — who clears export customs
 *   importCustoms — who clears import customs
 *   permits       — who obtains export/import permits
 *   duties        — who pays import duties
 *   taxes         — who pays import VAT/GST
 *   documents     — who issues the transport document
 *   delivery      — where delivery takes place (and who unloads)
 *   riskTransferPoint — the precise point at which risk transfers
 *
 * Each responsibility is annotated with:
 *   party: BUYER | SELLER
 *   lifecycleStage: PRE_SHIPMENT | MAIN_CARRIAGE | DESTINATION | POST_DELIVERY
 *
 * The engine is a pure data lookup. All functions are try/catch-wrapped.
 */

import { logger } from "@/lib/sgtx/logger";

// ============ §26 Types ============

export type IncotermParty = "BUYER" | "SELLER";
export type LifecycleStage = "PRE_SHIPMENT" | "MAIN_CARRIAGE" | "DESTINATION" | "POST_DELIVERY";

export interface Responsibility {
  dimension: string;
  party: IncotermParty;
  lifecycleStage: LifecycleStage;
  notes?: string;
}

export interface IncotermResponsibilities {
  incoterm: string;
  fullName: string;
  mode: "ANY" | "SEA_INLAND_WATERWAY_ONLY" | "ANY_BUT_RECOMMENDED_FOR_SEA";
  responsibilities: Responsibility[];
  riskTransferPoint: string;
  costTransferPoint: string;
  insuranceRequired: boolean;
  insuranceResponsibleParty: IncotermParty | null;
  unloadingAtDestination: IncotermParty;
  notes: string[];
}

// ============ §26 Incoterms 2020 Database ============

const INCOTERMS_2020: Record<string, IncotermResponsibilities> = {
  EXW: {
    incoterm: "EXW",
    fullName: "Ex Works",
    mode: "ANY",
    responsibilities: [
      { dimension: "cost", party: "BUYER", lifecycleStage: "PRE_SHIPMENT", notes: "Buyer arranges & pays all transport from seller's premises" },
      { dimension: "risk", party: "BUYER", lifecycleStage: "PRE_SHIPMENT", notes: "Risk transfers at seller's premises once loaded by buyer" },
      { dimension: "transport", party: "BUYER", lifecycleStage: "MAIN_CARRIAGE" },
      { dimension: "insurance", party: "BUYER", lifecycleStage: "PRE_SHIPMENT", notes: "Optional" },
      { dimension: "exportCustoms", party: "BUYER", lifecycleStage: "PRE_SHIPMENT", notes: "Buyer must handle export clearance — often impractical" },
      { dimension: "importCustoms", party: "BUYER", lifecycleStage: "DESTINATION" },
      { dimension: "permits", party: "BUYER", lifecycleStage: "PRE_SHIPMENT" },
      { dimension: "duties", party: "BUYER", lifecycleStage: "DESTINATION" },
      { dimension: "taxes", party: "BUYER", lifecycleStage: "DESTINATION" },
      { dimension: "documents", party: "BUYER", lifecycleStage: "PRE_SHIPMENT" },
      { dimension: "delivery", party: "SELLER", lifecycleStage: "PRE_SHIPMENT", notes: "Seller makes goods available at named premises" },
      { dimension: "loadingAtSellerPremises", party: "BUYER", lifecycleStage: "PRE_SHIPMENT", notes: "Buyer loads — EXW quirk" },
    ],
    riskTransferPoint: "Seller's named premises (before loading)",
    costTransferPoint: "Seller's named premises",
    insuranceRequired: false,
    insuranceResponsibleParty: null,
    unloadingAtDestination: "BUYER",
    notes: [
      "EXW is NOT recommended for international trade — buyer cannot easily obtain export clearance in seller's country.",
      "Prefer FCA when buyer wants seller to handle export clearance.",
    ],
  },

  FCA: {
    incoterm: "FCA",
    fullName: "Free Carrier",
    mode: "ANY",
    responsibilities: [
      { dimension: "cost", party: "SELLER", lifecycleStage: "PRE_SHIPMENT", notes: "Seller pays up to delivery to carrier at named place" },
      { dimension: "risk", party: "SELLER", lifecycleStage: "PRE_SHIPMENT", notes: "Risk transfers when goods handed to carrier named by buyer" },
      { dimension: "transport", party: "BUYER", lifecycleStage: "MAIN_CARRIAGE" },
      { dimension: "insurance", party: "BUYER", lifecycleStage: "MAIN_CARRIAGE", notes: "Optional" },
      { dimension: "exportCustoms", party: "SELLER", lifecycleStage: "PRE_SHIPMENT" },
      { dimension: "importCustoms", party: "BUYER", lifecycleStage: "DESTINATION" },
      { dimension: "permits", party: "SELLER", lifecycleStage: "PRE_SHIPMENT", notes: "Export permits" },
      { dimension: "duties", party: "BUYER", lifecycleStage: "DESTINATION" },
      { dimension: "taxes", party: "BUYER", lifecycleStage: "DESTINATION" },
      { dimension: "documents", party: "SELLER", lifecycleStage: "PRE_SHIPMENT", notes: "Seller provides B/L or waybill" },
      { dimension: "delivery", party: "SELLER", lifecycleStage: "PRE_SHIPMENT" },
    ],
    riskTransferPoint: "Named place of delivery to carrier",
    costTransferPoint: "Named place of delivery to carrier",
    insuranceRequired: false,
    insuranceResponsibleParty: null,
    unloadingAtDestination: "BUYER",
    notes: [
      "Incoterms 2020 added the on-board B/L mechanism for FCA in maritime trade — buyer instructs carrier to issue on-board B/L to seller.",
    ],
  },

  CPT: {
    incoterm: "CPT",
    fullName: "Carriage Paid To",
    mode: "ANY",
    responsibilities: [
      { dimension: "cost", party: "SELLER", lifecycleStage: "MAIN_CARRIAGE", notes: "Seller pays main carriage to named destination" },
      { dimension: "risk", party: "BUYER", lifecycleStage: "PRE_SHIPMENT", notes: "Risk transfers when handed to first carrier" },
      { dimension: "transport", party: "SELLER", lifecycleStage: "MAIN_CARRIAGE" },
      { dimension: "insurance", party: "BUYER", lifecycleStage: "MAIN_CARRIAGE", notes: "Optional" },
      { dimension: "exportCustoms", party: "SELLER", lifecycleStage: "PRE_SHIPMENT" },
      { dimension: "importCustoms", party: "BUYER", lifecycleStage: "DESTINATION" },
      { dimension: "permits", party: "SELLER", lifecycleStage: "PRE_SHIPMENT" },
      { dimension: "duties", party: "BUYER", lifecycleStage: "DESTINATION" },
      { dimension: "taxes", party: "BUYER", lifecycleStage: "DESTINATION" },
      { dimension: "documents", party: "SELLER", lifecycleStage: "MAIN_CARRIAGE" },
      { dimension: "delivery", party: "SELLER", lifecycleStage: "MAIN_CARRIAGE" },
    ],
    riskTransferPoint: "When goods handed to first carrier",
    costTransferPoint: "Named place of destination",
    insuranceRequired: false,
    insuranceResponsibleParty: null,
    unloadingAtDestination: "BUYER",
    notes: ["Risk and cost split — risk transfers earlier than cost."],
  },

  CIP: {
    incoterm: "CIP",
    fullName: "Carriage and Insurance Paid To",
    mode: "ANY",
    responsibilities: [
      { dimension: "cost", party: "SELLER", lifecycleStage: "MAIN_CARRIAGE" },
      { dimension: "risk", party: "BUYER", lifecycleStage: "PRE_SHIPMENT" },
      { dimension: "transport", party: "SELLER", lifecycleStage: "MAIN_CARRIAGE" },
      { dimension: "insurance", party: "SELLER", lifecycleStage: "MAIN_CARRIAGE", notes: "Mandatory — Institute Cargo Clauses (A) per Incoterms 2020" },
      { dimension: "exportCustoms", party: "SELLER", lifecycleStage: "PRE_SHIPMENT" },
      { dimension: "importCustoms", party: "BUYER", lifecycleStage: "DESTINATION" },
      { dimension: "permits", party: "SELLER", lifecycleStage: "PRE_SHIPMENT" },
      { dimension: "duties", party: "BUYER", lifecycleStage: "DESTINATION" },
      { dimension: "taxes", party: "BUYER", lifecycleStage: "DESTINATION" },
      { dimension: "documents", party: "SELLER", lifecycleStage: "MAIN_CARRIAGE" },
      { dimension: "delivery", party: "SELLER", lifecycleStage: "MAIN_CARRIAGE" },
    ],
    riskTransferPoint: "When goods handed to first carrier",
    costTransferPoint: "Named place of destination",
    insuranceRequired: true,
    insuranceResponsibleParty: "SELLER",
    unloadingAtDestination: "BUYER",
    notes: ["Incoterms 2020 raised the default insurance to ICC (A) — all-risks."],
  },

  DAP: {
    incoterm: "DAP",
    fullName: "Delivered at Place",
    mode: "ANY",
    responsibilities: [
      { dimension: "cost", party: "SELLER", lifecycleStage: "DESTINATION", notes: "Seller pays all carriage to named destination" },
      { dimension: "risk", party: "SELLER", lifecycleStage: "DESTINATION", notes: "Risk transfers when goods at buyer's disposal on arriving conveyance" },
      { dimension: "transport", party: "SELLER", lifecycleStage: "MAIN_CARRIAGE" },
      { dimension: "insurance", party: "SELLER", lifecycleStage: "MAIN_CARRIAGE", notes: "Optional but customary" },
      { dimension: "exportCustoms", party: "SELLER", lifecycleStage: "PRE_SHIPMENT" },
      { dimension: "importCustoms", party: "BUYER", lifecycleStage: "DESTINATION" },
      { dimension: "permits", party: "BUYER", lifecycleStage: "DESTINATION", notes: "Import permits" },
      { dimension: "duties", party: "BUYER", lifecycleStage: "DESTINATION" },
      { dimension: "taxes", party: "BUYER", lifecycleStage: "DESTINATION" },
      { dimension: "documents", party: "SELLER", lifecycleStage: "MAIN_CARRIAGE" },
      { dimension: "delivery", party: "SELLER", lifecycleStage: "DESTINATION", notes: "Seller delivers ready for unloading — buyer unloads" },
    ],
    riskTransferPoint: "Named place of destination, on arriving conveyance, ready for unloading",
    costTransferPoint: "Named place of destination",
    insuranceRequired: false,
    insuranceResponsibleParty: null,
    unloadingAtDestination: "BUYER",
    notes: ["DAP — buyer handles import clearance and unloading."],
  },

  DPU: {
    incoterm: "DPU",
    fullName: "Delivered at Place Unloaded",
    mode: "ANY",
    responsibilities: [
      { dimension: "cost", party: "SELLER", lifecycleStage: "DESTINATION", notes: "Seller pays carriage AND unloading at destination" },
      { dimension: "risk", party: "SELLER", lifecycleStage: "DESTINATION", notes: "Risk transfers AFTER unloading at destination" },
      { dimension: "transport", party: "SELLER", lifecycleStage: "MAIN_CARRIAGE" },
      { dimension: "insurance", party: "SELLER", lifecycleStage: "MAIN_CARRIAGE", notes: "Optional but customary" },
      { dimension: "exportCustoms", party: "SELLER", lifecycleStage: "PRE_SHIPMENT" },
      { dimension: "importCustoms", party: "BUYER", lifecycleStage: "DESTINATION" },
      { dimension: "permits", party: "BUYER", lifecycleStage: "DESTINATION" },
      { dimension: "duties", party: "BUYER", lifecycleStage: "DESTINATION" },
      { dimension: "taxes", party: "BUYER", lifecycleStage: "DESTINATION" },
      { dimension: "documents", party: "SELLER", lifecycleStage: "MAIN_CARRIAGE" },
      { dimension: "delivery", party: "SELLER", lifecycleStage: "DESTINATION", notes: "Seller delivers AFTER unloading" },
      { dimension: "unloadingAtDestination", party: "SELLER", lifecycleStage: "DESTINATION", notes: "Only Incoterm where seller unloads" },
    ],
    riskTransferPoint: "Named place of destination, AFTER unloading",
    costTransferPoint: "Named place of destination",
    insuranceRequired: false,
    insuranceResponsibleParty: null,
    unloadingAtDestination: "SELLER",
    notes: ["DPU is the ONLY Incoterm where the seller must unload the goods at destination."],
  },

  DDP: {
    incoterm: "DDP",
    fullName: "Delivered Duty Paid",
    mode: "ANY",
    responsibilities: [
      { dimension: "cost", party: "SELLER", lifecycleStage: "DESTINATION", notes: "Maximum obligation — seller pays everything including duties" },
      { dimension: "risk", party: "SELLER", lifecycleStage: "DESTINATION", notes: "Risk transfers when goods placed at buyer's disposal, cleared for import" },
      { dimension: "transport", party: "SELLER", lifecycleStage: "MAIN_CARRIAGE" },
      { dimension: "insurance", party: "SELLER", lifecycleStage: "MAIN_CARRIAGE" },
      { dimension: "exportCustoms", party: "SELLER", lifecycleStage: "PRE_SHIPMENT" },
      { dimension: "importCustoms", party: "SELLER", lifecycleStage: "DESTINATION", notes: "Seller clears import — often requires local fiscal representative" },
      { dimension: "permits", party: "SELLER", lifecycleStage: "DESTINATION", notes: "Both export and import permits" },
      { dimension: "duties", party: "SELLER", lifecycleStage: "DESTINATION" },
      { dimension: "taxes", party: "SELLER", lifecycleStage: "DESTINATION" },
      { dimension: "documents", party: "SELLER", lifecycleStage: "MAIN_CARRIAGE" },
      { dimension: "delivery", party: "SELLER", lifecycleStage: "DESTINATION" },
    ],
    riskTransferPoint: "Named place of destination, cleared for import, NOT unloaded",
    costTransferPoint: "Named place of destination",
    insuranceRequired: false,
    insuranceResponsibleParty: null,
    unloadingAtDestination: "BUYER",
    notes: [
      "DDP is the maximum seller obligation — includes import clearance, duties, and taxes.",
      "VAT reverse-charge variants exist; some jurisdictions disallow non-resident VAT registration.",
    ],
  },

  FAS: {
    incoterm: "FAS",
    fullName: "Free Alongside Ship",
    mode: "SEA_INLAND_WATERWAY_ONLY",
    responsibilities: [
      { dimension: "cost", party: "SELLER", lifecycleStage: "PRE_SHIPMENT", notes: "Seller pays up to alongside vessel at named port" },
      { dimension: "risk", party: "SELLER", lifecycleStage: "PRE_SHIPMENT", notes: "Risk transfers when placed alongside vessel" },
      { dimension: "transport", party: "BUYER", lifecycleStage: "MAIN_CARRIAGE" },
      { dimension: "insurance", party: "BUYER", lifecycleStage: "MAIN_CARRIAGE", notes: "Optional" },
      { dimension: "exportCustoms", party: "SELLER", lifecycleStage: "PRE_SHIPMENT" },
      { dimension: "importCustoms", party: "BUYER", lifecycleStage: "DESTINATION" },
      { dimension: "permits", party: "SELLER", lifecycleStage: "PRE_SHIPMENT" },
      { dimension: "duties", party: "BUYER", lifecycleStage: "DESTINATION" },
      { dimension: "taxes", party: "BUYER", lifecycleStage: "DESTINATION" },
      { dimension: "documents", party: "SELLER", lifecycleStage: "PRE_SHIPMENT" },
      { dimension: "delivery", party: "SELLER", lifecycleStage: "PRE_SHIPMENT" },
    ],
    riskTransferPoint: "Alongside the vessel at named port of loading",
    costTransferPoint: "Alongside the vessel at named port of loading",
    insuranceRequired: false,
    insuranceResponsibleParty: null,
    unloadingAtDestination: "BUYER",
    notes: ["FAS is for sea/inland waterway only — not for containerised cargo (use FCA instead)."],
  },

  FOB: {
    incoterm: "FOB",
    fullName: "Free On Board",
    mode: "SEA_INLAND_WATERWAY_ONLY",
    responsibilities: [
      { dimension: "cost", party: "SELLER", lifecycleStage: "PRE_SHIPMENT", notes: "Seller pays up to goods on board vessel" },
      { dimension: "risk", party: "SELLER", lifecycleStage: "PRE_SHIPMENT", notes: "Risk transfers when goods on board vessel" },
      { dimension: "transport", party: "BUYER", lifecycleStage: "MAIN_CARRIAGE" },
      { dimension: "insurance", party: "BUYER", lifecycleStage: "MAIN_CARRIAGE", notes: "Optional" },
      { dimension: "exportCustoms", party: "SELLER", lifecycleStage: "PRE_SHIPMENT" },
      { dimension: "importCustoms", party: "BUYER", lifecycleStage: "DESTINATION" },
      { dimension: "permits", party: "SELLER", lifecycleStage: "PRE_SHIPMENT" },
      { dimension: "duties", party: "BUYER", lifecycleStage: "DESTINATION" },
      { dimension: "taxes", party: "BUYER", lifecycleStage: "DESTINATION" },
      { dimension: "documents", party: "SELLER", lifecycleStage: "PRE_SHIPMENT", notes: "Seller provides on-board B/L" },
      { dimension: "delivery", party: "SELLER", lifecycleStage: "PRE_SHIPMENT" },
    ],
    riskTransferPoint: "When goods placed on board the vessel at named port of loading",
    costTransferPoint: "When goods placed on board the vessel at named port of loading",
    insuranceRequired: false,
    insuranceResponsibleParty: null,
    unloadingAtDestination: "BUYER",
    notes: [
      "FOB is NOT recommended for containerised cargo — risk transfer is unclear when goods are handed to terminal before loading.",
      "Use FCA for containerised cargo.",
    ],
  },

  CFR: {
    incoterm: "CFR",
    fullName: "Cost and Freight",
    mode: "SEA_INLAND_WATERWAY_ONLY",
    responsibilities: [
      { dimension: "cost", party: "SELLER", lifecycleStage: "MAIN_CARRIAGE", notes: "Seller pays freight to named port of destination" },
      { dimension: "risk", party: "SELLER", lifecycleStage: "PRE_SHIPMENT", notes: "Risk transfers when goods on board at port of loading" },
      { dimension: "transport", party: "SELLER", lifecycleStage: "MAIN_CARRIAGE" },
      { dimension: "insurance", party: "BUYER", lifecycleStage: "MAIN_CARRIAGE", notes: "Optional" },
      { dimension: "exportCustoms", party: "SELLER", lifecycleStage: "PRE_SHIPMENT" },
      { dimension: "importCustoms", party: "BUYER", lifecycleStage: "DESTINATION" },
      { dimension: "permits", party: "SELLER", lifecycleStage: "PRE_SHIPMENT" },
      { dimension: "duties", party: "BUYER", lifecycleStage: "DESTINATION" },
      { dimension: "taxes", party: "BUYER", lifecycleStage: "DESTINATION" },
      { dimension: "documents", party: "SELLER", lifecycleStage: "MAIN_CARRIAGE", notes: "On-board B/L" },
      { dimension: "delivery", party: "SELLER", lifecycleStage: "PRE_SHIPMENT" },
    ],
    riskTransferPoint: "When goods on board the vessel at port of loading",
    costTransferPoint: "Port of destination",
    insuranceRequired: false,
    insuranceResponsibleParty: null,
    unloadingAtDestination: "BUYER",
    notes: ["Classic split: cost transfers at destination, risk transfers at loading."],
  },

  CIF: {
    incoterm: "CIF",
    fullName: "Cost, Insurance and Freight",
    mode: "SEA_INLAND_WATERWAY_ONLY",
    responsibilities: [
      { dimension: "cost", party: "SELLER", lifecycleStage: "MAIN_CARRIAGE" },
      { dimension: "risk", party: "SELLER", lifecycleStage: "PRE_SHIPMENT", notes: "Risk transfers when goods on board at port of loading" },
      { dimension: "transport", party: "SELLER", lifecycleStage: "MAIN_CARRIAGE" },
      { dimension: "insurance", party: "SELLER", lifecycleStage: "MAIN_CARRIAGE", notes: "Mandatory — Institute Cargo Clauses (C) per Incoterms 2020" },
      { dimension: "exportCustoms", party: "SELLER", lifecycleStage: "PRE_SHIPMENT" },
      { dimension: "importCustoms", party: "BUYER", lifecycleStage: "DESTINATION" },
      { dimension: "permits", party: "SELLER", lifecycleStage: "PRE_SHIPMENT" },
      { dimension: "duties", party: "BUYER", lifecycleStage: "DESTINATION" },
      { dimension: "taxes", party: "BUYER", lifecycleStage: "DESTINATION" },
      { dimension: "documents", party: "SELLER", lifecycleStage: "MAIN_CARRIAGE", notes: "On-board B/L + insurance policy/certificate" },
      { dimension: "delivery", party: "SELLER", lifecycleStage: "PRE_SHIPMENT" },
    ],
    riskTransferPoint: "When goods on board the vessel at port of loading",
    costTransferPoint: "Port of destination",
    insuranceRequired: true,
    insuranceResponsibleParty: "SELLER",
    unloadingAtDestination: "BUYER",
    notes: [
      "Incoterms 2020 keeps default insurance at ICC (C) for CIF (minimum cover) vs ICC (A) for CIP (all-risks).",
      "Buyer may need additional insurance to cover all-risks.",
    ],
  },
};

// ============ §26 Main API ============

export async function getIncotermResponsibilities(
  incoterm: string,
): Promise<IncotermResponsibilities> {
  try {
    const key = (incoterm || "").trim().toUpperCase();
    const found = INCOTERMS_2020[key];
    if (found) return found;
    logger.warn("[incoterm-engine] unknown incoterm", { incoterm });
    return {
      incoterm: key || "UNKNOWN",
      fullName: "Unknown Incoterm",
      mode: "ANY",
      responsibilities: [],
      riskTransferPoint: "",
      costTransferPoint: "",
      insuranceRequired: false,
      insuranceResponsibleParty: null,
      unloadingAtDestination: "BUYER",
      notes: [`Incoterm "${incoterm}" is not a recognised Incoterms 2020 term.`],
    };
  } catch (err: any) {
    logger.error("[incoterm-engine] getIncotermResponsibilities failed", { incoterm, error: err?.message });
    return {
      incoterm: incoterm || "UNKNOWN",
      fullName: "Unknown",
      mode: "ANY",
      responsibilities: [],
      riskTransferPoint: "",
      costTransferPoint: "",
      insuranceRequired: false,
      insuranceResponsibleParty: null,
      unloadingAtDestination: "BUYER",
      notes: ["Internal error"],
    };
  }
}

// ============ §26 Auxiliary APIs ============

export function listIncoterms(): string[] {
  return Object.keys(INCOTERMS_2020).sort();
}

export async function getIncotermByDimension(
  incoterm: string,
  dimension: string,
): Promise<Responsibility | null> {
  try {
    const r = await getIncotermResponsibilities(incoterm);
    return r.responsibilities.find((x) => x.dimension === dimension) || null;
  } catch {
    return null;
  }
}

export async function getResponsibilityByParty(
  incoterm: string,
  party: IncotermParty,
): Promise<Responsibility[]> {
  try {
    const r = await getIncotermResponsibilities(incoterm);
    return r.responsibilities.filter((x) => x.party === party);
  } catch {
    return [];
  }
}

// @ts-nocheck
/**
 * SGTX v17 Phase 2 — Incoterm × Logistics Mode Integration
 * ===========================================================================
 *
 * Integrates all 11 Incoterms 2020 with the three logistics sourcing modes
 * defined in v17 §6.3 / §VIII:
 *
 *   Mode A — Manual logistics entry (buyer or seller procures directly)
 *   Mode B — RFQ to LSPs (Request for Quotation to Logistics Service
 *            Providers via the non-marketplace provider relationship)
 *   Mode C — Direct to shipping lines (carrier-direct booking via
 *            SCAC-registered shipping-line adapters)
 *
 * Coverage: EXW, FCA, CPT, CIP, DAP, DPU, DDP, FAS, FOB, CFR, CIF.
 *
 * Per-incoterm mode behaviour:
 *   • FOB / CFR / CIF / FAS are SEA-only — they can ONLY use Mode A (with
 *     sea carrier) or Mode C (direct to shipping lines). Mode B is allowed
 *     for sea freight forwarders but the incoterm implies the ocean leg is
 *     contracted directly by the responsible party.
 *   • EXW / FCA / CPT / CIP / DAP / DPU / DDP work with ANY transport mode
 *     and ANY sourcing mode.
 *
 * The library is pure + synchronous — no DB lookups. The buyer wizard uses
 * it to constrain the transport-mode picker (Step 3) based on the incoterm
 * chosen in Step 2; the seller workflow uses it to filter the available
 * logistics providers per mode; the Governor uses it for G1U8 (transport
 * mode × incoterm compatibility) and G2U18 (mandatory services priced).
 *
 * NON-MARKETPLACE: this library never produces provider rankings or
 * recommendations. It answers the binary "is this incoterm × mode
 * combination valid?" question + lists the mandatory services the
 * responsible party must price.
 */

import {
  getIncotermResponsibility,
  SVC_TRUCKING,
  SVC_OCEAN_FREIGHT,
  SVC_THC,
  SVC_INSURANCE,
  SVC_DESTINATION_HANDLING,
  SVC_CUSTOMS_EXPORT,
  SVC_CUSTOMS_IMPORT,
  SVC_WAREHOUSING,
} from "@/lib/sgtx/incoterms/responsibility-engine";
import { logger } from "@/lib/sgtx/logger";

// ============ Types ============

export type LogisticsMode = "A" | "B" | "C";
export type TransportMode = "SEA" | "AIR" | "RAIL" | "TRUCK" | "RORO" | "MULTIMODAL";

export interface ModeService {
  /** Service tag — SVC_TRUCKING / SVC_OCEAN_FREIGHT / etc. */
  service: string;
  /** Human-readable label for the service. */
  label: string;
  /** Payer per the incoterm matrix. */
  payer: "BUYER" | "SELLER";
  /** True if the service is mandatory for this incoterm (must be priced). */
  mandatory: boolean;
}

export interface ModeServiceSet {
  /** Services that must be procured for this incoterm × mode combination. */
  mandatoryServices: ModeService[];
  /** Services that may optionally be procured. */
  optionalServices: ModeService[];
  /** Logistics mode label (Mode A / Mode B / Mode C). */
  mode: LogisticsMode;
  /** Human-readable description of the mode. */
  modeDescription: string;
}

export interface ModeCompatibility {
  compatible: boolean;
  reason?: string;
  /** Allowed transport modes for this incoterm (when compatible). */
  allowedTransportModes?: TransportMode[];
}

export interface ModeRestriction {
  /** The set of logistics modes (A, B, C) the incoterm is compatible with. */
  modes: LogisticsMode[];
  /** Transport-mode restrictions (e.g. FOB → SEA only). */
  transportModes: TransportMode[];
  /** Plain-language reason for the restriction. */
  reason: string;
}

// ============ Constants ============

/** The 4 sea-only incoterms (per Incoterms 2020). */
const SEA_ONLY_INCOTERMS = new Set(["FAS", "FOB", "CFR", "CIF"]);

/** Any-mode incoterms (work with sea, air, rail, road, multimodal). */
const ANY_MODE_INCOTERMS = new Set([
  "EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP",
]);

/** Human-readable service labels. */
export const SERVICE_LABELS: Record<string, string> = {
  [SVC_TRUCKING]: "Trucking (origin / destination drayage)",
  [SVC_OCEAN_FREIGHT]: "Ocean / main-carriage freight",
  [SVC_THC]: "Terminal Handling Charges (THC)",
  [SVC_INSURANCE]: "Cargo insurance",
  [SVC_DESTINATION_HANDLING]: "Destination handling / delivery",
  [SVC_CUSTOMS_EXPORT]: "Export customs brokerage",
  [SVC_CUSTOMS_IMPORT]: "Import customs brokerage",
  [SVC_WAREHOUSING]: "Warehousing",
};

/** Mode descriptions. */
export const MODE_DESCRIPTIONS: Record<LogisticsMode, string> = {
  A: "Mode A — Manual logistics entry. The responsible party procures each logistics service directly with their own providers. SGTX validates that all mandatory services (per incoterm) are priced but does not source providers.",
  B: "Mode B — RFQ to LSPs. The responsible party issues a Request for Quotation to their connected Logistics Service Providers. SGTX routes the RFQ through the existing provider-relationship graph (non-marketplace — no rankings or recommendations, only the binary 'your connected LSPs respond' signal).",
  C: "Mode C — Direct to shipping lines. The responsible party books directly with a SCAC-registered shipping line via the SGTX carrier adapter. Only available for ocean / Ro-Ro modes.",
};

// ============ Helpers ============

/**
 * Translate the incoterm matrix's service list into the ModeService shape
 * the UI surfaces.
 */
function toModeServices(
  services: { service: string; payer: "BUYER" | "SELLER" }[],
  mandatory: boolean,
): ModeService[] {
  return services.map((s) => ({
    service: s.service,
    label: SERVICE_LABELS[s.service] || s.service,
    payer: s.payer,
    mandatory,
  }));
}

// ============ Mode-specific service sets ============

/**
 * Mode A — Manual logistics entry.
 *
 * The responsible party enters each mandatory service line by hand. SGTX
 * validates coverage but does not source providers. Returns:
 *   • mandatoryServices — must be entered before quote submission
 *   • optionalServices — may be entered if procured
 */
export function getModeAIncotermServices(incoterm: string): ModeServiceSet {
  try {
    const r = getIncotermResponsibility(incoterm);
    return {
      mode: "A",
      modeDescription: MODE_DESCRIPTIONS.A,
      mandatoryServices: toModeServices(r.mandatoryServices, true),
      optionalServices: toModeServices(r.optionalServices, false),
    };
  } catch (err: any) {
    logger.warn("[incoterm-mode-integration] getModeAIncotermServices failed", {
      incoterm,
      error: err?.message,
    });
    return {
      mode: "A",
      modeDescription: MODE_DESCRIPTIONS.A,
      mandatoryServices: [],
      optionalServices: [],
    };
  }
}

/**
 * Mode B — RFQ to LSPs.
 *
 * The responsible party issues an RFQ to their connected LSPs. SGTX
 * surfaces the set of services for which RFQs must be issued (mandatory)
 * and for which they may optionally be issued.
 *
 * For Mode B:
 *   • rfqRequired — mandatory services the responsible party must RFQ.
 *     Filtered to the responsible party's payer perspective (the buyer
 *     doesn't RFQ for seller-paid mandatory services, and vice versa).
 *   • rfqOptional — optional services that may be RFQ'd.
 *
 * The caller passes the `perspective` ("BUYER" or "SELLER") so this
 * function returns only the services that party must / may RFQ.
 */
export function getModeBIncotermServices(
  incoterm: string,
  perspective: "BUYER" | "SELLER" = "BUYER",
): ModeServiceSet {
  try {
    const r = getIncotermResponsibility(incoterm);
    const mandatoryFiltered = r.mandatoryServices.filter((s) => s.payer === perspective);
    const optionalFiltered = r.optionalServices.filter((s) => s.payer === perspective);
    return {
      mode: "B",
      modeDescription: MODE_DESCRIPTIONS.B,
      mandatoryServices: toModeServices(mandatoryFiltered, true),
      optionalServices: toModeServices(optionalFiltered, false),
    };
  } catch (err: any) {
    logger.warn("[incoterm-mode-integration] getModeBIncotermServices failed", {
      incoterm,
      perspective,
      error: err?.message,
    });
    return {
      mode: "B",
      modeDescription: MODE_DESCRIPTIONS.B,
      mandatoryServices: [],
      optionalServices: [],
    };
  }
}

/**
 * Mode C — Direct to shipping lines.
 *
 * Only valid for ocean / Ro-Ro transport. The responsible party books
 * directly with the shipping line. The mandatory services for Mode C are
 * the ocean-freight + origin-THC + (when CIF/CIP) insurance lines.
 * Other mandatory services (e.g. trucking, customs) are still required
 * but are sourced separately via Mode A or Mode B.
 *
 *   • directRequired — services the shipping line books (ocean freight + THC)
 *   • directOptional — optional services the shipping line may bundle
 *                      (e.g. insurance when CIF/CIP — actually mandatory in
 *                      that case but flagged "direct" because the carrier
 *                      can be the insurer of last resort)
 *   • addonServices  — services the responsible party must arrange OUTSIDE
 *                      the shipping-line booking (customs, trucking,
 *                      destination handling). These are still mandatory
 *                      per the incoterm but are sourced via Mode A or B.
 */
export function getModeCIncotermServices(
  incoterm: string,
  perspective: "BUYER" | "SELLER" = "BUYER",
): {
  mode: LogisticsMode;
  modeDescription: string;
  directRequired: ModeService[];
  directOptional: ModeService[];
  addonServices: ModeService[];
} {
  try {
    const r = getIncotermResponsibility(incoterm);
    // Direct = ocean freight + origin THC + (CIF/CIP) insurance.
    const directTags = new Set([SVC_OCEAN_FREIGHT, SVC_THC, SVC_INSURANCE]);
    const directRequired = r.mandatoryServices.filter(
      (s) => directTags.has(s.service) && s.payer === perspective,
    );
    const directOptional = r.optionalServices.filter(
      (s) => directTags.has(s.service) && s.payer === perspective,
    );
    // Addon = everything else (trucking, customs, destination handling, warehousing).
    const addon = r.mandatoryServices
      .filter((s) => !directTags.has(s.service) && s.payer === perspective)
      .concat(r.optionalServices.filter((s) => !directTags.has(s.service) && s.payer === perspective));
    return {
      mode: "C",
      modeDescription: MODE_DESCRIPTIONS.C,
      directRequired: toModeServices(directRequired, true),
      directOptional: toModeServices(directOptional, true),
      addonServices: toModeServices(addon, false),
    };
  } catch (err: any) {
    logger.warn("[incoterm-mode-integration] getModeCIncotermServices failed", {
      incoterm,
      perspective,
      error: err?.message,
    });
    return {
      mode: "C",
      modeDescription: MODE_DESCRIPTIONS.C,
      directRequired: [],
      directOptional: [],
      addonServices: [],
    };
  }
}

// ============ Compatibility validation ============

/**
 * Validate that the (incoterm, logistics mode, transport mode) combination
 * is permitted.
 *
 * Rules:
 *   • Sea-only incoterms (FAS, FOB, CFR, CIF) → transportMode must be SEA
 *     or RORO (Ro-Ro ships operate on sea). Mode A, B, C are all allowed.
 *   • Any-mode incoterms → any transport mode allowed; Mode A, B, C all allowed.
 *   • Mode C (direct to shipping lines) → transportMode must be SEA or RORO.
 *   • Unknown incoterms → not compatible (caller must validate incoterm first).
 */
export function validateIncotermModeCompatibility(
  incoterm: string,
  mode: LogisticsMode | string,
  transportMode?: TransportMode | string,
): ModeCompatibility {
  const key = (incoterm || "").trim().toUpperCase();
  if (!key) {
    return { compatible: false, reason: "Incoterm is required." };
  }
  if (!ANY_MODE_INCOTERMS.has(key) && !SEA_ONLY_INCOTERMS.has(key)) {
    return {
      compatible: false,
      reason: `Unknown incoterm "${incoterm}". Supported: EXW, FCA, CPT, CIP, DAP, DPU, DDP, FAS, FOB, CFR, CIF.`,
    };
  }
  const m = String(mode || "").trim().toUpperCase() as LogisticsMode;
  if (!["A", "B", "C"].includes(m)) {
    return {
      compatible: false,
      reason: `Unknown logistics mode "${mode}". Supported: A (manual), B (RFQ to LSPs), C (direct to shipping lines).`,
    };
  }
  // Mode C is only valid for sea / Ro-Ro. Accept both "SEA" and "OCEAN" (the
  // buyer wizard uses "OCEAN" while the Incoterms 2020 spec uses "SEA").
  if (m === "C") {
    const t = String(transportMode || "").trim().toUpperCase();
    if (t && !["SEA", "OCEAN", "RORO"].includes(t)) {
      return {
        compatible: false,
        reason: `Mode C (direct to shipping lines) requires ocean / Ro-Ro transport mode. Selected: ${t || "none"}.`,
      };
    }
  }
  // Sea-only incoterms must use SEA or RORO transport mode. Accept "OCEAN"
  // as equivalent to "SEA" (the buyer wizard surfaces "OCEAN" to users).
  if (SEA_ONLY_INCOTERMS.has(key)) {
    const t = String(transportMode || "").trim().toUpperCase();
    if (t && !["SEA", "OCEAN", "RORO"].includes(t)) {
      return {
        compatible: false,
        reason: `Incoterm ${key} is sea/inland-waterway only. Selected transport mode: ${t}. Pick Ocean (SEA) or Ro-Ro (or use FCA for containerised cargo).`,
        allowedTransportModes: ["SEA", "RORO"],
      };
    }
  }
  // Compute allowed transport modes for the response.
  const allowedTransportModes: TransportMode[] = SEA_ONLY_INCOTERMS.has(key)
    ? ["SEA", "RORO"]
    : ["SEA", "AIR", "RAIL", "TRUCK", "RORO", "MULTIMODAL"];
  return { compatible: true, allowedTransportModes };
}

/**
 * Get the (logistics-mode, transport-mode) restrictions for an incoterm.
 *
 * Returns:
 *   • modes — which logistics modes (A, B, C) are permitted
 *   • transportModes — which transport modes are permitted
 *   • reason — plain-language explanation
 *
 * Used by the buyer wizard Step 2 to constrain Step 3 (transport mode)
 * and the Mode picker, and by the seller workflow to filter provider lists.
 */
export function getIncotermModeRestrictions(incoterm: string): ModeRestriction {
  const key = (incoterm || "").trim().toUpperCase();
  if (!key) {
    return {
      modes: [],
      transportModes: [],
      reason: "Incoterm is required.",
    };
  }
  if (!ANY_MODE_INCOTERMS.has(key) && !SEA_ONLY_INCOTERMS.has(key)) {
    return {
      modes: [],
      transportModes: [],
      reason: `Unknown incoterm "${incoterm}".`,
    };
  }
  const isSeaOnly = SEA_ONLY_INCOTERMS.has(key);
  // All incoterms allow Modes A + B. Mode C (direct to shipping lines) is
  // allowed for SEA-only incoterms (FOB/CFR/CIF/FAS) and for any-mode
  // incoterms WHEN the user explicitly chooses ocean transport.
  // We surface Mode C as available for all incoterms; the actual transport-mode
  // constraint (Mode C requires SEA/RORO) is enforced by validateIncotermModeCompatibility.
  const modes: LogisticsMode[] = ["A", "B", "C"];
  const transportModes: TransportMode[] = isSeaOnly
    ? ["SEA", "RORO"]
    : ["SEA", "AIR", "RAIL", "TRUCK", "RORO", "MULTIMODAL"];
  const reason = isSeaOnly
    ? `Incoterm ${key} is sea/inland-waterway only per Incoterms 2020. Use FCA for containerised cargo if you need air/rail/road/multimodal.`
    : `Incoterm ${key} works with any transport mode (sea, air, rail, road, Ro-Ro, multimodal).`;
  return { modes, transportModes, reason };
}

// ============ Convenience exports ============

/**
 * Returns the union of mandatory + optional service tags for the given
 * incoterm × logistics mode combination. Used by the Governor's G2U18 gate
 * to verify the seller has priced all mandatory services.
 */
export function getIncotermServicesForMode(
  incoterm: string,
  mode: LogisticsMode,
  perspective: "BUYER" | "SELLER" = "SELLER",
): ModeServiceSet {
  if (mode === "A") return getModeAIncotermServices(incoterm);
  if (mode === "B") return getModeBIncotermServices(incoterm, perspective);
  // Mode C — return as ModeServiceSet with addon services as optional.
  const c = getModeCIncotermServices(incoterm, perspective);
  return {
    mode: c.mode,
    modeDescription: c.modeDescription,
    mandatoryServices: c.directRequired,
    optionalServices: [...c.directOptional, ...c.addonServices],
  };
}

/**
 * Returns the list of all 11 Incoterms 2020 with their mode restrictions.
 * Used by the buyer wizard to populate the incoterm picker with helpful
 * tooltips.
 */
export function listAllIncotermModeRestrictions(): {
  incoterm: string;
  restrictions: ModeRestriction;
}[] {
  const all = ["EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP", "FAS", "FOB", "CFR", "CIF"];
  return all.map((i) => ({
    incoterm: i,
    restrictions: getIncotermModeRestrictions(i),
  }));
}

// @ts-nocheck
/**
 * SGTX v17 §20 — Controlled Goods Engine
 * ===========================================================================
 *
 * Identifies whether a (HS code, origin, dest) combination is a CONTROLLED
 * GOOD (dual-use, military, nuclear, chemical precursors, biological agents).
 *
 * Categories covered:
 *   - DUAL_USE — civil goods that could have military application
 *     (Wassenaar Arrangement, EU Reg 2021/821 Annex I/II/IV, US EAR CCATS)
 *   - MILITARY — weapons, ammunition, military vehicles (US ITAR, EU Common
 *     Military List, Wassenaar Munitions List)
 *   - NUCLEAR — nuclear materials + enrichment equipment (NSG, IAEA INFCIRC/254)
 *   - CHEMICAL — chemical weapons precursors (Australia Group, CWC Schedules 1-3)
 *   - BIOLOGICAL — biological agents + delivery systems (Australia Group, BWC)
 *
 * Reference:
 *   - Wassenaar Arrangement Control Lists (PL, ML, dual-use categories)
 *   - EU Reg 2021/821 (Dual-Use Regulation) — Annexes I/II/IV
 *   - US Export Administration Regulations (EAR) Commerce Control List
 *   - US International Traffic in Arms Regulations (ITAR) — USML
 *   - Australia Group Chemical/Biological Weapons Precursors
 *   - Nuclear Suppliers Group (NSG) Part 1/2
 *   - Chemical Weapons Convention (CWC) Schedules 1-3
 */

import { logger } from "@/lib/sgtx/logger";

// ── Types ────────────────────────────────────────────────────────────────

export type ControlType = "DUAL_USE" | "MILITARY" | "NUCLEAR" | "CHEMICAL" | "BIOLOGICAL" | "NONE";

export interface ControlledGoodsResult {
  hsCode: string;
  originCountry: string;
  destCountry: string;
  controlled: boolean;
  controlType: ControlType;
  authority: string | null;
  licenceRequired: boolean;
  endUserStatementRequired: boolean;
  catchAllClauseApplies: boolean;
  notes: string;
}

export interface ControlledGoodsLicenseValidation {
  licenseNumber: string;
  hsCode: string;
  valid: boolean;
  scope: string[];
  conditions: string[];
  errors: string[];
}

// ── Controlled goods reference ──────────────────────────────────────────
// Format: `${hsChapter}` → ControlRule (applies regardless of origin/dest)

interface ControlRule {
  controlType: ControlType;
  authority: string;
  licenceRequired: boolean;
  endUserStatementRequired: boolean;
  catchAllClauseApplies: boolean;
  notes: string;
  scopeKeywords: string[]; // additional keyword refinement
}

const CONTROL_RULES: Record<number, ControlRule[]> = {
  // Chapter 28 — Inorganic chemicals (some dual-use + chemical precursors)
  28: [
    { controlType: "CHEMICAL", authority: "Australia Group + CWC Schedule 2/3", licenceRequired: true, endUserStatementRequired: true, catchAllClauseApplies: true, notes: "Chemical weapons precursors (e.g. thiodiglycol, phosphorus trichloride) — CWC Schedule 2/3 + Australia Group control.", scopeKeywords: ["thiodiglycol", "phosphorus trichloride", "sodium fluoride", "potassium fluoride", "dimethyl methylphosphonate"] },
    { controlType: "DUAL_USE", authority: "EU Reg 2021/821 Annex I / US EAR Cat 1", licenceRequired: true, endUserStatementRequired: true, catchAllClauseApplies: true, notes: "Some inorganic chemicals are dual-use (e.g. chemical warfare agent precursors).", scopeKeywords: ["fluoride", "sulphur", "chloride"] },
  ],
  // Chapter 29 — Organic chemicals (CWC Schedule 1-3 + Australia Group)
  29: [
    { controlType: "CHEMICAL", authority: "CWC Schedule 1 + Australia Group", licenceRequired: true, endUserStatementRequired: true, catchAllClauseApplies: true, notes: "CWC Schedule 1 chemical weapons agents + precursors (e.g. sarin precursor isopropyl alcohol + methylphosphonyl difluoride).", scopeKeywords: ["methylphosphonyl", "isopropyl methylphosphonofluoridate", "dimethyl methylphosphonate", "diisopropyl methylphosphonate"] },
    { controlType: "DUAL_USE", authority: "EU Reg 2021/821 Annex I Cat 1", licenceRequired: true, endUserStatementRequired: true, catchAllClauseApplies: true, notes: "Organic chemicals with dual-use potential (e.g. precursor to nerve agents).", scopeKeywords: ["phosphonate", "phosphorofluoridate"] },
  ],
  // Chapter 30 — Pharmaceuticals (some dual-use + biological agents)
  30: [
    { controlType: "BIOLOGICAL", authority: "Australia Group + EU Reg 2021/821 Cat 1", licenceRequired: true, endUserStatementRequired: true, catchAllClauseApplies: true, notes: "Human + animal pathogens + toxins (e.g. botulinum toxin, ricin, mycotoxins) are controlled by the Australia Group.", scopeKeywords: ["botulinum", "ricin", "saxitoxin", "tetrodotoxin", "microcystin", "aflatoxin"] },
    { controlType: "DUAL_USE", authority: "EU Reg 2021/821 Annex I Cat 1", licenceRequired: true, endUserStatementRequired: true, catchAllClauseApplies: true, notes: "Some pharmaceuticals are dual-use (e.g. adrenaline + atropine as CWA antidotes).", scopeKeywords: ["atropine", "adrenaline", "pralidoxime"] },
  ],
  // Chapter 36 — Explosives (Wassenaar ML7 + dual-use)
  36: [
    { controlType: "DUAL_USE", authority: "Wassenaar PL7 + EU Reg 2021/821 Annex I Cat 3", licenceRequired: true, endUserStatementRequired: true, catchAllClauseApplies: true, notes: "Commercial explosives + detonators are dual-use (Wassenaar PL7 / ML7).", scopeKeywords: ["explosive", "detonator", "primer", "cord", "ammunition"] },
    { controlType: "MILITARY", authority: "EU Common Military List ML7", licenceRequired: true, endUserStatementRequired: true, catchAllClauseApplies: false, notes: "Military ammunition + propellants are ML7.", scopeKeywords: ["warhead", "propellant", "smokeless powder"] },
  ],
  // Chapter 84 — Industrial machinery (some dual-use — e.g. CNC machine tools, isostatic presses)
  84: [
    { controlType: "DUAL_USE", authority: "Wassenaar PL1 + EU Reg 2021/821 Annex I Cat 1/2", licenceRequired: true, endUserStatementRequired: true, catchAllClauseApplies: true, notes: "CNC machine tools (≥ 5-axis), isostatic presses, filament winding machines — dual-use for missile + aerospace production.", scopeKeywords: ["cnc", "5-axis", "isostatic", "filament winding", "numerical control"] },
  ],
  // Chapter 85 — Electronics + telecommunications (dual-use — e.g. high-performance computing, crypto)
  85: [
    { controlType: "DUAL_USE", authority: "Wassenaar PL4/5 + EU Reg 2021/821 Annex I Cat 4/5", licenceRequired: true, endUserStatementRequired: true, catchAllClauseApplies: true, notes: "High-performance computing (>0.5 TFLOPS), cryptography, microwave amplifiers, frequency converters, telecom interception — controlled by Wassenaar + EU + US EAR.", scopeKeywords: ["supercomputer", "tflops", "cryptography", "quantum", "microwave", "frequency converter", "dsp", "fpga", "asic", "gaas", "gan", "hbt"] },
  ],
  // Chapter 87 — Vehicles (military variants)
  87: [
    { controlType: "MILITARY", authority: "EU Common Military List ML6", licenceRequired: true, endUserStatementRequired: true, catchAllClauseApplies: true, notes: "Armored vehicles, tanks, military trucks, amphibious vehicles — ML6.", scopeKeywords: ["armored", "tank", "armoured", "amphibious", "military truck", "apc", "ifv"] },
    { controlType: "DUAL_USE", authority: "Wassenaar ML6 + EU Reg 2021/821 Annex I Cat 8", licenceRequired: true, endUserStatementRequired: true, catchAllClauseApplies: true, notes: "Off-road vehicles + agricultural tractors designed for military use.", scopeKeywords: ["off-road", "all-terrain", "agricultural tractor", "military"] },
  ],
  // Chapter 88 — Aircraft (military + dual-use UAV)
  88: [
    { controlType: "MILITARY", authority: "EU Common Military List ML10", licenceRequired: true, endUserStatementRequired: true, catchAllClauseApplies: true, notes: "Military aircraft, helicopters, UAVs (drones), spacecraft — ML10.", scopeKeywords: ["military aircraft", "fighter", "bomber", "uav", "drone", "unmanned aerial"] },
    { controlType: "DUAL_USE", authority: "Wassenaar PL9 + EU Reg 2021/821 Annex I Cat 9", licenceRequired: true, endUserStatementRequired: true, catchAllClauseApplies: true, notes: "Aerospace components + materials (gas turbine engines, composites, flight control systems) — dual-use.", scopeKeywords: ["gas turbine", "turbine engine", "composite", "flight control", "avionics", "fly-by-wire"] },
  ],
  // Chapter 90 — Optical/instruments (some dual-use + nuclear)
  90: [
    { controlType: "DUAL_USE", authority: "Wassenaar PL6 + EU Reg 2021/821 Annex I Cat 6", licenceRequired: true, endUserStatementRequired: true, catchAllClauseApplies: true, notes: "Inertial navigation systems, gyros, accelerometers, IR detectors, space-grade optics — dual-use.", scopeKeywords: ["inertial navigation", "imu", "gyroscope", "accelerometer", "focal plane array", "infrared detector", "space-graded", "radiation-hardened"] },
    { controlType: "NUCLEAR", authority: "NSG Part 1/2 + EU Reg 2021/821 Annex I Cat 0", licenceRequired: true, endUserStatementRequired: true, catchAllClauseApplies: true, notes: "Nuclear-grade instruments (e.g. neutron detectors, radiation-hardened cameras, maraging steel for centrifuge rotors).", scopeKeywords: ["neutron detector", "radiation-hardened", "maraging steel", "centrifuge rotor", "high-speed spindle"] },
  ],
  // Chapter 93 — Arms and ammunition (military — full chapter)
  93: [
    { controlType: "MILITARY", authority: "EU Common Military List ML1-3 + USML", licenceRequired: true, endUserStatementRequired: true, catchAllClauseApplies: true, notes: "Military firearms, artillery, ammunition, bombs, torpedoes, missiles — ML1-3 / USML Categories I-IV.", scopeKeywords: ["rifle", "pistol", "machine gun", "artillery", "missile", "torpedo", "grenade", "rocket", "bomb"] },
  ],
  // Chapter 28/29 nuclear materials (already covered in 28/29 above)
};

// ── License number format reference ─────────────────────────────────────

interface ControlLicenseFormat {
  pattern: RegExp;
  authority: string;
  scope: ControlType[];
  conditions: string[];
}

const CONTROL_LICENSE_FORMATS: ControlLicenseFormat[] = [
  { pattern: /^EU-DUAL-\d{4,12}$/i, authority: "BAFA / national EU authority", scope: ["DUAL_USE"], conditions: ["End-User Certificate (EUC) required", "Re-export authorisation required for re-export to third countries"] },
  { pattern: /^US-EAR-\d{4,12}$/i, authority: "US BIS (Bureau of Industry and Security)", scope: ["DUAL_USE"], conditions: ["End-User Statement required", "Visa etc. for some destinations"] },
  { pattern: /^US-ITAR-\d{4,12}$/i, authority: "US DDTC (Directorate of Defense Trade Controls)", scope: ["MILITARY"], conditions: ["DSP-5/73/85 license required", "Technical Assistance Agreement (TAA) for defense services"] },
  { pattern: /^EU-ML-\d{4,12}$/i, authority: "National export control authority (EU)", scope: ["MILITARY"], conditions: ["End-User Certificate required", "International Import Certificate from importing country"] },
  { pattern: /^NSG-\d{4,12}$/i, authority: "NSG national authority", scope: ["NUCLEAR"], conditions: ["IAEA safeguards required", "Physical protection required"] },
  { pattern: /^CWC-\d{4,12}$/i, authority: "OPCW national authority", scope: ["CHEMICAL"], conditions: ["End-Use Statement required", "National declaration required for Schedule 2/3"] },
  { pattern: /^AG-\d{4,12}$/i, authority: "Australia Group national authority", scope: ["CHEMICAL", "BIOLOGICAL"], conditions: ["End-User Certificate required", "Catch-all clause may apply"] },
];

// ── Helpers ─────────────────────────────────────────────────────────────

function chapterOf(hs?: string): number | null {
  const n = parseInt((hs ?? "").slice(0, 2), 10);
  return Number.isFinite(n) && n >= 1 && n <= 97 ? n : null;
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Check whether a (HS code, origin, dest) combination is a controlled good.
 * Returns the control type + authority + whether a license is required +
 * whether the "catch-all" clause applies (additional scrutiny for sensitive
 * end-users / end-uses, even if the item itself is not on the control list).
 *
 * For enhanced detection, pass an optional `productName` keyword to refine
 * the chapter-level rules (e.g. "CNC machine tool" matches the dual-use
 * rule for chapter 84).
 */
export function checkControlledGoods(
  hsCode: string,
  originCountry: string,
  destCountry: string,
  productName?: string,
): ControlledGoodsResult {
  const hs = String(hsCode ?? "").trim();
  const ch = chapterOf(hs);
  const origin = (originCountry ?? "").toUpperCase().trim();
  const dest = (destCountry ?? "").toUpperCase().trim();
  const name = String(productName ?? "").toLowerCase().trim();

  if (!ch) {
    return {
      hsCode: hs, originCountry: origin, destCountry: dest,
      controlled: false, controlType: "NONE", authority: null,
      licenceRequired: false, endUserStatementRequired: false,
      catchAllClauseApplies: false,
      notes: "Invalid HS code — cannot determine chapter.",
    };
  }

  const rules = CONTROL_RULES[ch] ?? [];
  if (rules.length === 0) {
    return {
      hsCode: hs, originCountry: origin, destCountry: dest,
      controlled: false, controlType: "NONE", authority: null,
      licenceRequired: false, endUserStatementRequired: false,
      catchAllClauseApplies: false,
      notes: `HS chapter ${ch} is not on the controlled-goods reference list.`,
    };
  }

  // Pick the rule whose keywords match the product name (or the first rule)
  let matched: ControlRule | null = null;
  if (name) {
    matched = rules.find((r) => r.scopeKeywords.some((k) => name.includes(k))) ?? null;
  }
  if (!matched) matched = rules[0];

  return {
    hsCode: hs, originCountry: origin, destCountry: dest,
    controlled: true, controlType: matched.controlType, authority: matched.authority,
    licenceRequired: matched.licenceRequired,
    endUserStatementRequired: matched.endUserStatementRequired,
    catchAllClauseApplies: matched.catchAllClauseApplies,
    notes: matched.notes,
  };
}

/**
 * Validate a controlled-goods export/import license number. Returns whether
 * the format matches an issuing authority's scheme + the conditions the
 * license holder must comply with (end-user statement, re-export
 * authorisation, etc.).
 */
export function validateControlledGoodsLicense(
  licenseNumber: string,
  hsCode: string,
): ControlledGoodsLicenseValidation {
  const num = String(licenseNumber ?? "").trim();
  const hs = String(hsCode ?? "").trim();

  if (!num) {
    return {
      licenseNumber: num, hsCode: hs, valid: false, scope: [], conditions: [],
      errors: ["License number is empty."],
    };
  }

  const fmt = CONTROL_LICENSE_FORMATS.find((f) => f.pattern.test(num));
  if (!fmt) {
    return {
      licenseNumber: num, hsCode: hs, valid: false, scope: [], conditions: [],
      errors: [
        `License number "${num}" does not match any known export control authority format. Expected formats: EU-DUAL-*, US-EAR-*, US-ITAR-*, EU-ML-*, NSG-*, CWC-*, AG-*`,
      ],
    };
  }

  return {
    licenseNumber: num, hsCode: hs, valid: true,
    scope: fmt.scope, conditions: fmt.conditions,
    errors: [],
  };
}

export function listAllControlRules(): Array<{ hsChapter: number; controlType: ControlType; authority: string; notes: string }> {
  const out: Array<{ hsChapter: number; controlType: ControlType; authority: string; notes: string }> = [];
  for (const [ch, rules] of Object.entries(CONTROL_RULES)) {
    for (const r of rules) {
      out.push({
        hsChapter: Number(ch),
        controlType: r.controlType,
        authority: r.authority,
        notes: r.notes,
      });
    }
  }
  return out;
}

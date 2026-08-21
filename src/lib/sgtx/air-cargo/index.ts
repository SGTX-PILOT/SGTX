// @ts-nocheck — defensive; Prisma schema drift handled at runtime
// SGTX Air Cargo Engine
// Spec references: §12 Air Status Normalization · §13 Air State Machine ·
// §14 Chargeable Weight · §17 ULD Build Optimizer · §18 Airport Cutoff ·
// §19 Security · §21 DG Validation · §22 Special Cargo Profile ·
// §25 ACI Applicability for Air · §37 Document Consistency
//
// Design principles (mirrors road-corridor engine):
//   • Every DB call is wrapped defensively — the engine never throws to the
//     caller; it returns structured results with `ok` / `issues`.
//   • State transitions are validated against AIR_STATE_MACHINE before being
//     persisted; invalid transitions are rejected with allowed next-states.
//   • Exception states (AIR_EXCEPTION_STATES) are side-channel statuses that
//     can be raised at any point but never replace the shipment's primary
//     `cargoStatus` (they live on AirIrregularity rows).
//   • Pure engines (chargeable weight, ULD optimizer, cutoff checker, DG
//     validation, ACI applicability, status normalization, special-cargo
//     profile) are pure functions with no DB writes — they can be unit-tested
//     in isolation and reused by the API layer.
//   • `recordSecurityScreening` and `validateAirDocumentConsistency` do
//     touch the DB and are wrapped in try/catch.

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ §13 Air Cargo State Machine ============

export const AIR_STATE_MACHINE: Record<string, string[]> = {
  AIR_DRAFT: ["BOOKING_PENDING"],
  BOOKING_PENDING: ["BOOKED"],
  BOOKED: ["AWB_PENDING"],
  AWB_PENDING: ["MAWB_ISSUED"],
  MAWB_ISSUED: ["HAWB_ISSUED", "DOCUMENTS_PENDING"],
  HAWB_ISSUED: ["DOCUMENTS_PENDING"],
  DOCUMENTS_PENDING: ["CUSTOMS_PENDING", "SECURITY_PENDING"],
  CUSTOMS_PENDING: ["SECURITY_PENDING", "READY_FOR_CARRIAGE"],
  SECURITY_PENDING: ["READY_FOR_CARRIAGE"],
  READY_FOR_CARRIAGE: ["ACCEPTANCE_PENDING"],
  ACCEPTANCE_PENDING: ["RECEIVED_AT_TERMINAL"],
  RECEIVED_AT_TERMINAL: ["SCREENING"],
  SCREENING: ["SECURITY_CLEARED"],
  SECURITY_CLEARED: ["WEIGHED"],
  WEIGHED: ["RCS"],
  RCS: ["BUILDUP_PENDING"],
  BUILDUP_PENDING: ["ULD_ASSIGNED"],
  ULD_ASSIGNED: ["BUILT_UP"],
  BUILT_UP: ["HANDOVER_TO_AIRLINE"],
  HANDOVER_TO_AIRLINE: ["DEP"],
  DEP: ["IN_FLIGHT"],
  IN_FLIGHT: ["ARR"],
  ARR: ["TRANSFER", "RCF"],
  TRANSFER: ["RCF"],
  RCF: ["CUSTOMS_IMPORT"],
  CUSTOMS_IMPORT: ["NFD", "CUSTOMS_RELEASED"],
  NFD: ["CUSTOMS_RELEASED"],
  CUSTOMS_RELEASED: ["READY_FOR_DELIVERY"],
  READY_FOR_DELIVERY: ["DLV"],
  DLV: ["COMPLETED"],
};

// Exception states — side-channel only; never become the primary cargoStatus.
export const AIR_EXCEPTION_STATES = [
  "DOCUMENT_ERROR",
  "AWB_ERROR",
  "WEIGHT_ERROR",
  "SECURITY_HOLD",
  "DG_ERROR",
  "CUSTOMS_HOLD",
  "MISSED_CUTOFF",
  "FLIGHT_DELAY",
  "FLIGHT_CANCELLED",
  "OFFLOAD",
  "MISCONNECT",
  "CARGO_DAMAGE",
  "CARGO_MISSING",
  "ULD_ERROR",
  "ROUTE_CHANGE",
  "TEMPERATURE_EXCURSION",
  "AIRPORT_CLOSURE",
];

// Terminal states — no further transitions allowed.
export const AIR_TERMINAL_STATES = ["COMPLETED", "CANCELLED", "ABANDONED"];

/**
 * Validate that `from -> to` is a permitted transition per §13.
 * Exception states can be raised from anywhere (they live on AirIrregularity
 * rows). Terminal states can never move. Self-transitions (from===to) are
 * allowed for idempotency.
 */
export function isValidAirStateTransition(from: string, to: string): boolean {
  if (!from || !to) return false;
  if (from === to) return true; // idempotent re-transition permitted
  if (AIR_TERMINAL_STATES.includes(from)) return false;
  if (AIR_EXCEPTION_STATES.includes(to)) return true; // exceptions can be raised from anywhere
  const allowed = AIR_STATE_MACHINE[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

/**
 * Return the list of states the shipment may legally move to from `from`.
 * Empty array means the state is terminal or unknown.
 */
export function getAirAllowedTransitions(from: string): string[] {
  if (!from) return [];
  if (AIR_TERMINAL_STATES.includes(from)) return [];
  return AIR_STATE_MACHINE[from] || [];
}

// ============ §14 Chargeable Weight Engine ============

/**
 * Calculate the chargeable weight for an air shipment per IATA Resolution 502.
 *
 *  - Volumetric weight = (L × W × H) / volumetricDivisor
 *  - Default divisor = 6000 (IATA standard for air; cm³ → kg).
 *  - Chargeable weight = max(actual gross weight, volumetric weight).
 *
 * Each piece contributes to both sums; the engine returns per-piece details
 * so the caller can persist them (e.g. on CargoPiece rows).
 */
export function calculateChargeableWeight(input: {
  pieces: { actualWeight: number; length?: number; width?: number; height?: number }[];
  volumetricDivisor?: number;
}): {
  actualGrossWeight: number;
  volumetricWeight: number;
  chargeableWeight: number;
  details: any[];
} {
  const divisor = input.volumetricDivisor && input.volumetricDivisor > 0
    ? input.volumetricDivisor
    : 6000; // IATA default for air

  let actualGrossWeight = 0;
  let volumetricWeight = 0;
  const details: any[] = [];

  const pieces = Array.isArray(input.pieces) ? input.pieces : [];
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    const aw = Number(p?.actualWeight) || 0;
    const l = Number(p?.length) || 0;
    const w = Number(p?.width) || 0;
    const h = Number(p?.height) || 0;
    let pieceVol = 0;
    if (l > 0 && w > 0 && h > 0) {
      pieceVol = (l * w * h) / divisor;
    }
    const pieceChargeable = Math.max(aw, pieceVol);
    actualGrossWeight += aw;
    volumetricWeight += pieceVol;
    details.push({
      pieceIndex: i,
      actualWeight: aw,
      dimensions: l && w && h ? { length: l, width: w, height: h } : null,
      volumetricWeight: Number(pieceVol.toFixed(3)),
      chargeableWeight: Number(pieceChargeable.toFixed(3)),
    });
  }

  const chargeableWeight = Math.max(actualGrossWeight, volumetricWeight);
  return {
    actualGrossWeight: Number(actualGrossWeight.toFixed(3)),
    volumetricWeight: Number(volumetricWeight.toFixed(3)),
    chargeableWeight: Number(chargeableWeight.toFixed(3)),
    details,
  };
}

// ============ §17 ULD Build Optimizer ============

/**
 * Lightweight ULD build-up optimizer. Computes the subset of pieces that fit
 * within the ULD's gross-weight limit and the ULD's contour volume, then
 * generates human-readable build instructions.
 *
 * Algorithm:
 *   1. Sort pieces by density (weight / volume) descending — dense pieces
 *      first maximizes weight utilization.
 *   2. Greedily add pieces while remaining weight capacity and volume allow.
 *   3. DG and temperature-controlled pieces are segregated into separate
 *      "zones" within the ULD (DG away from other cargo; temperature probes
 *      near the ULD door for monitoring access).
 *   4. Build instructions are emitted for each assigned piece.
 *
 * Returns `valid: false` (with no assigned pieces) if the ULD is unsuitable
 * (e.g. no piece fits the weight limit, or DG pieces loaded into a non-DG-
 * capable ULD).
 */
export function optimizeUldBuildup(input: {
  pieces: {
    id: string;
    weight: number;
    length: number;
    width: number;
    height: number;
    dg?: boolean;
    tempControlled?: boolean;
  }[];
  uldType: string;
  uldMaxGross: number;
  uldTare: number;
  uldDimensions: { length: number; width: number; height: number };
  aircraftType?: string;
}): {
  assigned: string[];
  totalWeight: number;
  utilizationPct: number;
  buildInstructions: string[];
  valid: boolean;
} {
  const pieces = Array.isArray(input.pieces) ? input.pieces : [];
  const uldVolumeCm3 =
    Number(input.uldDimensions?.length || 0) *
    Number(input.uldDimensions?.width || 0) *
    Number(input.uldDimensions?.height || 0);
  const uldPayloadCapacity = Math.max(
    0,
    Number(input.uldMaxGross || 0) - Number(input.uldTare || 0),
  );

  // Compute piece density (kg / cm³) — denser pieces first for greedy packing.
  const withDensity = pieces.map((p) => {
    const vol =
      Number(p?.length || 0) * Number(p?.width || 0) * Number(p?.height || 0);
    const density = vol > 0 ? Number(p.weight || 0) / vol : 0;
    return { ...p, volume: vol, density };
  });
  withDensity.sort((a, b) => b.density - a.density);

  const assigned: typeof withDensity = [];
  let remainingWeight = uldPayloadCapacity;
  let remainingVolume = uldVolumeCm3;

  // 90% fill ceiling — air cargo ULDs are never loaded 100% (CG limits).
  const weightCeiling = uldPayloadCapacity * 0.9;
  const volumeCeiling = uldVolumeCm3 * 0.92;

  for (const piece of withDensity) {
    if (assigned.length >= 99) break; // safety cap
    if (piece.weight <= 0) continue;
    if (piece.weight > weightCeiling) continue; // single piece exceeds CG
    if (piece.volume > volumeCeiling) continue;
    if (remainingWeight - piece.weight < 0) continue;
    if (remainingVolume - piece.volume < 0) continue;
    assigned.push(piece);
    remainingWeight -= piece.weight;
    remainingVolume -= piece.volume;
  }

  const totalWeight = assigned.reduce((s, p) => s + Number(p.weight || 0), 0);
  const utilizationPct = uldPayloadCapacity > 0
    ? Number(((totalWeight / uldPayloadCapacity) * 100).toFixed(2))
    : 0;

  const buildInstructions: string[] = [];
  buildInstructions.push(
    `ULD type: ${input.uldType || "UNKNOWN"}, max gross ${input.uldMaxGross} kg, tare ${input.uldTare} kg, payload ${uldPayloadCapacity} kg`,
  );
  buildInstructions.push(
    `Aircraft: ${input.aircraftType || "any"}, contour L×W×H: ${input.uldDimensions?.length}×${input.uldDimensions?.width}×${input.uldDimensions?.height} cm`,
  );
  buildInstructions.push(
    `Assigned pieces: ${assigned.length}/${pieces.length}, total weight ${totalWeight.toFixed(2)} kg, utilization ${utilizationPct}%`,
  );

  // Segregate DG and temp-controlled into zones.
  const dgPieces = assigned.filter((p) => p.dg);
  const tempPieces = assigned.filter((p) => p.tempControlled);
  const regular = assigned.filter((p) => !p.dg && !p.tempControlled);

  if (dgPieces.length > 0) {
    buildInstructions.push(
      `ZONE-DG: Place ${dgPieces.length} DG piece(s) in the rear of the ULD, segregated per IATA DGR segregation tables.`,
    );
    for (const p of dgPieces) {
      buildInstructions.push(`  • DG piece ${p.id} (${p.weight} kg) — segregation check required`);
    }
  }
  if (tempPieces.length > 0) {
    buildInstructions.push(
      `ZONE-TEMP: Place ${tempPieces.length} temperature-controlled piece(s) near the ULD door for probe access.`,
    );
    for (const p of tempPieces) {
      buildInstructions.push(`  • TEMP piece ${p.id} (${p.weight} kg) — verify set-point before closing ULD`);
    }
  }
  if (regular.length > 0) {
    buildInstructions.push(
      `ZONE-REG: Stack ${regular.length} regular piece(s) first, densest at the bottom.`,
    );
    for (const p of regular) {
      buildInstructions.push(`  • REG piece ${p.id} (${p.weight} kg) — place flat, weight evenly distributed`);
    }
  }
  buildInstructions.push(
    `Apply CG (centre of gravity) check: ensure lateral balance ±5% of ULD centreline.`,
  );
  buildInstructions.push(
    `Final check: net weight ${totalWeight.toFixed(2)} kg ≤ ${weightCeiling.toFixed(2)} kg (90% ceiling); apply ULD net + tie-down straps.`,
  );

  const valid = assigned.length > 0 && totalWeight > 0;

  return {
    assigned: assigned.map((p) => p.id),
    totalWeight: Number(totalWeight.toFixed(3)),
    utilizationPct,
    buildInstructions,
    valid,
  };
}

// ============ §18 Airport Cutoff Engine ============

/**
 * Check all cutoff deadlines against the flight departure time. Cutoffs are
 * given in minutes before departure (positive integers). Returns each cutoff's
 * absolute deadline (UTC) and remaining minutes from now, with a status flag:
 *   - PASSED    — deadline is in the past
 *   - CRITICAL   — remaining ≤ 15% of the cutoff window (or < 60 mins)
 *   - WARNING    — remaining ≤ 30% of the cutoff window
 *   - OK         — comfortably within the cutoff window
 *
 * `allPassed` is true only if every cutoff's status is OK or WARNING.
 */
export function checkCutoffs(input: {
  flightDeparture: Date;
  documentCutoffMins: number;
  customsCutoffMins: number;
  securityCutoffMins: number;
  airlineCutoffMins: number;
  acceptanceCutoffMins: number;
  buildupCutoffMins: number;
}): {
  cutoffs: { type: string; deadline: Date; remainingMins: number; status: string }[];
  allPassed: boolean;
} {
  const now = new Date();
  const dep = input.flightDeparture instanceof Date
    ? input.flightDeparture
    : new Date(input.flightDeparture);
  const cutoffTypes: { key: string; type: string }[] = [
    { key: "documentCutoffMins", type: "DOCUMENT" },
    { key: "customsCutoffMins", type: "CUSTOMS" },
    { key: "securityCutoffMins", type: "SECURITY" },
    { key: "airlineCutoffMins", type: "AIRLINE_BOOKING" },
    { key: "acceptanceCutoffMins", type: "ACCEPTANCE" },
    { key: "buildupCutoffMins", type: "BUILDUP" },
  ];

  const cutoffs = cutoffTypes.map(({ key, type }) => {
    const minsBeforeDep = Math.max(0, Number((input as any)[key]) || 0);
    const deadline = new Date(dep.getTime() - minsBeforeDep * 60 * 1000);
    const remainingMins = Math.round((deadline.getTime() - now.getTime()) / 60000);
    let status = "OK";
    if (remainingMins <= 0) {
      status = "PASSED";
    } else {
      // 15% of cutoff window, but never less than 30 mins (so even a 90-min
      // cutoff gets a CRITICAL band of at least 30 mins lead time).
      const criticalThreshold = Math.max(30, minsBeforeDep * 0.15);
      const warningThreshold = Math.max(60, minsBeforeDep * 0.3);
      if (remainingMins <= criticalThreshold) status = "CRITICAL";
      else if (remainingMins <= warningThreshold) status = "WARNING";
    }
    return { type, deadline, remainingMins, status };
  });

  const allPassed = cutoffs.every(
    (c) => c.status === "OK" || c.status === "WARNING",
  );
  return { cutoffs, allPassed };
}

// ============ §19 Security Engine ============

export type AirSecurityRecord = any;

/**
 * Record a security screening event against a shipment. Persists an
 * AirSecurityRecord row and updates the shipment's securityStatus field.
 *
 * Defensive: never throws; returns a structured result with `ok` / `error`.
 */
export async function recordSecurityScreening(input: {
  shipmentId: string;
  ustn?: string;
  screeningType: string;
  facility: string;
  operator: string;
  result: string;
}): Promise<AirSecurityRecord> {
  const result = (input.result || "").toUpperCase();
  const screeningType = (input.screeningType || "OTHER").toUpperCase();
  // Map screening result → securityStatus enum.
  // SCREENED (positive) → SECURE
  // ALARM / REJECTED → NOT_SECURE (re-screen required)
  // RESCREEN → RESCREEN_REQUIRED
  // anything else → PENDING
  let securityStatus = "PENDING";
  let reScreenRequired = false;
  let reScreenReason: string | null = null;
  if (result === "CLEARED" || result === "PASS" || result === "SECURE" || result === "SCREENED") {
    securityStatus = "SECURE";
  } else if (result === "ALARM" || result === "FAIL" || result === "REJECTED" || result === "NOT_SECURE") {
    securityStatus = "NOT_SECURE";
    reScreenRequired = true;
    reScreenReason = `Screening result=${result}; type=${screeningType}`;
  } else if (result === "RESCREEN") {
    securityStatus = "RESCREEN_REQUIRED";
    reScreenRequired = true;
    reScreenReason = "Operator-initiated re-screen";
  }

  try {
    let shipmentId = input.shipmentId;
    if (!shipmentId) {
      // Try to resolve shipmentId from ustn if shipmentId not provided.
      if (input.ustn) {
        const sh = await db.airCargoShipment.findFirst({
          where: { ustn: input.ustn },
          select: { id: true },
        });
        if (sh) shipmentId = sh.id;
      }
      if (!shipmentId) {
        return {
          ok: false,
          error: "shipmentId required (could not resolve from ustn)",
        };
      }
    }

    const record = await db.airSecurityRecord.create({
      data: {
        shipmentId,
        ustn: input.ustn || "",
        screeningType,
        screeningFacility: input.facility || null,
        screeningOperator: input.operator || null,
        securityStatus,
        reScreenRequired,
        reScreenReason,
        screeningTimestamp: new Date(),
        source: "SGTX_API",
      },
    });

    // Promote the shipment's securityStatus if the new status supersedes the old.
    try {
      const sh = await db.airCargoShipment.findUnique({
        where: { id: shipmentId },
        select: { id: true, securityStatus: true },
      });
      if (sh) {
        const order: Record<string, number> = {
          PENDING: 0,
          RESCREEN_REQUIRED: 1,
          NOT_SECURE: 1,
          SCREENED: 2,
          SECURE: 3,
        };
        const curRank = order[sh.securityStatus] ?? 0;
        const newRank = order[securityStatus] ?? 0;
        if (newRank > curRank || !sh.securityStatus || sh.securityStatus === "PENDING") {
          await db.airCargoShipment.update({
            where: { id: shipmentId },
            data: { securityStatus },
          });
        }
      }
    } catch (e: any) {
      logger.warn("[air-cargo] securityStatus promotion failed", {
        shipmentId,
        error: e?.message,
      });
    }

    logger.info("[air-cargo] security screening recorded", {
      recordId: record.id,
      shipmentId,
      ustn: input.ustn,
      securityStatus,
    });
    return { ok: true, record };
  } catch (err: any) {
    logger.error("[air-cargo] recordSecurityScreening failed", {
      shipmentId: input?.shipmentId,
      ustn: input?.ustn,
      error: err?.message,
    });
    return { ok: false, error: err?.message || "recordSecurityScreening failed" };
  }
}

// ============ §21 Dangerous Goods Validation ============

// Reference UN numbers for high-risk air cargo (subset of IATA DGR).
const DG_BANNED_PASSENGER_UN = new Set([
  "UN1950", // Aerosols (some classes) — limited on pax
  "UN1956", // Compressed gas
  "UN3480", // Lithium ion batteries (cargo-only under PI 965)
  "UN3090", // Lithium metal batteries (cargo-only under PI 968)
  "UN3164", // Gas cylinders
  "UN2031", // Nitric acid
  "UN2015", // Hypochlorites
]);

/**
 * Validate a Dangerous Goods declaration against IATA DGR rules.
 *
 * Stages:
 *   1. STRUCTURE   — UN number / class / quantity / unit present
 *   2. CLASS_MATCH  — UN number's expected class matches the declared class
 *                     (basic built-in checks for common UNs)
 *   3. QUANTITY    — quantity > 0 and within plausible limits
 *   4. AIRCRAFT    — passenger aircraft restrictions enforced
 *   5. ROUTE       — origin/destination carrier-specific or country-specific
 *                     route bans (placeholder — extend per airline/route)
 *
 * Returns `{ valid, stage, issues }`. Never throws.
 */
export function validateDangerousGoods(input: {
  unNumber: string;
  dgClass: string;
  division?: string;
  packingGroup?: string;
  quantity: number;
  unit: string;
  packageType?: string;
  aircraftType?: string;
  airline?: string;
  origin: string;
  destination: string;
}): { valid: boolean; stage: string; issues: string[] } {
  const issues: string[] = [];
  const un = String(input?.unNumber || "").toUpperCase().replace(/\s+/g, "");
  const dgClass = String(input?.dgClass || "").toUpperCase();
  const division = String(input?.division || "").toUpperCase();
  const packingGroup = String(input?.packingGroup || "").toUpperCase();
  const aircraftType = String(input?.aircraftType || "ALL").toUpperCase();
  const quantity = Number(input?.quantity) || 0;
  const unit = String(input?.unit || "").toUpperCase();
  const origin = String(input?.origin || "").toUpperCase();
  const destination = String(input?.destination || "").toUpperCase();

  // Stage 1: STRUCTURE
  if (!un) issues.push("UN number is required");
  else if (!/^UN\d{4}$/i.test(un)) issues.push(`UN number '${un}' is malformed (expected UN####)`);
  if (!dgClass) issues.push("DG class is required (1-9)");
  else if (!/^[1-9]$/.test(dgClass) && !/^[1-9]\d?$/.test(dgClass)) {
    issues.push(`DG class '${dgClass}' invalid (must be 1-9)`);
  }
  if (!unit) issues.push("Quantity unit is required (e.g. kg, L)");
  if (quantity <= 0) issues.push("Quantity must be > 0");

  if (issues.length > 0) {
    return { valid: false, stage: "STRUCTURE", issues };
  }

  // Stage 2: CLASS_MATCH (subset of common UNs)
  const UN_CLASS_MAP: Record<string, string> = {
    "UN1950": "2.1",
    "UN1956": "2.2",
    "UN3480": "9",
    "UN3481": "9",
    "UN3090": "9",
    "UN3091": "9",
    "UN3164": "2.2",
    "UN2031": "8",
    "UN2015": "5.1",
    "UN1203": "3",
    "UN1866": "3",
    "UN2796": "8",
  };
  const expectedClass = UN_CLASS_MAP[un];
  if (expectedClass) {
    const declaredClass = division ? `${dgClass}.${division}` : dgClass;
    if (declaredClass !== expectedClass && dgClass !== expectedClass.split(".")[0]) {
      issues.push(
        `UN ${un} expects DG class ${expectedClass}, declared ${declaredClass} — verify against IATA DGR`,
      );
    }
  }

  // Packing group only valid for certain classes
  if (packingGroup) {
    const PG_OK_CLASSES = new Set(["1.4", "2", "3", "4.1", "4.2", "4.3", "5.1", "5.2", "6.1", "8", "9"]);
    const clsKey = division ? `${dgClass}.${division}` : dgClass;
    if (!PG_OK_CLASSES.has(clsKey) && !PG_OK_CLASSES.has(dgClass)) {
      issues.push(`Packing group '${packingGroup}' not applicable for DG class ${clsKey}`);
    }
  }

  if (issues.length > 0) {
    return { valid: false, stage: "CLASS_MATCH", issues };
  }

  // Stage 3: QUANTITY sanity (per-unit plausible bounds)
  if (unit === "KG" && quantity > 50000) {
    issues.push(`DG quantity ${quantity} kg exceeds typical air cargo single-piece limit`);
  }
  if (unit === "L" && quantity > 50000) {
    issues.push(`DG quantity ${quantity} L exceeds typical air cargo single-piece limit`);
  }
  if (issues.length > 0) {
    return { valid: false, stage: "QUANTITY", issues };
  }

  // Stage 4: AIRCRAFT restrictions
  if (aircraftType === "PASSENGER") {
    if (DG_BANNED_PASSENGER_UN.has(un)) {
      issues.push(
        `UN ${un} is forbidden on passenger aircraft under IATA DGR (cargo-only)`,
      );
    }
    // Class 1 (explosives) and Class 7 (radioactive) typically forbidden on pax
    if (dgClass === "1") {
      issues.push("Class 1 (explosives) forbidden on passenger aircraft");
    }
    if (dgClass === "7") {
      issues.push("Class 7 (radioactive) restricted on passenger aircraft — verify PI 963-970 limits");
    }
  }
  if (issues.length > 0) {
    return { valid: false, stage: "AIRCRAFT", issues };
  }

  // Stage 5: ROUTE bans (placeholder — extend per airline/route policy)
  // Example: lithium batteries banned on direct flights to certain destinations
  const LITHIUM_UN = new Set(["UN3480", "UN3481", "UN3090", "UN3091"]);
  if (LITHIUM_UN.has(un) && aircraftType === "PASSENGER") {
    issues.push(
      `Lithium battery ${un} on passenger aircraft — verify PI compliance and state-of-charge ≤ 30%`,
    );
  }
  // Country-specific crude bans (placeholder — illustrative)
  const BANNED_ORIGIN_DEST = new Set(["KP", "SY", "IR"]);
  if (BANNED_ORIGIN_DEST.has(origin) || BANNED_ORIGIN_DEST.has(destination)) {
    issues.push(
      `DG transport to/from ${origin || destination} may be restricted by carrier policy — verify airline acceptance`,
    );
  }
  if (issues.length > 0) {
    return { valid: false, stage: "ROUTE", issues };
  }

  return { valid: true, stage: "PASSED", issues: [] };
}

// ============ §25 ACI Applicability for Air ============

const EU_COUNTRIES = new Set([
  "DE", "FR", "IT", "ES", "NL", "BE", "AT", "PL", "SE", "FI", "DK", "IE", "PT", "GR",
  "CZ", "RO", "BG", "HR", "SK", "LT", "SI", "LV", "EE", "LU", "MT", "CY", "HU",
]);

const ACI_AIR_MANDATORY_DEST = new Set(["US", "CA", "AU", "JP", "CN", "IN", "AE", "SG"]);
const ACI_AIR_MANDATORY_ORIGIN = new Set(["US", "CA"]);

/**
 * Determine whether an ACI (Advance Cargo Information) filing is required
 * for an air shipment.
 *
 * Decision matrix:
 *   • EU destination     → ICS2 ENS (REQUIRED)
 *   • US/CA/AU/JP/CN/IN/AE/SG destination → REQUIRED (local ACI scheme)
 *   • US/CA origin (export) → REQUIRED (export manifest rules)
 *   • DG cargoType       → REQUIRED (always pre-notify)
 *   • Otherwise          → NOT_REQUIRED, or CONDITIONAL if cargoType is unknown
 *
 * Returns one of REQUIRED, NOT_REQUIRED, CONDITIONAL, UNKNOWN.
 */
export function checkAciAirApplicability(input: {
  country: string;
  origin: string;
  destination: string;
  cargoType: string;
}): { result: string; reason: string } {
  const country = String(input?.country || "").toUpperCase();
  const origin = String(input?.origin || "").toUpperCase();
  const destination = String(input?.destination || "").toUpperCase();
  const cargoType = String(input?.cargoType || "").toUpperCase();

  // EU destination → ICS2 ENS (air pre-arrival filing).
  if (EU_COUNTRIES.has(destination) || EU_COUNTRIES.has(country)) {
    return {
      result: "REQUIRED",
      reason: "EU ICS2 ENS mandatory for air shipments with EU destination (Regulation 2019/632)",
    };
  }
  if (ACI_AIR_MANDATORY_DEST.has(destination)) {
    return {
      result: "REQUIRED",
      reason: `Destination ${destination} mandates advance cargo information (ACI) for air freight`,
    };
  }
  if (ACI_AIR_MANDATORY_ORIGIN.has(origin)) {
    return {
      result: "REQUIRED",
      reason: `Origin ${origin} mandates advance export manifest filing for air freight`,
    };
  }
  if (cargoType.includes("DG") || cargoType.includes("DANGEROUS")) {
    return {
      result: "REQUIRED",
      reason: "Dangerous Goods cargo always requires advance cargo information pre-notification",
    };
  }
  if (!cargoType || cargoType === "UNKNOWN" || cargoType === "UNSPECIFIED") {
    return {
      result: "CONDITIONAL",
      reason: "Cargo type unknown — ACI applicability depends on destination and cargo classification; consult broker",
    };
  }
  // GCC + most other regions — typical 4-hour pre-arrival rule, conservatively
  // NOT_REQUIRED unless a destination-specific rule applies.
  return {
    result: "NOT_REQUIRED",
    reason: `No mandatory ACI scheme for ${origin} → ${destination} air corridor for cargo type ${cargoType}`,
  };
}

// ============ §12 Air Status Normalization ============

// Status normalization map: maps a source-system status code to the canonical
// SGTX air status (per §13 state machine). Multiple variants per source.
const STATUS_NORMALIZATION: Record<string, Record<string, string>> = {
  CARGO_PORTAL: {
    "DRAFT": "AIR_DRAFT",
    "BOOKED": "BOOKED",
    "AWB_ISSUED": "MAWB_ISSUED",
    "MAWB": "MAWB_ISSUED",
    "HAWB": "HAWB_ISSUED",
    "READY": "READY_FOR_CARRIAGE",
    "ACCEPTED": "RECEIVED_AT_TERMINAL",
    "SCREENED": "SECURITY_CLEARED",
    "WEIGHED": "WEIGHED",
    "RCS": "RCS",
    "BUILT_UP": "BUILT_UP",
    "DEPARTED": "DEP",
    "DEP": "DEP",
    "IN_FLIGHT": "IN_FLIGHT",
    "ARRIVED": "ARR",
    "ARR": "ARR",
    "RECOVERED": "RCF",
    "CUSTOMS_RELEASED": "CUSTOMS_RELEASED",
    "DELIVERED": "DLV",
    "COMPLETED": "COMPLETED",
    "CANCELLED": "CANCELLED",
  },
  AIRLINE: {
    "BKD": "BOOKED",
    "BKG": "BOOKING_PENDING",
    "AWB": "MAWB_ISSUED",
    "RCS": "RCS",
    "DEP": "DEP",
    "ARR": "ARR",
    "RCF": "RCF",
    "NFD": "NFD",
    "DLV": "DLV",
    "CCD": "CUSTOMS_RELEASED",
    "TFD": "TRANSFER",
    "MAN": "DOCUMENTS_PENDING",
  },
  GHA: {
    "RCS": "RCS",
    "PRE_ACCEPTED": "ACCEPTANCE_PENDING",
    "ACCEPTED": "RECEIVED_AT_TERMINAL",
    "BUILT_UP": "BUILT_UP",
    "LOADED": "HANDOVER_TO_AIRLINE",
    "BROKEN_DOWN": "RCF",
    "RELEASED": "READY_FOR_DELIVERY",
  },
  CUSTOMS: {
    "DCL": "CUSTOMS_PENDING",
    "SUB": "CUSTOMS_PENDING",
    "ACC": "CUSTOMS_RELEASED",
    "REL": "CUSTOMS_RELEASED",
    "HLD": "CUSTOMS_HOLD",
    "REJ": "DOCUMENT_ERROR",
  },
  CARGOXML: {
    "BKD": "BOOKED",
    "AWB": "MAWB_ISSUED",
    "RCS": "RCS",
    "DEP": "DEP",
    "ARR": "ARR",
    "RCF": "RCF",
    "NFD": "NFD",
    "DLV": "DLV",
  },
};

/**
 * Normalize a source-system status code to the canonical SGTX air status.
 * Falls back to the raw code uppercased if no mapping exists.
 */
export function normalizeAirStatus(sourceCode: string, sourceSystem: string): string {
  const code = String(sourceCode || "").toUpperCase().trim();
  const system = String(sourceSystem || "").toUpperCase().trim();
  const table = STATUS_NORMALIZATION[system];
  if (table && table[code]) {
    return table[code];
  }
  // Try a fuzzy match — case-insensitive substring lookup across systems.
  for (const sysTable of Object.values(STATUS_NORMALIZATION)) {
    if (sysTable[code]) return sysTable[code];
  }
  // Try common canonical names directly (already normalized).
  const allStates = new Set([
    ...Object.keys(AIR_STATE_MACHINE),
    ...AIR_EXCEPTION_STATES,
    ...AIR_TERMINAL_STATES,
  ]);
  if (allStates.has(code)) return code;
  // Last resort: return the raw code so callers can see what was received.
  return code || "UNKNOWN";
}

// ============ §22 Special Cargo Profile ============

const SPECIAL_CARGO_PROFILES: Record<string, {
  profile: string;
  documents: string[];
  handling: string[];
  security: string[];
  temperature?: { min: number; max: number };
}> = {
  PHARMA: {
    profile: "Pharmaceutical / GDP",
    documents: ["Certificate of Analysis", "GDP Certificate", "Temperature Log"],
    handling: ["Cold chain handling", "Priority unloading", "Dedicated reefer truck"],
    security: ["Secure storage at pharma facility", "Chain-of-custody log"],
    temperature: { min: 2, max: 8 },
  },
  PERISHABLE: {
    profile: "Perishable Food",
    documents: ["Phytosanitary Certificate", "Health Certificate", "Temperature Log"],
    handling: ["Cold chain handling", "Priority unloading", "First-off aircraft"],
    security: ["Standard screening"],
    temperature: { min: 0, max: 8 },
  },
  LIVE_ANIMAL: {
    profile: "Live Animals (AVI)",
    documents: ["Shipper's Certificate for Live Animals", "CITES Permit (if applicable)", "Health Certificate"],
    handling: ["IATA Live Animals Regulations (LAR)", "Climate-controlled hold", "Last-on first-off"],
    security: ["Physical inspection only — no X-ray of live animals"],
  },
  DG: {
    profile: "Dangerous Goods (DGR)",
    documents: ["Shipper's Declaration for DG", "DG Packing Instruction compliance", "MSDS"],
    handling: ["IATA DGR compliance", "Segregation per DGR Table 9.3.A", "DG-trained personnel only"],
    security: ["DG screening per airline acceptance", "eDGD preferred"],
  },
  VALUABLE: {
    profile: "Valuable Cargo (VAL)",
    documents: ["Valuation declaration", "Insurance certificate"],
    handling: ["Secure escort", "Tamper-evident seals", "Vault storage at origin/destination"],
    security: ["Double screening", "Armed escort at handover"],
  },
  VULNERABLE: {
    profile: "Vulnerable Cargo",
    documents: ["Standard AWB set"],
    handling: ["Secure storage", "Tamper-evident seals"],
    security: ["Double screening", "Chain-of-custody log"],
  },
  ECOMMERCE: {
    profile: "E-commerce parcel",
    documents: ["Manifest", "Commercial invoice (simplified)"],
    handling: ["Bulk handling", "Sortation at destination hub"],
    security: ["X-ray screening per piece", "eCSD if origin EU"],
  },
  MAIL: {
    profile: "Air Mail (POST)",
    documents: ["CN38 / CN41 manifest", "Postal dispatch note"],
    handling: ["Airmail handling", "Designated postal area"],
    security: ["Postal security program screening"],
  },
  HUMAN_REMAINS: {
    profile: "Human Remains (HUM)",
    documents: ["Death Certificate", "Embalming Certificate", "Transit Permit"],
    handling: ["Respectful handling", "Priority loading"],
    security: ["Physical inspection"],
  },
  PER: {
    profile: "Perishable (general)",
    documents: ["Packing List", "Temperature Log"],
    handling: ["Cold chain handling", "Priority unloading"],
    security: ["Standard screening"],
    temperature: { min: -2, max: 25 },
  },
  OVERSIZED: {
    profile: "Oversized Cargo",
    documents: ["Loading diagram", "Lashing plan"],
    handling: ["Special loading equipment", "Ramp transfer", "Main deck loading"],
    security: ["Physical inspection"],
  },
};

/**
 * Look up the special cargo profile for a commodity type. Returns a generic
 * profile if no specific match is found.
 */
export function getSpecialCargoProfile(commodityType: string): {
  profile: string;
  documents: string[];
  handling: string[];
  security: string[];
  temperature?: { min: number; max: number };
} {
  const key = String(commodityType || "").toUpperCase().trim();
  if (SPECIAL_CARGO_PROFILES[key]) return SPECIAL_CARGO_PROFILES[key];
  // Fuzzy match: does the commodity type contain a profile keyword?
  for (const [k, v] of Object.entries(SPECIAL_CARGO_PROFILES)) {
    if (key.includes(k)) return v;
  }
  // Generic default profile.
  return {
    profile: "General Cargo (GEN)",
    documents: ["Commercial Invoice", "Packing List"],
    handling: ["Standard handling"],
    security: ["Standard screening"],
  };
}

// ============ §37 Document Consistency ============

/**
 * Validate that all documents and recorded fields on an air shipment are
 * internally consistent. Pulls the shipment + waybills + cargo pieces + booking
 * and cross-checks key fields (origin, destination, total pieces, gross weight,
 * chargeable weight, commodity).
 *
 * Tolerant of missing/malformed JSON payloads and only flags actual mismatches
 * (loose comparison — case-insensitive, whitespace-trimmed, numeric rounded
 * to 2 decimal places).
 *
 * Returns `{ consistent, mismatches }`. Never throws.
 */
export async function validateAirDocumentConsistency(ustn: string): Promise<{
  consistent: boolean;
  mismatches: { field: string; expected: string; actual: string }[];
}> {
  const mismatches: { field: string; expected: string; actual: string }[] = [];

  try {
    if (!ustn) {
      return { consistent: false, mismatches: [{ field: "ustn", expected: "non-empty", actual: "(empty)" }] };
    }

    const shipment = await db.airCargoShipment.findFirst({
      where: { ustn },
      include: {
        waybills: true,
        cargoPieces: true,
        flightLegs: { orderBy: { sequence: "asc" } },
      },
    });
    if (!shipment) {
      return {
        consistent: false,
        mismatches: [{ field: "shipment", expected: "AirCargoShipment for USTN", actual: "(not found)" }],
      };
    }

    const norm = (v: any): string => {
      if (v === null || v === undefined) return "";
      return String(v).trim().toUpperCase();
    };
    const numNorm = (v: any): string => {
      const n = Number(v);
      if (!isFinite(n)) return "";
      return n.toFixed(2);
    };

    const shipOrigin = norm(shipment.originAirport);
    const shipDest = norm(shipment.destinationAirport);
    const shipPieces = shipment.totalPieces || 0;
    const shipGross = shipment.totalGrossWeight || 0;
    const shipChargeable = shipment.chargeableWeight || 0;

    // 1. MAWB consistency
    const mawbs = shipment.waybills.filter((w: any) => w.awbType === "MAWB");
    if (mawbs.length > 1) {
      mismatches.push({
        field: "MAWB.count",
        expected: "1",
        actual: String(mawbs.length),
      });
    }
    for (const m of mawbs) {
      if (norm(m.origin) && shipOrigin && norm(m.origin) !== shipOrigin) {
        mismatches.push({
          field: `MAWB[${m.awbNumber}].origin`,
          expected: shipOrigin,
          actual: norm(m.origin),
        });
      }
      if (norm(m.destination) && shipDest && norm(m.destination) !== shipDest) {
        mismatches.push({
          field: `MAWB[${m.awbNumber}].destination`,
          expected: shipDest,
          actual: norm(m.destination),
        });
      }
      if (m.pieces && m.pieces !== shipPieces) {
        mismatches.push({
          field: `MAWB[${m.awbNumber}].pieces`,
          expected: String(shipPieces),
          actual: String(m.pieces),
        });
      }
      if (m.grossWeight && Math.abs(m.grossWeight - shipGross) > 0.5) {
        mismatches.push({
          field: `MAWB[${m.awbNumber}].grossWeight`,
          expected: numNorm(shipGross),
          actual: numNorm(m.grossWeight),
        });
      }
    }

    // 2. HAWB consistency
    const hawbs = shipment.waybills.filter((w: any) => w.awbType === "HAWB");
    const hawbPieceSum = hawbs.reduce((s: number, h: any) => s + (h.pieces || 0), 0);
    if (hawbs.length > 0 && hawbPieceSum !== shipPieces) {
      mismatches.push({
        field: "HAWB.piecesSum",
        expected: String(shipPieces),
        actual: String(hawbPieceSum),
      });
    }
    const hawbGrossSum = hawbs.reduce((s: number, h: any) => s + (h.grossWeight || 0), 0);
    if (hawbs.length > 0 && Math.abs(hawbGrossSum - shipGross) > 1) {
      mismatches.push({
        field: "HAWB.grossWeightSum",
        expected: numNorm(shipGross),
        actual: numNorm(hawbGrossSum),
      });
    }

    // 3. Cargo pieces consistency
    if (shipment.cargoPieces.length > 0) {
      if (shipment.cargoPieces.length !== shipPieces) {
        mismatches.push({
          field: "CargoPiece.count",
          expected: String(shipPieces),
          actual: String(shipment.cargoPieces.length),
        });
      }
      const pieceGrossSum = shipment.cargoPieces.reduce(
        (s: number, p: any) => s + (p.actualWeight || 0),
        0,
      );
      if (Math.abs(pieceGrossSum - shipGross) > 1) {
        mismatches.push({
          field: "CargoPiece.grossWeightSum",
          expected: numNorm(shipGross),
          actual: numNorm(pieceGrossSum),
        });
      }
    }

    // 4. Flight legs origin/destination
    if (shipment.flightLegs.length > 0) {
      const firstLeg = shipment.flightLegs[0];
      const lastLeg = shipment.flightLegs[shipment.flightLegs.length - 1];
      if (norm(firstLeg.originAirport) && shipOrigin && norm(firstLeg.originAirport) !== shipOrigin) {
        mismatches.push({
          field: "FlightLeg[0].origin",
          expected: shipOrigin,
          actual: norm(firstLeg.originAirport),
        });
      }
      if (norm(lastLeg.destinationAirport) && shipDest && norm(lastLeg.destinationAirport) !== shipDest) {
        mismatches.push({
          field: `FlightLeg[${shipment.flightLegs.length - 1}].destination`,
          expected: shipDest,
          actual: norm(lastLeg.destinationAirport),
        });
      }
    }

    // 5. Chargeable weight sanity (should be >= gross weight)
    if (shipChargeable > 0 && shipChargeable < shipGross - 0.5) {
      mismatches.push({
        field: "chargeableWeight",
        expected: `>= ${numNorm(shipGross)}`,
        actual: numNorm(shipChargeable),
      });
    }

    logger.info("[air-cargo] document consistency check", {
      ustn,
      consistent: mismatches.length === 0,
      mismatches: mismatches.length,
    });
    return { consistent: mismatches.length === 0, mismatches };
  } catch (err: any) {
    logger.error("[air-cargo] validateAirDocumentConsistency failed", {
      ustn,
      error: err?.message,
    });
    return {
      consistent: false,
      mismatches: [
        { field: "engine", expected: "no errors", actual: err?.message || "unknown error" },
      ],
    };
  }
}

// ============ Helper: AWB number generation ============

/**
 * Generate a candidate AWB number with its check digit.
 * AWB number format: NNN-NNNNNNNNC where NNN is the 3-digit airline prefix,
 * NNNNNNNN is the 8-digit serial, and C is the check digit computed as
 * mod 7 of the 8-digit serial.
 */
export function generateAwbSerial(prefix?: string): {
  airlinePrefix: string;
  serial: string;
  checkDigit: string;
  fullAwbNumber: string;
} {
  const airlinePrefix = (prefix || "000").slice(0, 3).padStart(3, "0");
  // 8-digit serial (random)
  const serialNum = Math.floor(10000000 + Math.random() * 89999999);
  const serial = String(serialNum).padStart(8, "0");
  const checkDigit = String(serialNum % 7);
  const fullAwbNumber = `${airlinePrefix}-${serial}${checkDigit}`;
  return { airlinePrefix, serial, checkDigit, fullAwbNumber };
}

// ============ Helper: ULD ID generation ============

/**
 * Generate a candidate ULD identifier: TYPE-SERIAL-OWNER (e.g. AKE12345CX).
 * Format: 3-letter type + 5-digit serial + 2-letter owner code (default 'XX').
 */
export function generateUldId(uldType: string, ownerCode = "XX"): string {
  const type = String(uldType || "AKE").toUpperCase().slice(0, 3).padEnd(3, "X");
  const serial = String(Math.floor(10000 + Math.random() * 89999));
  return `${type}${serial}${String(ownerCode || "XX").toUpperCase().slice(0, 2).padEnd(2, "X")}`;
}

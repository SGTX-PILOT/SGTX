// @ts-nocheck — defensive; Prisma schema drift handled at runtime
// SGTX RoRo & Rolling Cargo Engine
// Spec references: Blueprint v13.1 FINAL Articles 55-86
//
//   Art 55-56 — RoRo first-class engine + RORO_MASTER_OBJECT (RoRoShipment)
//   Art 57-58 — RORO_UNIT_IDENTITY + vehicle types (RoRoUnit)
//   Art 59-62 — Booking, Voyage, Manifest, VIN-level Customs Reconciliation
//   Art 63-66 — Terminal, Yard, Gate, Inspection engines
//   Art 67    — Damage comparison (A2 POSSIBLE_DAMAGE vs human CONFIRMED_DAMAGE)
//   Art 72    — RORO_BILL_OF_LADING
//   Art 74-75 — Unit state machine (19 states) + Vessel state (12 states)
//   Art 77    — Egypt RoRo adapter (Nafeza applicability, UCR)
//
// Design principles (mirrors air-cargo / road-corridor engines):
//   • Every DB call is wrapped defensively — the engine never throws to the
//     caller; it returns structured results with `ok` / `issues`.
//   • State transitions are validated against RORO_UNIT_STATE_MACHINE before
//     being persisted; invalid transitions are rejected with allowed next-states.
//   • Per Art 75: vessel state is SEPARATE from cargo/unit state — never mixed.
//   • Per Art 67: AI (A2) only ever emits POSSIBLE_DAMAGE; only a human
//     inspector can elevate to CONFIRMED_DAMAGE. The engine preserves this
//     boundary — the lib's `recordInspection` accepts an `aiDamageAssessment`
//     field that is stored separately from the human-confirmed `newDamage`.
//   • Egypt adapter (Art 77) determines Nafeza applicability per trade, NOT a
//     one-size-fits-all maritime workflow.

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ Art 74 — RoRo Unit State Machine (19 states) ============

export const RORO_UNIT_STATUSES = [
  "BOOKED",
  "DOCUMENTS_PENDING",
  "CUSTOMS_PENDING",
  "READY_FOR_GATE",
  "GATE_IN",
  "INSPECTION_PENDING",
  "INSPECTED",
  "YARD",
  "READY_FOR_LOAD",
  "LOADED",
  "AT_SEA",
  "TRANSSHIPMENT",
  "DISCHARGED",
  "DESTINATION_YARD",
  "CUSTOMS_HOLD",
  "CUSTOMS_RELEASED",
  "DELIVERY_ORDER",
  "READY_FOR_GATE_OUT",
  "GATE_OUT",
  "DELIVERED",
  "ACCEPTED",
] as const;

// 19-state machine transitions (linear chain with two side-branches:
// CUSTOMS_HOLD can be raised from CUSTOMS_PENDING / DISCHARGED / DESTINATION_YARD;
// CUSTOMS_RELEASED returns to the main flow at DELIVERY_ORDER).
export const RORO_UNIT_STATE_MACHINE: Record<string, string[]> = {
  BOOKED: ["DOCUMENTS_PENDING"],
  DOCUMENTS_PENDING: ["CUSTOMS_PENDING"],
  CUSTOMS_PENDING: ["READY_FOR_GATE", "CUSTOMS_HOLD"],
  READY_FOR_GATE: ["GATE_IN"],
  GATE_IN: ["INSPECTION_PENDING"],
  INSPECTION_PENDING: ["INSPECTED"],
  INSPECTED: ["YARD"],
  YARD: ["READY_FOR_LOAD"],
  READY_FOR_LOAD: ["LOADED"],
  LOADED: ["AT_SEA"],
  AT_SEA: ["TRANSSHIPMENT", "DISCHARGED"],
  TRANSSHIPMENT: ["AT_SEA", "DISCHARGED"],
  DISCHARGED: ["DESTINATION_YARD", "CUSTOMS_HOLD"],
  DESTINATION_YARD: ["CUSTOMS_HOLD", "CUSTOMS_RELEASED"],
  CUSTOMS_HOLD: ["CUSTOMS_RELEASED"],
  CUSTOMS_RELEASED: ["DELIVERY_ORDER"],
  DELIVERY_ORDER: ["READY_FOR_GATE_OUT"],
  READY_FOR_GATE_OUT: ["GATE_OUT"],
  GATE_OUT: ["DELIVERED"],
  DELIVERED: ["ACCEPTED"],
  ACCEPTED: [],
};

// Terminal states — no further transitions allowed (ACCEPTED is the end-state).
export const RORO_UNIT_TERMINAL_STATES = ["ACCEPTED"];

// ============ Art 75 — RoRo Vessel State (12 states, separate from unit state) ============

export const RORO_VESSEL_STATUSES = [
  "SCHEDULED",
  "BOOKING_OPEN",
  "CUTOFF_APPROACHING",
  "CARGO_ACCEPTING",
  "LOADING",
  "DEPARTED",
  "AT_SEA",
  "TRANSSHIPMENT",
  "ARRIVED",
  "DISCHARGING",
  "COMPLETED",
  "CANCELLED",
] as const;

// ============ Art 58 — Vehicle Types ============

export const RORO_VEHICLE_TYPES = [
  "VEHICLE",
  "TRUCK",
  "TRACTOR",
  "TRAILER",
  "BUS",
  "MOTORCYCLE",
  "MACHINERY",
  "NON_RUNNING",
] as const;

// ============ Art 66 — Inspection Types ============

export const RORO_INSPECTION_TYPES = ["PRE_LOAD", "POST_DISCHARGE", "CLAIM"] as const;

// ============ Art 64 — Yard Statuses ============

export const RORO_YARD_STATUSES = [
  "EXPECTED",
  "ARRIVED",
  "GATE_IN",
  "INSPECTED",
  "PARKED",
  "READY_FOR_LOADING",
  "LOADED",
  "DISCHARGED",
  "AVAILABLE",
  "RELEASED",
  "GATE_OUT",
] as const;

// ============ Art 67 — Damage Comparison States ============

export const RORO_DAMAGE_STATES = [
  "NO_CHANGE",
  "POSSIBLE_DAMAGE",     // A2 AI-suggested — never authoritative
  "CONFIRMED_DAMAGE",    // Human/authorized inspector — authoritative
  "DISPUTED_DAMAGE",     // Shipper/consignee contesting the assessment
] as const;

// ============ State transition validation ============

/**
 * Validate that `from -> to` is a permitted transition per Art 74.
 * Self-transitions (from===to) are allowed for idempotency.
 * Terminal states can never move.
 */
export function isValidRoRoUnitTransition(from: string, to: string): boolean {
  if (!from || !to) return false;
  if (from === to) return true;
  if (RORO_UNIT_TERMINAL_STATES.includes(from)) return false;
  const allowed = RORO_UNIT_STATE_MACHINE[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

/**
 * Return the list of states the unit may legally move to from `from`.
 * Empty array means the state is terminal or unknown.
 */
export function getRoRoUnitAllowedTransitions(from: string): string[] {
  if (!from) return [];
  if (RORO_UNIT_TERMINAL_STATES.includes(from)) return [];
  return RORO_UNIT_STATE_MACHINE[from] || [];
}

// ============ Art 67 — Damage Comparison Engine ============

/**
 * Compare pre-load vs post-discharge inspections to derive a damage verdict.
 *
 * Per Art 67:
 *   - AI (A2) only ever emits POSSIBLE_DAMAGE — never authoritative.
 *   - Human/authorized inspector confirms CONFIRMED_DAMAGE.
 *   - DISPUTED_DAMAGE arises when shipper/consignee contests.
 *
 * Logic:
 *   1. If `humanConfirmed` flag is true on any new-damage entry → CONFIRMED_DAMAGE
 *   2. Else if AI assessment flags any damage → POSSIBLE_DAMAGE
 *   3. Else if `disputed` flag is true → DISPUTED_DAMAGE
 *   4. Else NO_CHANGE
 *
 * Pure function — no DB I/O. The caller persists the verdict.
 */
export function compareDamage(input: {
  preLoadDamage: any[];
  postDischargeDamage: any[];
  aiAssessment?: any;
  humanConfirmed?: boolean;
  disputed?: boolean;
}): {
  verdict: string;
  newDamageCount: number;
  preExistingCount: number;
  explanation: string;
} {
  const preLoad = Array.isArray(input.preLoadDamage) ? input.preLoadDamage : [];
  const postDischarge = Array.isArray(input.postDischargeDamage)
    ? input.postDischargeDamage
    : [];
  const aiAssessment = input.aiAssessment || null;
  const humanConfirmed = !!input.humanConfirmed;
  const disputed = !!input.disputed;

  // Filter out pre-existing damage from the post-discharge list to isolate NEW damage.
  const preLoadSet = new Set(
    preLoad.map((d) => `${d?.location || ""}|${d?.description || ""}`.toLowerCase()),
  );
  const newDamageEntries = postDischarge.filter((d) => {
    const k = `${d?.location || ""}|${d?.description || ""}`.toLowerCase();
    return !preLoadSet.has(k);
  });

  let verdict = "NO_CHANGE";
  if (humanConfirmed && newDamageEntries.length > 0) {
    verdict = "CONFIRMED_DAMAGE";
  } else if (aiAssessment && (aiAssessment.possibleDamageCount || 0) > 0) {
    verdict = "POSSIBLE_DAMAGE";
  } else if (
    aiAssessment &&
    Array.isArray(aiAssessment.detections) &&
    aiAssessment.detections.length > 0
  ) {
    verdict = "POSSIBLE_DAMAGE";
  } else if (disputed) {
    verdict = "DISPUTED_DAMAGE";
  }

  const explanation = buildDamageExplanation({
    verdict,
    preExistingCount: preLoad.length,
    newDamageCount: newDamageEntries.length,
    humanConfirmed,
    disputed,
    aiAssessment,
  });

  return {
    verdict,
    newDamageCount: newDamageEntries.length,
    preExistingCount: preLoad.length,
    explanation,
  };
}

function buildDamageExplanation(ctx: {
  verdict: string;
  preExistingCount: number;
  newDamageCount: number;
  humanConfirmed: boolean;
  disputed: boolean;
  aiAssessment: any;
}): string {
  const parts: string[] = [];
  parts.push(`Pre-existing damage: ${ctx.preExistingCount} item(s).`);
  parts.push(`New damage detected: ${ctx.newDamageCount} item(s).`);
  if (ctx.aiAssessment) {
    const aiCount =
      ctx.aiAssessment.possibleDamageCount ||
      (Array.isArray(ctx.aiAssessment.detections)
        ? ctx.aiAssessment.detections.length
        : 0);
    parts.push(`AI (A2) flagged ${aiCount} possible-damage area(s).`);
  }
  if (ctx.verdict === "CONFIRMED_DAMAGE") {
    parts.push("Verdict: CONFIRMED_DAMAGE — human inspector confirmed new damage.");
  } else if (ctx.verdict === "POSSIBLE_DAMAGE") {
    parts.push(
      "Verdict: POSSIBLE_DAMAGE — AI-suggested, awaiting human confirmation. AI cannot determine liability.",
    );
  } else if (ctx.verdict === "DISPUTED_DAMAGE") {
    parts.push(
      "Verdict: DISPUTED_DAMAGE — shipper/consignee contesting the assessment; escalate to claims.",
    );
  } else {
    parts.push("Verdict: NO_CHANGE — no new damage detected.");
  }
  return parts.join(" ");
}

// ============ Art 77 — Egypt RoRo Adapter (Nafeza applicability) ============

/**
 * Determine Nafeza applicability for the trade (Art 77).
 *
 * Decision matrix (Egypt-specific — does NOT blindly apply container-only
 * Enhanced Export messages to RoRo):
 *   • Origin OR destination = EG → Nafeza applies (single-window)
 *   • UCR (Unique Consignment Reference) required when Nafeza applies
 *   • Export declaration required if origin = EG
 *   • Transit declaration required if transitCountries include EG
 *   • Manifest always required (Art 77 manifest item)
 *   • Shipping-agent messages: UCR Verification, Booking Confirmation,
 *     Shipment Inquiry, Manifest (NOT Empty Containers — that's container-only)
 *   • Customs procedure: IM4 (import), EX1 (export), T1 (transit)
 *
 * Returns the EgyptRoRoAdapter payload (caller persists).
 */
export function determineEgyptRoRoApplicability(input: {
  ustn: string;
  originCountry: string;
  destinationCountry: string;
  transitCountries?: string[];
  isExport?: boolean;
  isImport?: boolean;
  isTransit?: boolean;
}): {
  nafezaApplies: boolean;
  ucr: string | null;
  exportDeclarationRequired: boolean;
  transitDeclarationRequired: boolean;
  manifestRequired: boolean;
  shippingAgentMessages: string[];
  terminalProcessSteps: string[];
  customsProcedure: string;
  portRequirements: Record<string, any>;
  unitDocumentationRequired: string[];
  destinationRequirements: Record<string, any>;
} {
  const origin = String(input?.originCountry || "").toUpperCase();
  const destination = String(input?.destinationCountry || "").toUpperCase();
  const transit = (Array.isArray(input?.transitCountries)
    ? input.transitCountries
    : []
  ).map((c) => String(c || "").toUpperCase());

  const involvesEgypt = origin === "EG" || destination === "EG" || transit.includes("EG");
  const nafezaApplies = involvesEgypt;

  // UCR generation (Nafeza's Unique Consignment Reference — format: 15-digit numeric per Egyptian Customs).
  let ucr: string | null = null;
  if (nafezaApplies) {
    // Generate a candidate UCR: {YY}{10-digit-payload} — caller may overwrite with the actual Nafeza-issued UCR.
    const yy = String(new Date().getFullYear()).slice(-2);
    const random10 = String(
      Math.floor(1_000_000_000 + Math.random() * 8_999_999_999),
    );
    ucr = `${yy}${random10}`;
  }

  const exportDeclarationRequired = origin === "EG";
  const transitDeclarationRequired = transit.includes("EG");
  const manifestRequired = true; // Art 77 — manifest always required for RoRo

  // Per Nafeza's July 18, 2026 Enhanced Export notice: the first five messages
  // are UCR Verification, Booking Confirmation, Empty Containers, Shipment
  // Inquiry, Manifest. Empty Containers is container-only and MUST NOT be
  // sent for RoRo.
  const shippingAgentMessages: string[] = [];
  if (nafezaApplies) {
    shippingAgentMessages.push("UCR_VERIFICATION");
    shippingAgentMessages.push("BOOKING_CONFIRMATION");
    // Empty Containers intentionally OMITTED for RoRo
    shippingAgentMessages.push("SHIPMENT_INQUIRY");
    shippingAgentMessages.push("MANIFEST");
  }

  // Terminal process steps for RoRo (Art 63 — Terminal Adapter).
  const terminalProcessSteps: string[] = nafezaApplies
    ? [
        "PRE_ADVICE",
        "BOOKING",
        "GATE_APPOINTMENT",
        "GATE_IN",
        "VIN_SCAN",
        "INSPECTION",
        "YARD_ASSIGNMENT",
        "PARKING",
        "STOCK",
        "LOADING",
        "RAMP_ASSIGNMENT",
        "DISCHARGE",
        "GATE_OUT",
      ]
    : [];

  // Customs procedure (Art 77 — IM4 import / EX1 export / T1 transit).
  let customsProcedure = "IM4";
  if (exportDeclarationRequired) customsProcedure = "EX1";
  else if (transitDeclarationRequired) customsProcedure = "T1";

  // Port requirements (Art 77 — port-specific).
  const portRequirements: Record<string, any> = nafezaApplies
    ? {
        origin: {
          country: origin,
          port: origin === "EG" ? "EGDMT" : null, // Damietta default for EG origin
          rfidDigitalSealRequired: true, // Art 68 — RFID-based digital-seal safety for Egypt-Italy RoRo line
          customsPreClearance: origin === "EG",
        },
        destination: {
          country: destination,
          port: destination === "EG" ? "EGDMT" : null,
          arrivalManifestRequired: true,
          vinReconciliationRequired: true, // Art 62 — VIN-level customs reconciliation
        },
      }
    : {};

  // Unit documentation required (Art 77 — vehicle/unit documentation).
  const unitDocumentationRequired: string[] = nafezaApplies
    ? [
        "VEHICLE_TITLE_OR_EXPORT_CERT",
        "VIN_CERTIFICATE",
        "INSPECTION_CERTIFICATE",
        "ORIGIN_CERTIFICATE",
        "CUSTOMS_DECLARATION",
      ]
    : [];

  // Destination requirements (Art 77 — destination/transit requirements).
  const destinationRequirements: Record<string, any> = nafezaApplies
    ? {
        customsClearanceRequired: destination === "EG",
        portOfDischarge: destination === "EG" ? "EGDMT" : null,
        deliveryOrderRequired: true,
        gateOutCustomsReleaseRequired: true, // Art 65 — DESTINATION: customs release before gate-out
      }
    : {};

  return {
    nafezaApplies,
    ucr,
    exportDeclarationRequired,
    transitDeclarationRequired,
    manifestRequired,
    shippingAgentMessages,
    terminalProcessSteps,
    customsProcedure,
    portRequirements,
    unitDocumentationRequired,
    destinationRequirements,
  };
}

// ============ Helpers: JSON-safe parsing & defensive defaults ============

function safeParseArr(s: any): any[] {
  if (!s) return [];
  if (Array.isArray(s)) return s;
  if (typeof s === "string") {
    try {
      const v = JSON.parse(s);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
  return [];
}

function safeParseObj(s: any): Record<string, any> | null {
  if (!s) return null;
  if (typeof s === "object") return s as Record<string, any>;
  if (typeof s === "string") {
    try {
      const v = JSON.parse(s);
      return typeof v === "object" && v !== null ? (v as Record<string, any>) : null;
    } catch {
      return null;
    }
  }
  return null;
}

function genShipmentRef(ustn: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `RORO-${(ustn || "").slice(-8)}-${ts}-${rnd}`;
}

function genBookingRef(shipmentRef: string): string {
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${shipmentRef}-BKG-${rnd}`;
}

function genBlNumber(shipmentRef: string): string {
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `RRBL-${(shipmentRef || "").slice(-12)}-${rnd}`;
}

function genVoyageNumber(vesselName: string): string {
  const code = (vesselName || "VSL").slice(0, 3).toUpperCase().padEnd(3, "X");
  const seq = String(Math.floor(1 + Math.random() * 999)).padStart(3, "0");
  const yy = String(new Date().getFullYear()).slice(-2);
  return `${code}-${yy}${seq}E`;
}

// ============ Art 56 — RoRoShipment (RORO_MASTER_OBJECT) ============

export interface CreateRoRoShipmentInput {
  ustn: string;
  shipmentReference?: string;
  shipperGtid?: string;
  consigneeGtid?: string;
  originPort: string;
  destinationPort: string;
  transitPorts?: string[];
  incoterm?: string;
  units?: Array<{
    vin?: string;
    unitType?: string;
    make?: string;
    model?: string;
    year?: number;
    registrationNumber?: string;
    weightKg?: number;
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
    fuelType?: string;
    batteryCharged?: boolean;
    runningStatus?: string;
    hsCode?: string;
    originCountry?: string;
    destinationCountry?: string;
  }>;
}

/**
 * Create a new RoRoShipment under a USTN (Art 56 — RORO_MASTER_OBJECT).
 * Accepts an optional list of initial units to bootstrap the shipment.
 *
 * Defensive: wrapped in try/catch — returns null on failure.
 */
export async function createRoRoShipment(data: CreateRoRoShipmentInput): Promise<any | null> {
  try {
    if (!data?.ustn) {
      logger.warn("[roro/createRoRoShipment] missing ustn");
      return null;
    }
    if (!data?.originPort || !data?.destinationPort) {
      logger.warn("[roro/createRoRoShipment] missing originPort / destinationPort", {
        ustn: data.ustn,
      });
      return null;
    }

    const shipmentReference = data.shipmentReference || genShipmentRef(data.ustn);
    const transitPorts = JSON.stringify(
      Array.isArray(data.transitPorts) ? data.transitPorts : [],
    );
    const initialUnits = Array.isArray(data.units) ? data.units : [];

    const shipment = await (db as any).roRoShipment.create({
      data: {
        ustn: data.ustn,
        shipmentReference,
        shipperGtid: data.shipperGtid || null,
        consigneeGtid: data.consigneeGtid || null,
        originPort: String(data.originPort).toUpperCase(),
        destinationPort: String(data.destinationPort).toUpperCase(),
        transitPorts,
        totalUnits: initialUnits.length,
        totalWeightKg: initialUnits.reduce(
          (s, u) => s + (Number(u?.weightKg) || 0),
          0,
        ),
        incoterm: data.incoterm || null,
        status: "BOOKED",
        units: {
          create: initialUnits.map((u) => ({
            vin: u.vin || null,
            unitType: u.unitType || "VEHICLE",
            make: u.make || null,
            model: u.model || null,
            year: u.year || null,
            registrationNumber: u.registrationNumber || null,
            weightKg: Number(u.weightKg) || 0,
            lengthCm: u.lengthCm || null,
            widthCm: u.widthCm || null,
            heightCm: u.heightCm || null,
            fuelType: u.fuelType || null,
            batteryCharged: u.batteryCharged !== false,
            runningStatus: u.runningStatus || "RUNNING",
            hsCode: u.hsCode || null,
            originCountry: u.originCountry || null,
            destinationCountry: u.destinationCountry || null,
            status: "BOOKED",
          })),
        },
      },
      include: { units: true },
    });

    // Auto-apply the Egypt RoRo adapter (Art 77) if origin or destination is Egypt.
    try {
      const originCountry = portToCountry(data.originPort);
      const destinationCountry = portToCountry(data.destinationPort);
      if (originCountry === "EG" || destinationCountry === "EG") {
        await applyEgyptRoRoAdapter(data.ustn, {
          originCountry,
          destinationCountry,
          transitCountries: (Array.isArray(data.transitPorts) ? data.transitPorts : []).map(
            portToCountry,
          ),
        });
      }
    } catch (e: any) {
      logger.warn("[roro/createRoRoShipment] Egypt adapter auto-apply failed", {
        ustn: data.ustn,
        error: e?.message,
      });
    }

    logger.info("[roro/createRoRoShipment] created", {
      ustn: data.ustn,
      shipmentReference,
      unitCount: initialUnits.length,
    });
    return shipment;
  } catch (e: any) {
    logger.error("[roro/createRoRoShipment] failed", {
      ustn: data?.ustn,
      error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Fetch a RoRoShipment with all relations (units, bookings, yard, gate events,
 * inspections, B/Ls). Used by the GET /api/sgtx/roro/[id] route.
 */
export async function getRoRoShipment(id: string): Promise<any | null> {
  try {
    if (!id) return null;
    const shipment = await (db as any).roRoShipment.findUnique({
      where: { id },
      include: {
        units: {
          orderBy: { createdAt: "asc" },
          include: {
            yard: true,
            inspections: { orderBy: { inspectionTime: "desc" } },
            gateEvents: { orderBy: { eventTime: "desc" } },
          },
        },
        bookings: { orderBy: { createdAt: "desc" } },
        yardEvents: true,
        gateEvents: { orderBy: { eventTime: "desc" } },
        inspections: { orderBy: { inspectionTime: "desc" } },
        billsOfLading: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!shipment) return null;
    return normalizeShipment(shipment);
  } catch (e: any) {
    logger.error("[roro/getRoRoShipment] failed", { id, error: e?.message || String(e) });
    return null;
  }
}

/**
 * List RoRo shipments, optionally filtered by ustn or status.
 */
export async function listRoRoShipments(filter?: {
  ustn?: string;
  status?: string;
  shipperGtid?: string;
  take?: number;
}): Promise<any[]> {
  try {
    const where: any = {};
    if (filter?.ustn) where.ustn = filter.ustn;
    if (filter?.status) where.status = filter.status;
    if (filter?.shipperGtid) where.shipperGtid = filter.shipperGtid;
    const take = Math.max(1, Math.min(200, Number(filter?.take) || 50));
    const rows = await (db as any).roRoShipment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      include: {
        units: { select: { id: true, status: true, weightKg: true } },
        bookings: { select: { id: true, status: true } },
      },
    });
    return (rows || []).map(normalizeShipment);
  } catch (e: any) {
    logger.error("[roro/listRoRoShipments] failed", {
      filter,
      error: e?.message || String(e),
    });
    return [];
  }
}

// ============ Art 57 — RoRoUnit (RORO_UNIT_IDENTITY) ============

/**
 * Add a single RoRo unit (VIN-level) to a shipment.
 * Validates that the VIN, if provided, is not already in use on another unit.
 */
export async function addRoRoUnit(shipmentId: string, unitData: any): Promise<any | null> {
  try {
    if (!shipmentId) {
      logger.warn("[roro/addRoRoUnit] missing shipmentId");
      return null;
    }
    const shipment = await (db as any).roRoShipment.findUnique({
      where: { id: shipmentId },
      select: { id: true, ustn: true, totalUnits: true, totalWeightKg: true },
    });
    if (!shipment) {
      logger.warn("[roro/addRoRoUnit] shipment not found", { shipmentId });
      return null;
    }

    // VIN uniqueness check (only if VIN provided).
    if (unitData?.vin) {
      const existing = await (db as any).roRoUnit.findUnique({
        where: { vin: unitData.vin },
        select: { id: true },
      });
      if (existing) {
        logger.warn("[roro/addRoRoUnit] VIN already in use", { vin: unitData.vin });
        return null;
      }
    }

    const unit = await (db as any).roRoUnit.create({
      data: {
        shipmentId,
        vin: unitData?.vin || null,
        unitType: unitData?.unitType || "VEHICLE",
        make: unitData?.make || null,
        model: unitData?.model || null,
        year: unitData?.year || null,
        registrationNumber: unitData?.registrationNumber || null,
        weightKg: Number(unitData?.weightKg) || 0,
        lengthCm: unitData?.lengthCm || null,
        widthCm: unitData?.widthCm || null,
        heightCm: unitData?.heightCm || null,
        fuelType: unitData?.fuelType || null,
        batteryCharged: unitData?.batteryCharged !== false,
        runningStatus: unitData?.runningStatus || "RUNNING",
        hsCode: unitData?.hsCode || null,
        originCountry: unitData?.originCountry || null,
        destinationCountry: unitData?.destinationCountry || null,
        status: "BOOKED",
      },
    });

    // Update parent shipment's totals.
    try {
      await (db as any).roRoShipment.update({
        where: { id: shipmentId },
        data: {
          totalUnits: (shipment.totalUnits || 0) + 1,
          totalWeightKg:
            (shipment.totalWeightKg || 0) + (Number(unitData?.weightKg) || 0),
        },
      });
    } catch (e: any) {
      logger.warn("[roro/addRoRoUnit] shipment totals update failed", {
        shipmentId,
        error: e?.message,
      });
    }

    logger.info("[roro/addRoRoUnit] created", {
      shipmentId,
      unitId: unit?.id,
      vin: unitData?.vin || "(no VIN)",
    });
    return unit;
  } catch (e: any) {
    logger.error("[roro/addRoRoUnit] failed", {
      shipmentId,
      error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Fetch a RoRo unit with yard position, inspection history, and gate events.
 */
export async function getRoRoUnit(id: string): Promise<any | null> {
  try {
    if (!id) return null;
    const unit = await (db as any).roRoUnit.findUnique({
      where: { id },
      include: {
        shipment: {
          select: { id: true, ustn: true, shipmentReference: true, status: true },
        },
        yard: true,
        inspections: { orderBy: { inspectionTime: "desc" } },
        gateEvents: { orderBy: { eventTime: "desc" } },
      },
    });
    if (!unit) return null;
    return normalizeUnit(unit);
  } catch (e: any) {
    logger.error("[roro/getRoRoUnit] failed", { id, error: e?.message || String(e) });
    return null;
  }
}

/**
 * Transition a unit's status per the 19-state machine (Art 74).
 * Validates the transition; returns the updated unit on success or null on failure.
 */
export async function updateUnitStatus(
  unitId: string,
  newStatus: string,
): Promise<{ ok: boolean; unit?: any; error?: string; allowedNext?: string[] }> {
  try {
    if (!unitId || !newStatus) {
      return { ok: false, error: "unitId and newStatus are required" };
    }
    if (!RORO_UNIT_STATUSES.includes(newStatus as any)) {
      return {
        ok: false,
        error: `Unknown status: ${newStatus}`,
        allowedNext: [],
      };
    }
    const unit = await (db as any).roRoUnit.findUnique({
      where: { id: unitId },
      select: { id: true, status: true },
    });
    if (!unit) {
      return { ok: false, error: "Unit not found" };
    }
    const current = unit.status || "BOOKED";
    if (!isValidRoRoUnitTransition(current, newStatus)) {
      const allowed = getRoRoUnitAllowedTransitions(current);
      return {
        ok: false,
        error: `Invalid transition: ${current} -> ${newStatus}`,
        allowedNext: allowed,
      };
    }

    const updated = await (db as any).roRoUnit.update({
      where: { id: unitId },
      data: { status: newStatus },
    });

    logger.info("[roro/updateUnitStatus] transitioned", {
      unitId,
      from: current,
      to: newStatus,
    });
    return { ok: true, unit: normalizeUnit(updated) };
  } catch (e: any) {
    logger.error("[roro/updateUnitStatus] failed", {
      unitId,
      newStatus,
      error: e?.message || String(e),
    });
    return { ok: false, error: e?.message || String(e) };
  }
}

// ============ Art 60 — RoRoVoyage (vessel voyage; vessel state separate per Art 75) ============

export async function createRoRoVoyage(data: any): Promise<any | null> {
  try {
    if (!data?.vesselName) {
      logger.warn("[roro/createRoRoVoyage] missing vesselName");
      return null;
    }
    const voyageNumber = data.voyageNumber || genVoyageNumber(data.vesselName);
    const transitPorts = JSON.stringify(
      Array.isArray(data.transitPorts) ? data.transitPorts : [],
    );
    const voyage = await (db as any).roRoVoyage.create({
      data: {
        vesselName: data.vesselName,
        vesselImo: data.vesselImo || null,
        voyageNumber,
        operatorGtid: data.operatorGtid || null,
        originPort: String(data.originPort || "").toUpperCase(),
        destinationPort: String(data.destinationPort || "").toUpperCase(),
        transitPorts,
        etd: data.etd || null,
        eta: data.eta || null,
        actualDeparture: data.actualDeparture || null,
        actualArrival: data.actualArrival || null,
        bookingCutoff: data.bookingCutoff || null,
        documentCutoff: data.documentCutoff || null,
        gateCutoff: data.gateCutoff || null,
        cargoCutoff: data.cargoCutoff || null,
        status: data.status || "SCHEDULED",
      },
    });
    logger.info("[roro/createRoRoVoyage] created", {
      voyageNumber,
      vesselName: data.vesselName,
    });
    return voyage;
  } catch (e: any) {
    logger.error("[roro/createRoRoVoyage] failed", {
      vesselName: data?.vesselName,
      error: e?.message || String(e),
    });
    return null;
  }
}

export async function getRoRoVoyage(id: string): Promise<any | null> {
  try {
    if (!id) return null;
    const voyage = await (db as any).roRoVoyage.findUnique({
      where: { id },
      include: {
        bookings: {
          include: {
            shipment: {
              select: { id: true, ustn: true, shipmentReference: true },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!voyage) return null;
    return normalizeVoyage(voyage);
  } catch (e: any) {
    logger.error("[roro/getRoRoVoyage] failed", { id, error: e?.message || String(e) });
    return null;
  }
}

export async function listRoRoVoyages(filter?: {
  status?: string;
  vesselImo?: string;
  originPort?: string;
  take?: number;
}): Promise<any[]> {
  try {
    const where: any = {};
    if (filter?.status) where.status = filter.status;
    if (filter?.vesselImo) where.vesselImo = filter.vesselImo;
    if (filter?.originPort) where.originPort = filter.originPort;
    const take = Math.max(1, Math.min(200, Number(filter?.take) || 50));
    const rows = await (db as any).roRoVoyage.findMany({
      where,
      orderBy: { etd: "desc" },
      take,
    });
    return (rows || []).map(normalizeVoyage);
  } catch (e: any) {
    logger.error("[roro/listRoRoVoyages] failed", {
      filter,
      error: e?.message || String(e),
    });
    return [];
  }
}

// ============ Art 59 — RoRoBooking (booking on a voyage) ============

export async function createRoRoBooking(
  shipmentId: string,
  voyageId: string,
  data: any,
): Promise<any | null> {
  try {
    if (!shipmentId || !voyageId) {
      logger.warn("[roro/createRoRoBooking] missing shipmentId or voyageId");
      return null;
    }
    const [shipment, voyage] = await Promise.all([
      (db as any).roRoShipment.findUnique({
        where: { id: shipmentId },
        select: { id: true, ustn: true, shipmentReference: true, units: true },
      }),
      (db as any).roRoVoyage.findUnique({
        where: { id: voyageId },
        select: { id: true, voyageNumber: true, status: true },
      }),
    ]);
    if (!shipment) {
      logger.warn("[roro/createRoRoBooking] shipment not found", { shipmentId });
      return null;
    }
    if (!voyage) {
      logger.warn("[roro/createRoRoBooking] voyage not found", { voyageId });
      return null;
    }

    const bookingReference =
      data?.bookingReference || genBookingRef(shipment.shipmentReference || shipmentId);
    const specialHandling = JSON.stringify(
      Array.isArray(data?.specialHandling) ? data.specialHandling : [],
    );
    const unitsCount =
      Number(data?.unitsCount) ||
      (Array.isArray(shipment.units) ? shipment.units.length : 0);
    const totalWeightKg =
      Number(data?.totalWeightKg) ||
      (Array.isArray(shipment.units)
        ? shipment.units.reduce(
            (s: number, u: any) => s + (u.weightKg || 0),
            0,
          )
        : 0);

    const booking = await (db as any).roRoBookingRecord.create({
      data: {
        shipmentId,
        voyageId,
        bookingReference,
        shipperGtid: data?.shipperGtid || null,
        consigneeGtid: data?.consigneeGtid || null,
        unitsCount,
        totalWeightKg,
        preferredSailing: data?.preferredSailing || null,
        deliveryWindowStart: data?.deliveryWindowStart || null,
        deliveryWindowEnd: data?.deliveryWindowEnd || null,
        incoterm: data?.incoterm || null,
        specialHandling,
        status: "PENDING",
      },
    });

    logger.info("[roro/createRoRoBooking] created", {
      shipmentId,
      voyageId,
      bookingReference,
    });
    return booking;
  } catch (e: any) {
    logger.error("[roro/createRoRoBooking] failed", {
      shipmentId,
      voyageId,
      error: e?.message || String(e),
    });
    return null;
  }
}

// ============ Art 65 — RoRoGateEvent (gate-in / gate-out) ============

export async function recordGateEvent(
  shipmentId: string,
  unitId: string,
  eventType: string,
  gateType: string,
  terminalGtid?: string,
  vinScan?: string,
  customsStatus?: string,
  inspectorName?: string,
  gateReference?: string,
): Promise<any | null> {
  try {
    if (!shipmentId || !unitId || !eventType || !gateType) {
      logger.warn("[roro/recordGateEvent] missing required field", {
        shipmentId,
        unitId,
        eventType,
        gateType,
      });
      return null;
    }
    if (!["GATE_IN", "GATE_OUT"].includes(eventType)) {
      logger.warn("[roro/recordGateEvent] invalid eventType", { eventType });
      return null;
    }
    if (!["ORIGIN", "DESTINATION"].includes(gateType)) {
      logger.warn("[roro/recordGateEvent] invalid gateType", { gateType });
      return null;
    }

    const event = await (db as any).roRoGateEvent.create({
      data: {
        shipmentId,
        unitId,
        eventType,
        gateType,
        eventTime: new Date(),
        terminalGtid: terminalGtid || null,
        gateReference: gateReference || null,
        vinScan: vinScan || null,
        customsStatus: customsStatus || null,
        inspectorName: inspectorName || null,
      },
    });

    // Auto-transition the unit's status per the 19-state machine.
    if (eventType === "GATE_IN") {
      await updateUnitStatus(unitId, "GATE_IN").catch(() => {});
    } else if (eventType === "GATE_OUT") {
      await updateUnitStatus(unitId, "GATE_OUT").catch(() => {});
    }

    logger.info("[roro/recordGateEvent] recorded", {
      shipmentId,
      unitId,
      eventType,
      gateType,
    });
    return event;
  } catch (e: any) {
    logger.error("[roro/recordGateEvent] failed", {
      shipmentId,
      unitId,
      eventType,
      error: e?.message || String(e),
    });
    return null;
  }
}

// ============ Art 66-67 — RoRoInspection (pre-load / post-discharge / claim) ============

export async function recordInspection(
  unitId: string,
  inspectionData: any,
): Promise<any | null> {
  try {
    if (!unitId) {
      logger.warn("[roro/recordInspection] missing unitId");
      return null;
    }
    const unit = await (db as any).roRoUnit.findUnique({
      where: { id: unitId },
      select: { id: true, shipmentId: true, status: true },
    });
    if (!unit) {
      logger.warn("[roro/recordInspection] unit not found", { unitId });
      return null;
    }

    const inspectionType = inspectionData?.inspectionType || "PRE_LOAD";
    if (!RORO_INSPECTION_TYPES.includes(inspectionType as any)) {
      logger.warn("[roro/recordInspection] invalid inspectionType", { inspectionType });
      return null;
    }

    const preExistingDamage = JSON.stringify(
      Array.isArray(inspectionData?.preExistingDamage)
        ? inspectionData.preExistingDamage
        : [],
    );
    const newDamage = JSON.stringify(
      Array.isArray(inspectionData?.newDamage) ? inspectionData.newDamage : [],
    );
    const photos = JSON.stringify(
      Array.isArray(inspectionData?.photos) ? inspectionData.photos : [],
    );
    const videos = JSON.stringify(
      Array.isArray(inspectionData?.videos) ? inspectionData.videos : [],
    );
    const aiDamageAssessment = inspectionData?.aiDamageAssessment
      ? JSON.stringify(inspectionData.aiDamageAssessment)
      : null;

    const inspection = await (db as any).roRoInspection.create({
      data: {
        unitId,
        shipmentId: unit.shipmentId,
        inspectionType,
        inspectorName: inspectionData?.inspectorName || null,
        inspectionTime: inspectionData?.inspectionTime || new Date(),
        mileage:
          inspectionData?.mileage != null ? Number(inspectionData.mileage) : null,
        fuelLevel: inspectionData?.fuelLevel || null,
        batteryLevel: inspectionData?.batteryLevel || null,
        keysPresent: inspectionData?.keysPresent !== false,
        tireCondition: inspectionData?.tireCondition || null,
        glassCondition: inspectionData?.glassCondition || null,
        mirrorCondition: inspectionData?.mirrorCondition || null,
        exteriorCondition: inspectionData?.exteriorCondition || null,
        interiorCondition: inspectionData?.interiorCondition || null,
        preExistingDamage,
        newDamage,
        photos,
        videos,
        aiDamageAssessment,
      },
    });

    // Auto-transition unit status per inspection type.
    if (inspectionType === "PRE_LOAD") {
      await updateUnitStatus(unitId, "INSPECTED").catch(() => {});
    } else if (inspectionType === "POST_DISCHARGE") {
      // Post-discharge inspection typically triggers DESTINATION_YARD or YARD state.
      // Only transition if the unit is past DISCHARGED; otherwise leave alone.
      const currentStatus = unit.status;
      if (
        currentStatus &&
        ["DISCHARGED", "DESTINATION_YARD"].includes(currentStatus)
      ) {
        await updateUnitStatus(unitId, "DESTINATION_YARD").catch(() => {});
      }
    }

    logger.info("[roro/recordInspection] recorded", {
      unitId,
      inspectionType,
      inspectionId: inspection?.id,
    });
    return inspection;
  } catch (e: any) {
    logger.error("[roro/recordInspection] failed", {
      unitId,
      error: e?.message || String(e),
    });
    return null;
  }
}

// ============ Art 64 — RoRoYard (yard position tracking) ============

export async function assignYardPosition(
  unitId: string,
  zone: string,
  block: string,
  row: string,
  slot: string,
  deck?: string,
  position?: string,
): Promise<any | null> {
  try {
    if (!unitId) {
      logger.warn("[roro/assignYardPosition] missing unitId");
      return null;
    }
    const unit = await (db as any).roRoUnit.findUnique({
      where: { id: unitId },
      select: { id: true, shipmentId: true, status: true },
    });
    if (!unit) {
      logger.warn("[roro/assignYardPosition] unit not found", { unitId });
      return null;
    }

    // Upsert yard row (one yard row per unit — keyed on unitId unique).
    const yard = await (db as any).roRoYard.upsert({
      where: { unitId },
      create: {
        unitId,
        shipmentId: unit.shipmentId,
        yardZone: zone || null,
        block: block || null,
        row: row || null,
        slot: slot || null,
        deck: deck || null,
        position: position || null,
        status: "PARKED",
        arrivalTime: new Date(),
        storageStartTime: new Date(),
      },
      update: {
        yardZone: zone || null,
        block: block || null,
        row: row || null,
        slot: slot || null,
        deck: deck || null,
        position: position || null,
        status: "PARKED",
      },
    });

    // Auto-transition unit to YARD state if currently INSPECTED.
    if (unit.status === "INSPECTED") {
      await updateUnitStatus(unitId, "YARD").catch(() => {});
    }

    logger.info("[roro/assignYardPosition] assigned", {
      unitId,
      zone,
      block,
      row,
      slot,
    });
    return yard;
  } catch (e: any) {
    logger.error("[roro/assignYardPosition] failed", {
      unitId,
      zone,
      block,
      row,
      slot,
      error: e?.message || String(e),
    });
    return null;
  }
}

// ============ Art 72 — RoRoBillOfLading ============

export async function createBillOfLading(
  shipmentId: string,
  blData: any,
): Promise<any | null> {
  try {
    if (!shipmentId) {
      logger.warn("[roro/createBillOfLading] missing shipmentId");
      return null;
    }
    const shipment = await (db as any).roRoShipment.findUnique({
      where: { id: shipmentId },
      select: {
        id: true,
        ustn: true,
        shipmentReference: true,
        originPort: true,
        destinationPort: true,
        transitPorts: true,
        totalWeightKg: true,
        units: { select: { vin: true } },
      },
    });
    if (!shipment) {
      logger.warn("[roro/createBillOfLading] shipment not found", { shipmentId });
      return null;
    }

    const blNumber = blData?.blNumber || genBlNumber(shipment.shipmentReference);
    const blType = blData?.blType || "MASTER";
    const vinsList = JSON.stringify(
      Array.isArray(blData?.vinsList)
        ? blData.vinsList
        : (shipment.units || [])
            .map((u: any) => u.vin)
            .filter((v: string) => !!v),
    );
    const transitPorts = blData?.transitPorts
      ? JSON.stringify(
          Array.isArray(blData.transitPorts) ? blData.transitPorts : [],
        )
      : shipment.transitPorts || "[]";
    const charges = blData?.charges ? JSON.stringify(blData.charges) : null;

    const bl = await (db as any).roRoBillOfLading.create({
      data: {
        shipmentId,
        blNumber,
        blType,
        shipper: blData?.shipper || null,
        consignee: blData?.consignee || null,
        notifyParty: blData?.notifyParty || null,
        vesselName: blData?.vesselName || null,
        voyageNumber: blData?.voyageNumber || null,
        portOfLoading: blData?.portOfLoading || shipment.originPort,
        portOfDischarge: blData?.portOfDischarge || shipment.destinationPort,
        transitPorts,
        vinsList,
        cargoDescription: blData?.cargoDescription || null,
        totalWeightKg:
          Number(blData?.totalWeightKg) || shipment.totalWeightKg || 0,
        freight: blData?.freight != null ? Number(blData.freight) : null,
        charges,
        issuedAt: blData?.issuedAt || new Date(),
        status: "ISSUED",
      },
    });

    logger.info("[roro/createBillOfLading] created", {
      shipmentId,
      blNumber,
      blType,
    });
    return bl;
  } catch (e: any) {
    logger.error("[roro/createBillOfLading] failed", {
      shipmentId,
      error: e?.message || String(e),
    });
    return null;
  }
}

// ============ Art 77 — Egypt RoRo Adapter (Nafeza applicability) ============

/**
 * Apply (or refresh) the Egypt RoRo adapter for a USTN. Determines Nafeza
 * applicability, generates a candidate UCR if applicable, and persists the
 * adapter configuration. Idempotent — upserts on ustn.
 *
 * Per Art 77: does NOT blindly apply container-only Enhanced Export messages
 * to RoRo. The "Empty Containers" message is intentionally omitted.
 */
export async function applyEgyptRoRoAdapter(
  ustn: string,
  context?: {
    originCountry?: string;
    destinationCountry?: string;
    transitCountries?: string[];
    isExport?: boolean;
    isImport?: boolean;
    isTransit?: boolean;
  },
): Promise<any | null> {
  try {
    if (!ustn) {
      logger.warn("[roro/applyEgyptRoRoAdapter] missing ustn");
      return null;
    }

    // Default: if no context provided, assume Egypt is involved (conservative —
    // caller can re-apply with explicit context if needed).
    const originCountry = context?.originCountry || "EG";
    const destinationCountry = context?.destinationCountry || "EG";
    const transitCountries = context?.transitCountries || [];

    const assessment = determineEgyptRoRoApplicability({
      ustn,
      originCountry,
      destinationCountry,
      transitCountries,
      isExport: context?.isExport,
      isImport: context?.isImport,
      isTransit: context?.isTransit,
    });

    const adapter = await (db as any).egyptRoRoAdapter.upsert({
      where: { ustn },
      create: {
        ustn,
        nafezaApplies: assessment.nafezaApplies,
        ucr: assessment.ucr,
        exportDeclarationRequired: assessment.exportDeclarationRequired,
        transitDeclarationRequired: assessment.transitDeclarationRequired,
        manifestRequired: assessment.manifestRequired,
        shippingAgentMessages: JSON.stringify(assessment.shippingAgentMessages),
        terminalProcessSteps: JSON.stringify(assessment.terminalProcessSteps),
        customsProcedure: assessment.customsProcedure,
        portRequirements: JSON.stringify(assessment.portRequirements),
        unitDocumentationRequired: JSON.stringify(assessment.unitDocumentationRequired),
        destinationRequirements: JSON.stringify(assessment.destinationRequirements),
      },
      update: {
        nafezaApplies: assessment.nafezaApplies,
        ucr: assessment.ucr,
        exportDeclarationRequired: assessment.exportDeclarationRequired,
        transitDeclarationRequired: assessment.transitDeclarationRequired,
        manifestRequired: assessment.manifestRequired,
        shippingAgentMessages: JSON.stringify(assessment.shippingAgentMessages),
        terminalProcessSteps: JSON.stringify(assessment.terminalProcessSteps),
        customsProcedure: assessment.customsProcedure,
        portRequirements: JSON.stringify(assessment.portRequirements),
        unitDocumentationRequired: JSON.stringify(assessment.unitDocumentationRequired),
        destinationRequirements: JSON.stringify(assessment.destinationRequirements),
      },
    });

    logger.info("[roro/applyEgyptRoRoAdapter] applied", {
      ustn,
      nafezaApplies: assessment.nafezaApplies,
      ucr: assessment.ucr,
    });
    return normalizeEgyptAdapter(adapter);
  } catch (e: any) {
    logger.error("[roro/applyEgyptRoRoAdapter] failed", {
      ustn,
      error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Fetch the Egypt RoRo adapter for a USTN (if it exists).
 */
export async function getEgyptRoRoAdapter(ustn: string): Promise<any | null> {
  try {
    if (!ustn) return null;
    const adapter = await (db as any).egyptRoRoAdapter.findUnique({
      where: { ustn },
    });
    if (!adapter) return null;
    return normalizeEgyptAdapter(adapter);
  } catch (e: any) {
    logger.error("[roro/getEgyptRoRoAdapter] failed", {
      ustn,
      error: e?.message || String(e),
    });
    return null;
  }
}

// ============ Normalizers (defensive — never throw on bad JSON) ============

function normalizeShipment(s: any): any {
  if (!s) return null;
  return {
    ...s,
    transitPorts: safeParseArr(s.transitPorts),
    units: (Array.isArray(s.units) ? s.units : []).map(normalizeUnit),
    bookings: Array.isArray(s.bookings) ? s.bookings.map(normalizeBooking) : [],
    yardEvents: Array.isArray(s.yardEvents) ? s.yardEvents.map(normalizeYard) : [],
    gateEvents: Array.isArray(s.gateEvents) ? s.gateEvents : [],
    inspections: Array.isArray(s.inspections)
      ? s.inspections.map(normalizeInspection)
      : [],
    billsOfLading: Array.isArray(s.billsOfLading)
      ? s.billsOfLading.map(normalizeBl)
      : [],
  };
}

function normalizeUnit(u: any): any {
  if (!u) return null;
  return {
    ...u,
    yard: u.yard ? normalizeYard(u.yard) : null,
    inspections: Array.isArray(u.inspections)
      ? u.inspections.map(normalizeInspection)
      : [],
    gateEvents: Array.isArray(u.gateEvents) ? u.gateEvents : [],
  };
}

function normalizeVoyage(v: any): any {
  if (!v) return null;
  return {
    ...v,
    transitPorts: safeParseArr(v.transitPorts),
    bookings: Array.isArray(v.bookings) ? v.bookings.map(normalizeBooking) : [],
  };
}

function normalizeBooking(b: any): any {
  if (!b) return null;
  return {
    ...b,
    specialHandling: safeParseArr(b.specialHandling),
  };
}

function normalizeYard(y: any): any {
  if (!y) return null;
  return { ...y };
}

function normalizeInspection(i: any): any {
  if (!i) return null;
  return {
    ...i,
    preExistingDamage: safeParseArr(i.preExistingDamage),
    newDamage: safeParseArr(i.newDamage),
    photos: safeParseArr(i.photos),
    videos: safeParseArr(i.videos),
    aiDamageAssessment: safeParseObj(i.aiDamageAssessment),
  };
}

function normalizeBl(b: any): any {
  if (!b) return null;
  return {
    ...b,
    transitPorts: safeParseArr(b.transitPorts),
    vinsList: safeParseArr(b.vinsList),
    charges: safeParseObj(b.charges),
  };
}

function normalizeEgyptAdapter(a: any): any {
  if (!a) return null;
  return {
    ...a,
    shippingAgentMessages: safeParseArr(a.shippingAgentMessages),
    terminalProcessSteps: safeParseArr(a.terminalProcessSteps),
    portRequirements: safeParseObj(a.portRequirements),
    unitDocumentationRequired: safeParseArr(a.unitDocumentationRequired),
    destinationRequirements: safeParseObj(a.destinationRequirements),
  };
}

// ============ Helpers: UN/LOCODE → ISO country (best-effort) ============

/**
 * Convert a UN/LOCODE (e.g. "EGDMT" → "EG", "ITTRI" → "IT") to its 2-letter
 * ISO 3166-1 alpha-2 country code. Falls back to the first 2 chars uppercased.
 */
export function portToCountry(port: string): string {
  const p = String(port || "").toUpperCase().trim();
  if (p.length < 2) return "";
  return p.slice(0, 2);
}

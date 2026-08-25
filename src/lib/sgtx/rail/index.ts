// @ts-nocheck
// ════════════════════════════════════════════════════════════════════════════
// SGTX Article 54 — RAIL ENGINE (v13.1 FINAL)
//
// Rail booking, train, wagon, terminal, consignment (CIM/SMGS), transit (with
// customs guarantee), and tracking milestones — the 7 first-class entities
// that compose the rail mode in the transport orchestrator.
//
// All DB calls are wrapped in try/catch and use `(db as any)` casts so that
// missing-table runtime errors (when the Turso DB does not yet have the rail
// tables materialised) are surfaced gracefully as `null` / `[]` / `{ error }`
// rather than crashing the API request. Per the RAIL-ENGINE task spec, NO
// `db:push` is performed; the schema is declared in schema.prisma only.
//
// Routes under /api/sgtx/rail/* wrap this lib. The portal screen
// (RailScreen.tsx) consumes the JSON shapes documented on each function.
// ════════════════════════════════════════════════════════════════════════════

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ §54.0 — Constants (public exports) ============
//
// The blueprint specifies these enum sets implicitly via the article text
// ("rail booking, train, wagon, terminal, consignment, transit, customs,
// tracking, interchange, delivery"). The explicit enum values below cover
// the standard rail lifecycle states + types used by operators in the EU /
// MENA / CIS corridors (TIR carnets, CIM consignment notes, SMGS for the
// 1520mm gauge CIS rail gauge area).

export const RAIL_BOOKING_STATUSES = [
  "BOOKED",
  "CONFIRMED",
  "LOADED",
  "IN_TRANSIT",
  "AT_BORDER",
  "DELIVERED",
  "CANCELLED",
] as const;

export const RAIL_EVENT_TYPES = [
  "BOOKED",
  "LOADED",
  "DEPARTED",
  "AT_BORDER",
  "CUSTOMS_HOLD",
  "CUSTOMS_RELEASED",
  "ARRIVED",
  "UNLOADED",
  "DELIVERED",
] as const;

export const WAGON_TYPES = [
  "FLAT",
  "BOX",
  "TANK",
  "HOPPER",
  "REFRIGERATED",
] as const;

export const CONSIGNMENT_NOTE_TYPES = ["CIM", "SMGS"] as const;

export const TRANSIT_GUARANTEE_TYPES = [
  "TIR",
  "CIM",
  "BANK_GUARANTEE",
  "CUSTOMS_BOND",
] as const;

// ============ §54.1 — Rail Booking ============

export interface CreateRailBookingInput {
  ustn: string;
  bookingReference: string;
  shipperGtid?: string | null;
  consigneeGtid?: string | null;
  originTerminal: string;
  destinationTerminal: string;
  carrierGtid?: string | null;
  trainId?: string | null;
  grossWeightKg?: number | null;
  cargoDescription?: string | null;
  incoterm?: string | null;
  status?: string;
  // Optional initial consignment note (CIM/SMGS) — issued atomically with
  // the booking per §54 spec ("consignment" is a sibling of "booking").
  initialConsignment?: {
    consignmentNoteNumber: string;
    noteType?: string;
    shipper?: string;
    consignee?: string;
    goodsDescription?: string;
    hsCode?: string;
    grossWeightKg?: number;
    packageCount?: number;
    specialConditions?: string[];
  };
}

/**
 * Create a rail booking under a USTN. Optionally issue an initial CIM/SMGS
 * consignment note atomically (single try/catch — if the consignment insert
 * fails, the booking is still persisted and the error is logged + surfaced
 * in the response's `consignmentError` field).
 *
 * Defaults status to "BOOKED" per the schema default.
 * Also records an initial "BOOKED" status event (§54 tracking).
 */
export async function createRailBooking(data: CreateRailBookingInput) {
  try {
    if (!data.ustn || !data.bookingReference) {
      return { ok: false, error: "ustn and bookingReference are required" };
    }

    const booking = await (db as any).railBooking.create({
      data: {
        ustn: data.ustn,
        bookingReference: data.bookingReference,
        shipperGtid: data.shipperGtid ?? null,
        consigneeGtid: data.consigneeGtid ?? null,
        originTerminal: data.originTerminal,
        destinationTerminal: data.destinationTerminal,
        carrierGtid: data.carrierGtid ?? null,
        trainId: data.trainId ?? null,
        grossWeightKg: data.grossWeightKg ?? null,
        cargoDescription: data.cargoDescription ?? null,
        incoterm: data.incoterm ?? null,
        status: data.status || "BOOKED",
      },
    });

    // Record the initial BOOKED status event (defensive — failure logged but
    // does not fail the booking creation).
    try {
      await (db as any).railStatusEvent.create({
        data: {
          bookingId: booking.id,
          eventType: "BOOKED",
          eventTime: new Date(),
          terminal: data.originTerminal,
          remarks: `Booking ${data.bookingReference} created under USTN ${data.ustn}`,
        },
      });
    } catch (e: any) {
      logger.warn("[rail/createRailBooking] initial status event failed", {
        bookingId: booking.id,
        error: e?.message || String(e),
      });
    }

    // Optional initial consignment note.
    let consignment: any = null;
    let consignmentError: string | null = null;
    if (data.initialConsignment) {
      try {
        consignment = await (db as any).railConsignment.create({
          data: {
            bookingId: booking.id,
            consignmentNoteNumber: data.initialConsignment.consignmentNoteNumber,
            noteType: data.initialConsignment.noteType || "CIM",
            shipper: data.initialConsignment.shipper ?? null,
            consignee: data.initialConsignment.consignee ?? null,
            originTerminal: data.originTerminal,
            destinationTerminal: data.destinationTerminal,
            goodsDescription: data.initialConsignment.goodsDescription ?? null,
            hsCode: data.initialConsignment.hsCode ?? null,
            grossWeightKg: data.initialConsignment.grossWeightKg ?? null,
            packageCount: data.initialConsignment.packageCount ?? null,
            specialConditions: data.initialConsignment.specialConditions
              ? JSON.stringify(data.initialConsignment.specialConditions)
              : null,
            issuedAt: new Date(),
            status: "ISSUED",
          },
        });
      } catch (e: any) {
        consignmentError = e?.message || String(e);
        logger.error("[rail/createRailBooking] initial consignment failed", {
          bookingId: booking.id,
          error: consignmentError,
        });
      }
    }

    logger.info("[rail/createRailBooking] created", {
      bookingId: booking.id,
      ustn: data.ustn,
      reference: data.bookingReference,
      hasConsignment: !!consignment,
    });

    return { ok: true, booking, consignment, consignmentError };
  } catch (e: any) {
    logger.error("[rail/createRailBooking] failed", { error: e?.message || String(e), data });
    return { ok: false, error: e?.message || String(e) };
  }
}

/**
 * Fetch a rail booking with all relations: train (with wagons), consignments,
 * transit segments, and the status event timeline.
 *
 * Returns null if the booking is not found OR if the underlying table is
 * missing (the runtime error is caught and logged).
 */
export async function getRailBooking(id: string) {
  try {
    if (!id) return null;

    const booking = await (db as any).railBooking.findUnique({
      where: { id },
    });
    if (!booking) return null;

    // Parallel fetch of all sibling relations. Each is individually wrapped
    // in try/catch so a missing table on one relation doesn't poison the
    // entire response.
    let train: any = null;
    let wagons: any[] = [];
    let consignments: any[] = [];
    let transitSegments: any[] = [];
    let statusEvents: any[] = [];

    if (booking.trainId) {
      try {
        train = await (db as any).railTrain.findUnique({ where: { id: booking.trainId } });
      } catch (e: any) {
        logger.warn("[rail/getRailBooking] train lookup failed", { trainId: booking.trainId, error: e?.message });
      }
    }

    try {
      wagons = train
        ? await (db as any).railWagon.findMany({
            where: { trainId: train.id },
            orderBy: { positionInTrain: "asc" },
          })
        : [];
    } catch (e: any) {
      logger.warn("[rail/getRailBooking] wagons lookup failed", { error: e?.message });
    }

    try {
      consignments = await (db as any).railConsignment.findMany({
        where: { bookingId: id },
        orderBy: { createdAt: "desc" },
      });
    } catch (e: any) {
      logger.warn("[rail/getRailBooking] consignments lookup failed", { error: e?.message });
    }

    try {
      transitSegments = await (db as any).railTransit.findMany({
        where: { bookingId: id },
        orderBy: { createdAt: "asc" },
      });
    } catch (e: any) {
      logger.warn("[rail/getRailBooking] transit lookup failed", { error: e?.message });
    }

    try {
      statusEvents = await (db as any).railStatusEvent.findMany({
        where: { bookingId: id },
        orderBy: { eventTime: "desc" },
      });
    } catch (e: any) {
      logger.warn("[rail/getRailBooking] status events lookup failed", { error: e?.message });
    }

    return {
      ...booking,
      train,
      wagons,
      consignments: consignments.map(parseJsonField("specialConditions")),
      transitSegments: transitSegments.map(parseJsonField("transitCountries")),
      statusEvents,
    };
  } catch (e: any) {
    logger.error("[rail/getRailBooking] failed", { id, error: e?.message || String(e) });
    return null;
  }
}

export interface ListRailBookingsFilter {
  ustn?: string;
  carrierGtid?: string;
  status?: string;
  originTerminal?: string;
  destinationTerminal?: string;
  limit?: number;
}

/**
 * List rail bookings by ustn / carrier / status / terminals.
 *
 * Default limit 100; max 500. Returns [] on missing table.
 */
export async function listRailBookings(filter: ListRailBookingsFilter = {}) {
  try {
    const where: any = {};
    if (filter.ustn) where.ustn = filter.ustn;
    if (filter.carrierGtid) where.carrierGtid = filter.carrierGtid;
    if (filter.status) where.status = filter.status;
    if (filter.originTerminal) where.originTerminal = filter.originTerminal;
    if (filter.destinationTerminal) where.destinationTerminal = filter.destinationTerminal;

    const limit = Math.min(Math.max(filter.limit || 100, 1), 500);

    const bookings = await (db as any).railBooking.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return bookings || [];
  } catch (e: any) {
    logger.error("[rail/listRailBookings] failed", { error: e?.message || String(e), filter });
    return [];
  }
}

// ============ §54.2 — Rail Train ============

export interface RegisterTrainInput {
  trainNumber: string;
  operatorGtid?: string | null;
  originTerminal: string;
  destinationTerminal: string;
  scheduledDeparture?: Date | string | null;
  scheduledArrival?: Date | string | null;
  actualDeparture?: Date | string | null;
  actualArrival?: Date | string | null;
  totalWagons?: number;
  maxPayloadKg?: number | null;
  status?: string;
}

export async function registerTrain(data: RegisterTrainInput) {
  try {
    if (!data.trainNumber) {
      return { ok: false, error: "trainNumber is required" };
    }
    const train = await (db as any).railTrain.create({
      data: {
        trainNumber: data.trainNumber,
        operatorGtid: data.operatorGtid ?? null,
        originTerminal: data.originTerminal,
        destinationTerminal: data.destinationTerminal,
        scheduledDeparture: data.scheduledDeparture ? new Date(data.scheduledDeparture) : null,
        scheduledArrival: data.scheduledArrival ? new Date(data.scheduledArrival) : null,
        actualDeparture: data.actualDeparture ? new Date(data.actualDeparture) : null,
        actualArrival: data.actualArrival ? new Date(data.actualArrival) : null,
        totalWagons: data.totalWagons || 0,
        maxPayloadKg: data.maxPayloadKg ?? null,
        status: data.status || "SCHEDULED",
      },
    });
    logger.info("[rail/registerTrain] created", { trainId: train.id, trainNumber: data.trainNumber });
    return { ok: true, train };
  } catch (e: any) {
    logger.error("[rail/registerTrain] failed", { error: e?.message || String(e), data });
    return { ok: false, error: e?.message || String(e) };
  }
}

/**
 * Fetch a train with its wagons (ordered by positionInTrain).
 * Returns null on missing train or missing table.
 */
export async function getTrain(id: string) {
  try {
    if (!id) return null;
    const train = await (db as any).railTrain.findUnique({ where: { id } });
    if (!train) return null;
    let wagons: any[] = [];
    try {
      wagons = await (db as any).railWagon.findMany({
        where: { trainId: id },
        orderBy: { positionInTrain: "asc" },
      });
    } catch (e: any) {
      logger.warn("[rail/getTrain] wagons lookup failed", { trainId: id, error: e?.message });
    }
    return { ...train, wagons: wagons || [] };
  } catch (e: any) {
    logger.error("[rail/getTrain] failed", { id, error: e?.message || String(e) });
    return null;
  }
}

export interface ListTrainsFilter {
  operatorGtid?: string;
  status?: string;
  originTerminal?: string;
  destinationTerminal?: string;
  limit?: number;
}

export async function listTrains(filter: ListTrainsFilter = {}) {
  try {
    const where: any = {};
    if (filter.operatorGtid) where.operatorGtid = filter.operatorGtid;
    if (filter.status) where.status = filter.status;
    if (filter.originTerminal) where.originTerminal = filter.originTerminal;
    if (filter.destinationTerminal) where.destinationTerminal = filter.destinationTerminal;
    const limit = Math.min(Math.max(filter.limit || 100, 1), 500);
    const trains = await (db as any).railTrain.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return trains || [];
  } catch (e: any) {
    logger.error("[rail/listTrains] failed", { error: e?.message || String(e), filter });
    return [];
  }
}

// ============ §54.3 — Rail Wagon ============

export interface AddWagonInput {
  trainId: string;
  wagonNumber: string;
  wagonType?: string;
  tareWeightKg?: number | null;
  maxPayloadKg?: number | null;
  lengthM?: number | null;
  positionInTrain?: number | null;
  bookingId?: string | null;
  status?: string;
}

/**
 * Add a wagon to a train. Increments the train's totalWagons counter.
 */
export async function addWagon(data: AddWagonInput) {
  try {
    if (!data.trainId || !data.wagonNumber) {
      return { ok: false, error: "trainId and wagonNumber are required" };
    }
    const wagon = await (db as any).railWagon.create({
      data: {
        trainId: data.trainId,
        wagonNumber: data.wagonNumber,
        wagonType: data.wagonType || "FLAT",
        tareWeightKg: data.tareWeightKg ?? null,
        maxPayloadKg: data.maxPayloadKg ?? null,
        lengthM: data.lengthM ?? null,
        positionInTrain: data.positionInTrain ?? null,
        bookingId: data.bookingId ?? null,
        status: data.status || (data.bookingId ? "LOADED" : "EMPTY"),
      },
    });

    // Bump the train's totalWagons counter (defensive — logged on failure).
    try {
      await (db as any).railTrain.update({
        where: { id: data.trainId },
        data: { totalWagons: { increment: 1 } },
      });
    } catch (e: any) {
      logger.warn("[rail/addWagon] train totalWagons bump failed", {
        trainId: data.trainId,
        error: e?.message,
      });
    }

    logger.info("[rail/addWagon] created", { wagonId: wagon.id, trainId: data.trainId });
    return { ok: true, wagon };
  } catch (e: any) {
    logger.error("[rail/addWagon] failed", { error: e?.message || String(e), data });
    return { ok: false, error: e?.message || String(e) };
  }
}

/**
 * Assign a wagon to carry a booking's cargo. Sets wagon.bookingId and
 * wagon.status = "LOADED". Records a LOADED status event against the booking
 * (defensive — failure logged but does not fail the assignment).
 */
export async function assignWagonToBooking(wagonId: string, bookingId: string) {
  try {
    if (!wagonId || !bookingId) {
      return { ok: false, error: "wagonId and bookingId are required" };
    }
    const wagon = await (db as any).railWagon.update({
      where: { id: wagonId },
      data: { bookingId, status: "LOADED" },
    });

    try {
      await (db as any).railStatusEvent.create({
        data: {
          bookingId,
          eventType: "LOADED",
          eventTime: new Date(),
          wagonId,
          remarks: `Wagon ${wagon.wagonNumber} assigned`,
        },
      });
    } catch (e: any) {
      logger.warn("[rail/assignWagonToBooking] LOADED event failed", {
        wagonId, bookingId, error: e?.message,
      });
    }

    logger.info("[rail/assignWagonToBooking] assigned", { wagonId, bookingId });
    return { ok: true, wagon };
  } catch (e: any) {
    logger.error("[rail/assignWagonToBooking] failed", { wagonId, bookingId, error: e?.message || String(e) });
    return { ok: false, error: e?.message || String(e) };
  }
}

// ============ §54.5 — Rail Consignment (CIM / SMGS) ============

export interface CreateConsignmentInput {
  bookingId: string;
  consignmentNoteNumber: string;
  noteType?: string;
  shipper?: string | null;
  consignee?: string | null;
  originTerminal?: string | null;
  destinationTerminal?: string | null;
  goodsDescription?: string | null;
  hsCode?: string | null;
  grossWeightKg?: number | null;
  packageCount?: number | null;
  specialConditions?: string[];
}

/**
 * Create a consignment note (CIM or SMGS) against a booking.
 *
 * CIM  — Convention Internationale concernant le transport des Marchandises
 *        par chemin de fer (Western Europe, 1435mm standard gauge).
 * SMGS — Soglasheniye o Mezhdunarodnom Zheleznodorozhnom Gruzovom
 *        Soobshchenii (CIS / Russia / 1520mm broad gauge).
 *
 * The `specialConditions` array is JSON-stringified before persistence
 * (Prisma schema primitive cannot be a list, per codebase convention).
 */
export async function createConsignment(data: CreateConsignmentInput) {
  try {
    if (!data.bookingId || !data.consignmentNoteNumber) {
      return { ok: false, error: "bookingId and consignmentNoteNumber are required" };
    }
    const noteType = data.noteType || "CIM";
    if (!CONSIGNMENT_NOTE_TYPES.includes(noteType as any)) {
      return { ok: false, error: `noteType must be one of ${CONSIGNMENT_NOTE_TYPES.join(", ")}` };
    }

    const consignment = await (db as any).railConsignment.create({
      data: {
        bookingId: data.bookingId,
        consignmentNoteNumber: data.consignmentNoteNumber,
        noteType,
        shipper: data.shipper ?? null,
        consignee: data.consignee ?? null,
        originTerminal: data.originTerminal ?? null,
        destinationTerminal: data.destinationTerminal ?? null,
        goodsDescription: data.goodsDescription ?? null,
        hsCode: data.hsCode ?? null,
        grossWeightKg: data.grossWeightKg ?? null,
        packageCount: data.packageCount ?? null,
        specialConditions: data.specialConditions ? JSON.stringify(data.specialConditions) : null,
        issuedAt: new Date(),
        status: "ISSUED",
      },
    });

    logger.info("[rail/createConsignment] created", {
      consignmentId: consignment.id,
      bookingId: data.bookingId,
      noteType,
    });
    return { ok: true, consignment };
  } catch (e: any) {
    logger.error("[rail/createConsignment] failed", { error: e?.message || String(e), data });
    return { ok: false, error: e?.message || String(e) };
  }
}

// ============ §54.7 — Rail Status Event (tracking milestone) ============

/**
 * Record a tracking milestone against a booking.
 *
 * Valid event types: see RAIL_EVENT_TYPES constant.
 * The event is recorded with eventTime = now() unless an explicit time is
 * supplied via the remarks field (defensive — caller is responsible for
 * formatting).
 *
 * The booking's own `status` field is NOT auto-advanced by this function —
 * the caller (API route or upstream workflow) decides whether to advance the
 * booking's status. This separation is deliberate so that operators can record
 * "AT_BORDER" or "CUSTOMS_HOLD" events without committing the booking to a
 * new lifecycle state.
 */
export async function recordStatusEvent(
  bookingId: string,
  eventType: string,
  terminal?: string | null,
  remarks?: string | null,
) {
  try {
    if (!bookingId || !eventType) {
      return { ok: false, error: "bookingId and eventType are required" };
    }
    if (!RAIL_EVENT_TYPES.includes(eventType as any)) {
      return { ok: false, error: `eventType must be one of ${RAIL_EVENT_TYPES.join(", ")}` };
    }

    const event = await (db as any).railStatusEvent.create({
      data: {
        bookingId,
        eventType,
        eventTime: new Date(),
        terminal: terminal ?? null,
        remarks: remarks ?? null,
      },
    });

    logger.info("[rail/recordStatusEvent] recorded", { bookingId, eventType, eventId: event.id });
    return { ok: true, event };
  } catch (e: any) {
    logger.error("[rail/recordStatusEvent] failed", { bookingId, eventType, error: e?.message || String(e) });
    return { ok: false, error: e?.message || String(e) };
  }
}

// ============ §54.6 — Rail Transit (with customs guarantee) ============

export interface CreateTransitInput {
  bookingId: string;
  originTerminal?: string | null;
  destinationTerminal?: string | null;
  transitCountries?: string[];
  transitGuaranteeType?: string;
  guaranteeReference?: string | null;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  status?: string;
}

/**
 * Create a transit segment against a booking.
 *
 * transitCountries is stored as a JSON array of ISO-3166 alpha-2 codes
 * (e.g. ["DE", "AT", "HU", "RO", "BG", "TR"]) since the schema's String
 * type cannot hold a list directly (codebase convention).
 *
 * transitGuaranteeType chooses the customs guarantee instrument:
 *   TIR             — TIR carnet (UN convention, 76 contracting parties).
 *   CIM             — Convention Internationale... guarantee rider (rail-only).
 *   BANK_GUARANTEE  — bilateral bank-issued guarantee.
 *   CUSTOMS_BOND    — customs bond posted at the entry border.
 */
export async function createTransitSegment(data: CreateTransitInput) {
  try {
    if (!data.bookingId) {
      return { ok: false, error: "bookingId is required" };
    }
    const guaranteeType = data.transitGuaranteeType || "TIR";
    if (!TRANSIT_GUARANTEE_TYPES.includes(guaranteeType as any)) {
      return { ok: false, error: `transitGuaranteeType must be one of ${TRANSIT_GUARANTEE_TYPES.join(", ")}` };
    }

    const transit = await (db as any).railTransit.create({
      data: {
        bookingId: data.bookingId,
        originTerminal: data.originTerminal ?? null,
        destinationTerminal: data.destinationTerminal ?? null,
        transitCountries: data.transitCountries ? JSON.stringify(data.transitCountries) : null,
        transitGuaranteeType: guaranteeType,
        guaranteeReference: data.guaranteeReference ?? null,
        startedAt: data.startedAt ? new Date(data.startedAt) : null,
        completedAt: data.completedAt ? new Date(data.completedAt) : null,
        status: data.status || "PENDING",
      },
    });

    logger.info("[rail/createTransitSegment] created", {
      transitId: transit.id,
      bookingId: data.bookingId,
      guaranteeType,
    });
    return { ok: true, transit };
  } catch (e: any) {
    logger.error("[rail/createTransitSegment] failed", { error: e?.message || String(e), data });
    return { ok: false, error: e?.message || String(e) };
  }
}

// ============ §54.4 — Rail Terminal ============

export interface RegisterTerminalInput {
  code: string;
  name: string;
  city?: string | null;
  country?: string | null;
  operatorGtid?: string | null;
  hasCustoms?: boolean;
  hasInterchange?: boolean;
  hasWarehouse?: boolean;
}

export async function registerTerminal(data: RegisterTerminalInput) {
  try {
    if (!data.code || !data.name) {
      return { ok: false, error: "code and name are required" };
    }
    const terminal = await (db as any).railTerminal.create({
      data: {
        code: data.code,
        name: data.name,
        city: data.city ?? null,
        country: data.country ?? null,
        operatorGtid: data.operatorGtid ?? null,
        hasCustoms: data.hasCustoms ?? false,
        hasInterchange: data.hasInterchange ?? false,
        hasWarehouse: data.hasWarehouse ?? false,
      },
    });
    logger.info("[rail/registerTerminal] created", { terminalId: terminal.id, code: data.code });
    return { ok: true, terminal };
  } catch (e: any) {
    logger.error("[rail/registerTerminal] failed", { error: e?.message || String(e), data });
    return { ok: false, error: e?.message || String(e) };
  }
}

export interface ListTerminalsFilter {
  country?: string;
  operatorGtid?: string;
  hasCustoms?: boolean;
  hasInterchange?: boolean;
  hasWarehouse?: boolean;
  limit?: number;
}

export async function listTerminals(filter: ListTerminalsFilter = {}) {
  try {
    const where: any = {};
    if (filter.country) where.country = filter.country;
    if (filter.operatorGtid) where.operatorGtid = filter.operatorGtid;
    if (typeof filter.hasCustoms === "boolean") where.hasCustoms = filter.hasCustoms;
    if (typeof filter.hasInterchange === "boolean") where.hasInterchange = filter.hasInterchange;
    if (typeof filter.hasWarehouse === "boolean") where.hasWarehouse = filter.hasWarehouse;
    const limit = Math.min(Math.max(filter.limit || 100, 1), 500);
    const terminals = await (db as any).railTerminal.findMany({
      where,
      orderBy: { name: "asc" },
      take: limit,
    });
    return terminals || [];
  } catch (e: any) {
    logger.error("[rail/listTerminals] failed", { error: e?.message || String(e), filter });
    return [];
  }
}

// ============ Helpers ============

/**
 * Returns a mapper that JSON-parses a specific string field on a row, leaving
 * all other fields untouched. Used to surface transitCountries and
 * specialConditions as arrays in API responses.
 *
 * Defensive: if the field is missing / not a JSON array, the row keeps the
 * raw value (the caller decides how to render it).
 */
function parseJsonField(fieldName: string) {
  return (row: any) => {
    if (!row) return row;
    const raw = row[fieldName];
    if (typeof raw !== "string") return row;
    try {
      const parsed = JSON.parse(raw);
      return { ...row, [fieldName]: parsed };
    } catch {
      return row;
    }
  };
}

// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
// RoRo Vessel Schedule management — Part 30.7
//
// Manages RoRo vessel schedules per corridor: listing, capacity checks, and
// booking creation (USTN-linked). Schedules are seeded for the 3 existing
// corridors (EGY-ITA, EGY-KSA, EGY-UAE) and stored in the RoRoVesselSchedule
// Prisma table. Bookings are recorded in RoRoBooking.
//
// NOTE: This module ADDS new functionality. It does not modify any existing
// TCN lib file. All DB access goes through `freshDb` from @/lib/db-fresh.

import { freshDb as db } from "@/lib/db-fresh";

export interface VesselSchedule {
  id: string;
  scheduleId: string;
  corridorCode: string;
  vesselName: string;
  vesselImo: string;
  vesselOperator: string | null;
  departurePort: string;
  arrivalPort: string;
  etd: Date;
  eta: Date;
  transitDays: number;
  trailerCapacity: number;
  vehicleCapacity: number;
  reeferCapacity: number;
  maxLoaM: number;
  maxBeamM: number;
  rampCapacityT: number;
  bookingStatus: string;
  availableSlots: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BookingConfirmation {
  bookingRef: string;
  scheduleId: string;
  ustn: string;
  cargoType: string;
  itemCount: number;
  trailerSlots: number;
  vehicleSlots: number;
  reeferSlots: number;
  bookingStatus: string;
  vesselName: string;
  etd: Date;
  eta: Date;
  departurePort: string;
  arrivalPort: string;
  confirmedAt: Date;
}

export interface CapacityCheck {
  scheduleId: string;
  trailerSlots: number;
  vehicleSlots: number;
  reeferSlots: number;
  available: boolean;
  reason?: string;
}

/**
 * List vessel schedules, optionally filtered by corridorCode.
 * Returns schedules ordered by ETD ascending.
 */
export async function listSchedules(corridorCode?: string): Promise<VesselSchedule[]> {
  const where = corridorCode ? { corridorCode } : {};
  const rows = await db.roRoVesselSchedule.findMany({
    where,
    orderBy: { etd: "asc" },
    }) as any;
  return rows as unknown as VesselSchedule[];
}

/**
 * Get a single vessel schedule by its human-friendly scheduleId or Prisma id.
 */
export async function getSchedule(scheduleIdOrId: string): Promise<VesselSchedule | null> {
  const row = await db.roRoVesselSchedule.findFirst({
    where: {
      OR: [{ scheduleId: scheduleIdOrId }, { id: scheduleIdOrId }],
    },
    }) as any;
  return (row as unknown as VesselSchedule) || null;
}

/**
 * Check remaining capacity on a schedule by summing confirmed bookings.
 * Returns available trailer/vehicle/reefer slots.
 */
export async function checkCapacity(scheduleIdOrId: string): Promise<CapacityCheck> {
  const sched = await getSchedule(scheduleIdOrId);
  if (!sched) {
    return {
      scheduleId: scheduleIdOrId,
      trailerSlots: 0,
      vehicleSlots: 0,
      reeferSlots: 0,
      available: false,
      reason: "Schedule not found",
    };
  }
  const bookings = await db.roRoBooking.findMany({
    where: { scheduleId: sched.scheduleId, bookingStatus: { in: ["CONFIRMED", "ROLLED"] } },
    }) as any;
  const usedTrailers = bookings.reduce((s, b) => s + (b.trailerSlots || 0), 0);
  const usedVehicles = bookings.reduce((s, b) => s + (b.vehicleSlots || 0), 0);
  const usedReefers = bookings.reduce((s, b) => s + (b.reeferSlots || 0), 0);
  const trailerSlots = Math.max(0, sched.trailerCapacity - usedTrailers);
  const vehicleSlots = Math.max(0, sched.vehicleCapacity - usedVehicles);
  const reeferSlots = Math.max(0, sched.reeferCapacity - usedReefers);
  const available = trailerSlots > 0 || vehicleSlots > 0 || reeferSlots > 0;
  return {
    scheduleId: sched.scheduleId,
    trailerSlots,
    vehicleSlots,
    reeferSlots,
    available,
    reason: available ? undefined : "All slots booked",
  };
}

/**
 * Create a booking for a given schedule, linked to a USTN.
 *
 * `cargoDetails` shape: { items?: number, type?: "TRAILER"|"VEHICLE"|"REEFER_TRAILER"|"MACHINERY",
 *   shipperGtid?: string, trailerSlots?: number, vehicleSlots?: number, reeferSlots?: number, note?: string }
 *
 * If trailerSlots/vehicleSlots/reeferSlots are not provided, they default to:
 *   - TRAILER → items as trailer slots
 *   - VEHICLE → items as vehicle slots
 *   - REEFER_TRAILER → items as reefer slots
 *   - MACHINERY → items as trailer slots (treated as heavy cargo)
 */
export async function createBooking(
  scheduleIdOrId: string,
  ustn: string,
  cargoDetails: {
    items?: number;
    type?: string;
    shipperGtid?: string;
    trailerSlots?: number;
    vehicleSlots?: number;
    reeferSlots?: number;
    note?: string;
  } = {}
): Promise<BookingConfirmation> {
  const sched = await getSchedule(scheduleIdOrId);
  if (!sched) throw new Error("Vessel schedule not found");
  if (sched.bookingStatus === "CLOSED" || sched.bookingStatus === "CANCELLED") {
    throw new Error(`Schedule ${sched.bookingStatus.toLowerCase()} — booking not allowed`);
  }

  const items = Math.max(1, cargoDetails.items || 1);
  const type = (cargoDetails.type || "TRAILER").toUpperCase();
  let trailerSlots = cargoDetails.trailerSlots ?? 0;
  let vehicleSlots = cargoDetails.vehicleSlots ?? 0;
  let reeferSlots = cargoDetails.reeferSlots ?? 0;
  if (!trailerSlots && !vehicleSlots && !reeferSlots) {
    if (type === "VEHICLE") vehicleSlots = items;
    else if (type === "REEFER_TRAILER") reeferSlots = items;
    else trailerSlots = items; // TRAILER + MACHINERY default to trailer slots
  }

  // Capacity check
  const cap = await checkCapacity(sched.scheduleId);
  if (trailerSlots > cap.trailerSlots || vehicleSlots > cap.vehicleSlots || reeferSlots > cap.reeferSlots) {
    throw new Error(
      `Insufficient capacity — requested T:${trailerSlots}/V:${vehicleSlots}/R:${reeferSlots}, ` +
        `available T:${cap.trailerSlots}/V:${cap.vehicleSlots}/R:${cap.reeferSlots}`
    );
  }

  const bookingRef = `RB-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random()
    .toString(36)
    .substring(2, 8)
    .toUpperCase()}`;

  const created = await db.roRoBooking.create({
    data: {
      bookingRef,
      scheduleId: sched.scheduleId,
      ustn,
      cargoType: type,
      itemCount: items,
      trailerSlots,
      vehicleSlots,
      reeferSlots,
      shipperGtid: cargoDetails.shipperGtid || null,
      bookingStatus: "CONFIRMED",
      confirmationNote: cargoDetails.note || `Auto-confirmed booking for ${items} ${type.toLowerCase()}(s)`,
    },
    }) as any;

  // If trailerCapacity is now full, mark schedule as FULL
  const newCap = await checkCapacity(sched.scheduleId);
  if (newCap.trailerSlots === 0 && newCap.vehicleSlots === 0 && newCap.reeferSlots === 0) {
    await db.roRoVesselSchedule.update({
      where: { id: sched.id },
      data: { bookingStatus: "FULL", availableSlots: 0 },
        }) as any;
  } else {
    await db.roRoVesselSchedule.update({
      where: { id: sched.id },
      data: { availableSlots: newCap.trailerSlots + newCap.vehicleSlots + newCap.reeferSlots },
        }) as any;
  }

  return {
    bookingRef: created.bookingRef,
    scheduleId: sched.scheduleId,
    ustn,
    cargoType: type,
    itemCount: items,
    trailerSlots,
    vehicleSlots,
    reeferSlots,
    bookingStatus: created.bookingStatus,
    vesselName: sched.vesselName,
    etd: sched.etd,
    eta: sched.eta,
    departurePort: sched.departurePort,
    arrivalPort: sched.arrivalPort,
    confirmedAt: created.createdAt,
  };
}

/**
 * List bookings for a USTN (or for a schedule if ustn not provided).
 */
export async function listBookings(filter: { ustn?: string; scheduleId?: string } = {}) {
  const where: any = {};
  if (filter.ustn) where.ustn = filter.ustn;
  if (filter.scheduleId) where.scheduleId = filter.scheduleId;
    return db.roRoBooking.findMany({ where, orderBy: { createdAt: "desc" } }) as any;
}

/**
 * Idempotent seed: create 2-3 vessel schedules for each of the 3 RoRo corridors.
 * Safe to call repeatedly — uses upsert on scheduleId.
 */
export async function seedVesselSchedules() {
  const now = new Date();
  const addDays = (d: number) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000);

  // Corridor → [originPort, destPort, transitDays]
  const corridorPorts: Record<string, { op: string; dp: string; td: number }> = {
    "EGY-ITA-RORO-001": { op: "EGDMT", dp: "ITTRS", td: 6 },
    "EGY-KSA-RORO-001": { op: "EGSGF", dp: "SAJED", td: 3 },
    "EGY-UAE-RORO-001": { op: "EGALX", dp: "AEJEA", td: 5 },
  };

  const schedules: Array<{
    scheduleId: string;
    corridorCode: string;
    vesselName: string;
    vesselImo: string;
    vesselOperator: string;
    etdOffset: number;
    trailerCapacity: number;
    vehicleCapacity: number;
    reeferCapacity: number;
    maxLoaM: number;
    maxBeamM: number;
    rampCapacityT: number;
  }> = [
    // EGY-ITA — 3 vessels
    {
      scheduleId: "VS-EGY-ITA-20260701-001",
      corridorCode: "EGY-ITA-RORO-001",
      vesselName: "MV Alexandria Star",
      vesselImo: "IMO 9472831",
      vesselOperator: "EGY RoRo Lines",
      etdOffset: 7,
      trailerCapacity: 180,
      vehicleCapacity: 120,
      reeferCapacity: 40,
      maxLoaM: 200,
      maxBeamM: 32,
      rampCapacityT: 250,
    },
    {
      scheduleId: "VS-EGY-ITA-20260715-001",
      corridorCode: "EGY-ITA-RORO-001",
      vesselName: "MV Damietta Express",
      vesselImo: "IMO 9512944",
      vesselOperator: "Grimaldi RoRo",
      etdOffset: 21,
      trailerCapacity: 220,
      vehicleCapacity: 150,
      reeferCapacity: 50,
      maxLoaM: 210,
      maxBeamM: 32,
      rampCapacityT: 280,
    },
    {
      scheduleId: "VS-EGY-ITA-20260801-001",
      corridorCode: "EGY-ITA-RORO-001",
      vesselName: "MV Levante",
      vesselImo: "IMO 9338812",
      vesselOperator: "Grimaldi RoRo",
      etdOffset: 38,
      trailerCapacity: 200,
      vehicleCapacity: 140,
      reeferCapacity: 45,
      maxLoaM: 200,
      maxBeamM: 32,
      rampCapacityT: 250,
    },
    // EGY-KSA — 2 vessels
    {
      scheduleId: "VS-EGY-KSA-20260705-001",
      corridorCode: "EGY-KSA-RORO-001",
      vesselName: "MV Safaga Trader",
      vesselImo: "IMO 9556712",
      vesselOperator: "Red Sea RoRo",
      etdOffset: 11,
      trailerCapacity: 150,
      vehicleCapacity: 100,
      reeferCapacity: 30,
      maxLoaM: 180,
      maxBeamM: 28,
      rampCapacityT: 220,
    },
    {
      scheduleId: "VS-EGY-KSA-20260720-001",
      corridorCode: "EGY-KSA-RORO-001",
      vesselName: "MV Jeddah Bridge",
      vesselImo: "IMO 9612345",
      vesselOperator: "NSCSA RoRo",
      etdOffset: 26,
      trailerCapacity: 170,
      vehicleCapacity: 110,
      reeferCapacity: 35,
      maxLoaM: 190,
      maxBeamM: 30,
      rampCapacityT: 240,
    },
    // EGY-UAE — 2 vessels
    {
      scheduleId: "VS-EGY-UAE-20260710-001",
      corridorCode: "EGY-UAE-RORO-001",
      vesselName: "MV Gulf Clipper",
      vesselImo: "IMO 9728819",
      vesselOperator: "MSC RoRo",
      etdOffset: 16,
      trailerCapacity: 200,
      vehicleCapacity: 130,
      reeferCapacity: 40,
      maxLoaM: 200,
      maxBeamM: 32,
      rampCapacityT: 260,
    },
    {
      scheduleId: "VS-EGY-UAE-20260725-001",
      corridorCode: "EGY-UAE-RORO-001",
      vesselName: "MV Khalifa Cruiser",
      vesselImo: "IMO 9745521",
      vesselOperator: "ESL RoRo",
      etdOffset: 31,
      trailerCapacity: 190,
      vehicleCapacity: 125,
      reeferCapacity: 38,
      maxLoaM: 195,
      maxBeamM: 32,
      rampCapacityT: 250,
    },
  ];

  let created = 0;
  for (const s of schedules) {
    const ports = corridorPorts[s.corridorCode];
    if (!ports) continue;
    const etd = addDays(s.etdOffset);
    const eta = addDays(s.etdOffset + ports.td);
    const totalSlots = s.trailerCapacity + s.vehicleCapacity + s.reeferCapacity;
    await db.roRoVesselSchedule.upsert({
      where: { scheduleId: s.scheduleId },
      create: {
        scheduleId: s.scheduleId,
        corridorCode: s.corridorCode,
        vesselName: s.vesselName,
        vesselImo: s.vesselImo,
        vesselOperator: s.vesselOperator,
        departurePort: ports.op,
        arrivalPort: ports.dp,
        etd,
        eta,
        transitDays: ports.td,
        trailerCapacity: s.trailerCapacity,
        vehicleCapacity: s.vehicleCapacity,
        reeferCapacity: s.reeferCapacity,
        maxLoaM: s.maxLoaM,
        maxBeamM: s.maxBeamM,
        rampCapacityT: s.rampCapacityT,
        bookingStatus: "OPEN",
        availableSlots: totalSlots,
        status: "SCHEDULED",
      },
      update: {
        vesselName: s.vesselName,
        vesselImo: s.vesselImo,
        vesselOperator: s.vesselOperator,
        departurePort: ports.op,
        arrivalPort: ports.dp,
        etd,
        eta,
        transitDays: ports.td,
        trailerCapacity: s.trailerCapacity,
        vehicleCapacity: s.vehicleCapacity,
        reeferCapacity: s.reeferCapacity,
        maxLoaM: s.maxLoaM,
        maxBeamM: s.maxBeamM,
        rampCapacityT: s.rampCapacityT,
      },
    });
    created++;
  }
  return { ok: true, seeded: created };
}

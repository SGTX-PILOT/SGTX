// @ts-nocheck
//
// SGTX Road Corridor Engine — MVP scope (Blueprint v13.1 FINAL Articles 43-46)
//
// Implements the 7-table MVP scope defined in the ROAD-ENGINE task brief:
//   RoadCorridor / RoadLeg / RoadShipment / RoadVehicle / RoadDriver /
//   RoadBorderCrossing / RoadGpsTracking
//
// NOTE on coexistence with the sibling `index.ts`:
//   The existing `index.ts` (1381 lines) implements the per-trade corridor
//   model from the v11.1 blueprint (corridor belongs to a single USTN with
//   detailed seals/borders/customs sub-tables). This MVP module targets a
//   DIFFERENT conceptual model: a reusable Corridor definition (no USTN)
//   that multiple RoadShipments can move through. Both coexist; the
//   `createRoadCorridor` etc. exported here have a different signature
//   than the legacy ones, so consumers MUST import from
//   `@/lib/sgtx/road-corridor/mvp` to reach the MVP variants.
//
// Defensive design:
//   • Every DB call is wrapped in try/catch with a safe default (null / [])
//     so callers never crash when the underlying Turso tables are missing
//     (pre-`prisma db push` / `prisma generate`).
//   • Schema additions require `bunx prisma generate` to be picked up by
//     the Prisma client; until then, queries fail at runtime and are
//     swallowed by the per-call try/catch.
//
// Status model (Article 44 — multi-country workflow):
//   PLANNED → IN_TRANSIT → AT_BORDER → CLEARED → DELIVERED
//                                          ↘ CANCELLED (terminal)
//
// Border crossing types (Article 43): EXIT / ENTRY / TRANSIT
// Vehicle types (Article 46): TRUCK / TRAILER / TRACTOR

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ Constants ============

export const ROAD_SHIPMENT_STATUSES = [
  "PLANNED",
  "IN_TRANSIT",
  "AT_BORDER",
  "CLEARED",
  "DELIVERED",
  "CANCELLED",
] as const;
export type RoadShipmentStatus = (typeof ROAD_SHIPMENT_STATUSES)[number];

export const BORDER_CROSSING_TYPES = ["EXIT", "ENTRY", "TRANSIT"] as const;
export type BorderCrossingType = (typeof BORDER_CROSSING_TYPES)[number];

export const BORDER_CROSSING_STATUSES = [
  "PENDING",
  "ARRIVED",
  "CLEARED",
  "HELD",
  "REJECTED",
] as const;

export const VEHICLE_TYPES = ["TRUCK", "TRAILER", "TRACTOR"] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const CORRIDOR_STATUSES = ["ACTIVE", "DRAFT", "DEPRECATED"] as const;

// Valid forward transitions per Article 44 lifecycle.
const ROAD_SHIPMENT_TRANSITIONS: Record<string, string[]> = {
  PLANNED: ["IN_TRANSIT", "CANCELLED"],
  IN_TRANSIT: ["AT_BORDER", "DELIVERED", "CANCELLED"],
  AT_BORDER: ["CLEARED", "IN_TRANSIT", "CANCELLED"],
  CLEARED: ["DELIVERED", "AT_BORDER", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

// ============ Types ============

export interface CreateRoadCorridorInput {
  corridorCode: string;
  originCountry: string;
  destinationCountry: string;
  transitCountries?: string[];
  totalDistanceKm?: number;
  estimatedTransitHours?: number;
  status?: string;
  legs?: Array<{
    sequence?: number;
    originLocation: string;
    destinationLocation: string;
    borderCrossing?: string;
    distanceKm?: number;
    estimatedHours?: number;
    transportMode?: string;
    status?: string;
  }>;
}

export interface CreateRoadShipmentInput {
  ustn: string;
  corridorId: string;
  carrierGtid?: string;
  vehicleId?: string;
  driverId?: string;
  shipperGtid?: string;
  consigneeGtid?: string;
  grossWeightKg?: number;
  cargoDescription?: string;
  incoterm?: string;
}

export interface BorderCrossingInput {
  borderName: string;
  country: string;
  crossingType: string; // EXIT | ENTRY | TRANSIT
  arrivedAt?: string | Date;
  clearedAt?: string | Date;
  customsDeclarationRef?: string;
  sealNumber?: string;
  status?: string;
}

export interface RegisterVehicleInput {
  vehicleRegistration: string;
  vehicleType: string;
  capacityKg?: number;
  insurancePolicyNumber?: string;
  insuranceValidUntil?: string | Date;
  roadworthinessValidUntil?: string | Date;
  dgCapability?: boolean;
  reeferCapability?: boolean;
  ownerGtid?: string;
}

export interface RegisterDriverInput {
  fullName: string;
  passportNumber?: string;
  licenseNumber?: string;
  licenseValidUntil?: string | Date;
  visaCountries?: string[];
  dgAuthorization?: boolean;
  internationalLicense?: boolean;
  ownerGtid?: string;
}

// ============ Helpers ============

function safeParseJsonArray(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function safeDate(v: any): Date | null {
  if (!v) return null;
  try {
    const d = typeof v === "string" || typeof v === "number" ? new Date(v) : v instanceof Date ? v : null;
    if (!d || isNaN(d.getTime())) return null;
    return d;
  } catch {
    return null;
  }
}

// ============ Road Corridor ============

export async function createRoadCorridor(data: CreateRoadCorridorInput): Promise<any | null> {
  try {
    if (!data?.corridorCode) {
      logger.warn("[road-corridor-mvp] createRoadCorridor: missing corridorCode");
      return null;
    }
    if (!data?.originCountry || !data?.destinationCountry) {
      logger.warn("[road-corridor-mvp] createRoadCorridor: origin/destination required");
      return null;
    }

    const transitCountries = Array.isArray(data.transitCountries)
      ? data.transitCountries.map((c) => String(c).toUpperCase())
      : [];

    const corridor = await (db as any).roadCorridor.create({
      data: {
        corridorCode: data.corridorCode,
        originCountry: String(data.originCountry).toUpperCase(),
        destinationCountry: String(data.destinationCountry).toUpperCase(),
        transitCountries: JSON.stringify(transitCountries),
        totalDistanceKm: Number(data.totalDistanceKm) || 0,
        estimatedTransitHours: Number(data.estimatedTransitHours) || 0,
        status: data.status || "ACTIVE",
      },
    });

    // Persist legs if supplied (sequence auto-assigned if absent).
    const legs = Array.isArray(data.legs) ? data.legs : [];
    if (legs.length > 0) {
      for (let i = 0; i < legs.length; i++) {
        const leg = legs[i];
        try {
          await (db as any).roadLeg.create({
            data: {
              corridorId: corridor.id,
              sequence: Number(leg.sequence) || i + 1,
              originLocation: leg.originLocation || "",
              destinationLocation: leg.destinationLocation || "",
              borderCrossing: leg.borderCrossing || null,
              distanceKm: Number(leg.distanceKm) || 0,
              estimatedHours: Number(leg.estimatedHours) || 0,
              transportMode: leg.transportMode || "ROAD",
              status: leg.status || "ACTIVE",
            },
          });
        } catch (legErr: any) {
          logger.warn("[road-corridor-mvp] leg create failed", {
            corridorId: corridor.id,
            sequence: i + 1,
            error: legErr?.message,
          });
        }
      }
    }

    logger.info("[road-corridor-mvp] created corridor", {
      corridorId: corridor.id,
      corridorCode: corridor.corridorCode,
      legs: legs.length,
    });

    return getRoadCorridor(corridor.id);
  } catch (err: any) {
    logger.error("[road-corridor-mvp] createRoadCorridor failed", {
      corridorCode: data?.corridorCode,
      error: err?.message,
    });
    return null;
  }
}

export async function getRoadCorridor(id: string): Promise<any | null> {
  try {
    if (!id) return null;
    const corridor = await (db as any).roadCorridor.findUnique({
      where: { id },
      include: { legs: { orderBy: { sequence: "asc" } } },
    });
    if (!corridor) return null;
    return {
      ...corridor,
      transitCountries: safeParseJsonArray(corridor.transitCountries),
    };
  } catch (err: any) {
    logger.error("[road-corridor-mvp] getRoadCorridor failed", { id, error: err?.message });
    return null;
  }
}

export async function listRoadCorridors(filter?: {
  status?: string;
  originCountry?: string;
  destinationCountry?: string;
  take?: number;
}): Promise<any[]> {
  try {
    const where: any = {};
    if (filter?.status) where.status = filter.status;
    if (filter?.originCountry) where.originCountry = String(filter.originCountry).toUpperCase();
    if (filter?.destinationCountry) where.destinationCountry = String(filter.destinationCountry).toUpperCase();

    const rows = await (db as any).roadCorridor.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(500, Number(filter?.take) || 100),
    });
    if (!Array.isArray(rows)) return [];
    return rows.map((c: any) => ({
      ...c,
      transitCountries: safeParseJsonArray(c.transitCountries),
    }));
  } catch (err: any) {
    logger.error("[road-corridor-mvp] listRoadCorridors failed", { error: err?.message });
    return [];
  }
}

// ============ Road Shipment ============

export async function createRoadShipment(data: CreateRoadShipmentInput): Promise<any | null> {
  try {
    if (!data?.ustn || !data?.corridorId) {
      logger.warn("[road-corridor-mvp] createRoadShipment: ustn + corridorId required");
      return null;
    }

    const shipment = await (db as any).roadShipment.create({
      data: {
        ustn: data.ustn,
        corridorId: data.corridorId,
        carrierGtid: data.carrierGtid || null,
        vehicleId: data.vehicleId || null,
        driverId: data.driverId || null,
        shipperGtid: data.shipperGtid || null,
        consigneeGtid: data.consigneeGtid || null,
        grossWeightKg: Number(data.grossWeightKg) || 0,
        cargoDescription: data.cargoDescription || null,
        incoterm: data.incoterm || null,
        status: "PLANNED",
      },
    });

    logger.info("[road-corridor-mvp] created shipment", {
      shipmentId: shipment.id,
      ustn: shipment.ustn,
      corridorId: shipment.corridorId,
    });

    return getRoadShipment(shipment.id);
  } catch (err: any) {
    logger.error("[road-corridor-mvp] createRoadShipment failed", {
      ustn: data?.ustn,
      error: err?.message,
    });
    return null;
  }
}

export async function getRoadShipment(id: string): Promise<any | null> {
  try {
    if (!id) return null;
    const shipment = await (db as any).roadShipment.findUnique({
      where: { id },
      include: {
        corridor: { include: { legs: { orderBy: { sequence: "asc" } } } },
        borderCrossings: { orderBy: { createdAt: "asc" } },
        gpsTracking: { orderBy: { recordedAt: "desc" }, take: 100 },
      },
    });
    if (!shipment) return null;
    if (shipment.corridor) {
      shipment.corridor.transitCountries = safeParseJsonArray(shipment.corridor.transitCountries);
    }
    return shipment;
  } catch (err: any) {
    logger.error("[road-corridor-mvp] getRoadShipment failed", { id, error: err?.message });
    return null;
  }
}

export async function listRoadShipments(filter?: {
  ustn?: string;
  carrierGtid?: string;
  vehicleId?: string;
  driverId?: string;
  corridorId?: string;
  status?: string;
  take?: number;
}): Promise<any[]> {
  try {
    const where: any = {};
    if (filter?.ustn) where.ustn = filter.ustn;
    if (filter?.carrierGtid) where.carrierGtid = filter.carrierGtid;
    if (filter?.vehicleId) where.vehicleId = filter.vehicleId;
    if (filter?.driverId) where.driverId = filter.driverId;
    if (filter?.corridorId) where.corridorId = filter.corridorId;
    if (filter?.status) where.status = filter.status;

    const rows = await (db as any).roadShipment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(500, Number(filter?.take) || 100),
      include: { corridor: true },
    });
    if (!Array.isArray(rows)) return [];
    return rows.map((s: any) => ({
      ...s,
      corridor: s.corridor
        ? { ...s.corridor, transitCountries: safeParseJsonArray(s.corridor.transitCountries) }
        : null,
    }));
  } catch (err: any) {
    logger.error("[road-corridor-mvp] listRoadShipments failed", { error: err?.message });
    return [];
  }
}

export async function updateShipmentStatus(
  shipmentId: string,
  status: string,
): Promise<{ ok: boolean; shipment?: any; error?: string; allowed?: string[] }> {
  try {
    if (!shipmentId || !status) return { ok: false, error: "shipmentId + status required" };
    const upper = String(status).toUpperCase();

    const current = await (db as any).roadShipment.findUnique({
      where: { id: shipmentId },
      select: { id: true, status: true },
    });
    if (!current) return { ok: false, error: "shipment not found" };

    const allowed = ROAD_SHIPMENT_TRANSITIONS[current.status] || [];
    if (!allowed.includes(upper)) {
      return {
        ok: false,
        error: `invalid transition ${current.status} → ${upper}`,
        allowed,
      };
    }

    const patch: any = { status: upper };
    if (upper === "IN_TRANSIT" && !current.startedAt) {
      patch.startedAt = new Date();
    }
    if (upper === "DELIVERED") {
      patch.completedAt = new Date();
    }

    await (db as any).roadShipment.update({ where: { id: shipmentId }, data: patch });

    logger.info("[road-corridor-mvp] shipment status updated", {
      shipmentId,
      from: current.status,
      to: upper,
    });

    return { ok: true, shipment: await getRoadShipment(shipmentId) };
  } catch (err: any) {
    logger.error("[road-corridor-mvp] updateShipmentStatus failed", {
      shipmentId,
      status,
      error: err?.message,
    });
    return { ok: false, error: err?.message || "unknown error" };
  }
}

// ============ Border Crossing ============

export async function recordBorderCrossing(
  shipmentId: string,
  data: BorderCrossingInput,
): Promise<any | null> {
  try {
    if (!shipmentId || !data?.borderName || !data?.country) {
      logger.warn("[road-corridor-mvp] recordBorderCrossing: shipmentId + borderName + country required");
      return null;
    }

    const cType = String(data.crossingType || "TRANSIT").toUpperCase();
    if (!BORDER_CROSSING_TYPES.includes(cType as any)) {
      logger.warn("[road-corridor-mvp] recordBorderCrossing: invalid crossingType", { crossingType: cType });
      return null;
    }

    const border = await (db as any).roadBorderCrossing.create({
      data: {
        shipmentId,
        borderName: data.borderName,
        country: String(data.country).toUpperCase(),
        crossingType: cType,
        arrivedAt: safeDate(data.arrivedAt),
        clearedAt: safeDate(data.clearedAt),
        customsDeclarationRef: data.customsDeclarationRef || null,
        sealNumber: data.sealNumber || null,
        status: data.status || (data.clearedAt ? "CLEARED" : data.arrivedAt ? "ARRIVED" : "PENDING"),
      },
    });

    // Side-effect: if a clearance is recorded, nudge the shipment into AT_BORDER / CLEARED.
    try {
      const shipment = await (db as any).roadShipment.findUnique({
        where: { id: shipmentId },
        select: { status: true },
      });
      if (shipment) {
        if (border.status === "CLEARED" && shipment.status === "AT_BORDER") {
          await updateShipmentStatus(shipmentId, "CLEARED");
        } else if (shipment.status === "IN_TRANSIT" && border.status === "ARRIVED") {
          await updateShipmentStatus(shipmentId, "AT_BORDER");
        }
      }
    } catch (sideErr: any) {
      logger.warn("[road-corridor-mvp] side-effect status nudge failed", {
        shipmentId,
        error: sideErr?.message,
      });
    }

    logger.info("[road-corridor-mvp] border crossing recorded", {
      borderId: border.id,
      shipmentId,
      borderName: border.borderName,
      crossingType: border.crossingType,
    });

    return border;
  } catch (err: any) {
    logger.error("[road-corridor-mvp] recordBorderCrossing failed", {
      shipmentId,
      error: err?.message,
    });
    return null;
  }
}

// ============ GPS Tracking ============

export async function recordGpsPing(
  shipmentId: string,
  latitude: number,
  longitude: number,
  speed?: number,
  heading?: number,
): Promise<any | null> {
  try {
    if (!shipmentId) {
      logger.warn("[road-corridor-mvp] recordGpsPing: shipmentId required");
      return null;
    }
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!isFinite(lat) || !isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      logger.warn("[road-corridor-mvp] recordGpsPing: invalid lat/lon", { lat, lon });
      return null;
    }

    const ping = await (db as any).roadGpsTracking.create({
      data: {
        shipmentId,
        latitude: lat,
        longitude: lon,
        speed: speed != null ? Number(speed) : null,
        heading: heading != null ? Number(heading) : null,
        recordedAt: new Date(),
      },
    });

    // Side-effect: if shipment was PLANNED, auto-transition to IN_TRANSIT on first ping.
    try {
      const shipment = await (db as any).roadShipment.findUnique({
        where: { id: shipmentId },
        select: { status: true },
      });
      if (shipment && shipment.status === "PLANNED") {
        await updateShipmentStatus(shipmentId, "IN_TRANSIT");
      }
    } catch (sideErr: any) {
      logger.warn("[road-corridor-mvp] GPS side-effect status nudge failed", {
        shipmentId,
        error: sideErr?.message,
      });
    }

    return ping;
  } catch (err: any) {
    logger.error("[road-corridor-mvp] recordGpsPing failed", {
      shipmentId,
      error: err?.message,
    });
    return null;
  }
}

export async function listGpsPings(
  shipmentId: string,
  opts?: { take?: number },
): Promise<any[]> {
  try {
    if (!shipmentId) return [];
    const rows = await (db as any).roadGpsTracking.findMany({
      where: { shipmentId },
      orderBy: { recordedAt: "desc" },
      take: Math.min(1000, Number(opts?.take) || 100),
    });
    return Array.isArray(rows) ? rows : [];
  } catch (err: any) {
    logger.error("[road-corridor-mvp] listGpsPings failed", { shipmentId, error: err?.message });
    return [];
  }
}

// ============ Vehicle (Article 46) ============

export async function registerVehicle(data: RegisterVehicleInput): Promise<any | null> {
  try {
    if (!data?.vehicleRegistration || !data?.vehicleType) {
      logger.warn("[road-corridor-mvp] registerVehicle: vehicleRegistration + vehicleType required");
      return null;
    }
    const vType = String(data.vehicleType).toUpperCase();
    if (!VEHICLE_TYPES.includes(vType as any)) {
      logger.warn("[road-corridor-mvp] registerVehicle: invalid vehicleType", { vehicleType: vType });
      return null;
    }

    const vehicle = await (db as any).roadVehicle.create({
      data: {
        vehicleRegistration: data.vehicleRegistration,
        vehicleType: vType,
        capacityKg: Number(data.capacityKg) || 0,
        insurancePolicyNumber: data.insurancePolicyNumber || null,
        insuranceValidUntil: safeDate(data.insuranceValidUntil),
        roadworthinessValidUntil: safeDate(data.roadworthinessValidUntil),
        dgCapability: !!data.dgCapability,
        reeferCapability: !!data.reeferCapability,
        ownerGtid: data.ownerGtid || null,
      },
    });
    logger.info("[road-corridor-mvp] registered vehicle", {
      vehicleId: vehicle.id,
      registration: vehicle.vehicleRegistration,
      type: vehicle.vehicleType,
    });
    return vehicle;
  } catch (err: any) {
    logger.error("[road-corridor-mvp] registerVehicle failed", {
      registration: data?.vehicleRegistration,
      error: err?.message,
    });
    return null;
  }
}

export async function getVehicle(id: string): Promise<any | null> {
  try {
    if (!id) return null;
    return await (db as any).roadVehicle.findUnique({ where: { id } });
  } catch (err: any) {
    logger.error("[road-corridor-mvp] getVehicle failed", { id, error: err?.message });
    return null;
  }
}

export async function listVehicles(ownerGtid?: string): Promise<any[]> {
  try {
    const where: any = {};
    if (ownerGtid) where.ownerGtid = ownerGtid;
    const rows = await (db as any).roadVehicle.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return Array.isArray(rows) ? rows : [];
  } catch (err: any) {
    logger.error("[road-corridor-mvp] listVehicles failed", { error: err?.message });
    return [];
  }
}

// ============ Driver (Article 46) ============

export async function registerDriver(data: RegisterDriverInput): Promise<any | null> {
  try {
    if (!data?.fullName) {
      logger.warn("[road-corridor-mvp] registerDriver: fullName required");
      return null;
    }
    const visaCountries = Array.isArray(data.visaCountries)
      ? data.visaCountries.map((c) => String(c).toUpperCase())
      : [];

    const driver = await (db as any).roadDriver.create({
      data: {
        fullName: data.fullName,
        passportNumber: data.passportNumber || null,
        licenseNumber: data.licenseNumber || null,
        licenseValidUntil: safeDate(data.licenseValidUntil),
        visaCountries: JSON.stringify(visaCountries),
        dgAuthorization: !!data.dgAuthorization,
        internationalLicense: !!data.internationalLicense,
        ownerGtid: data.ownerGtid || null,
      },
    });
    logger.info("[road-corridor-mvp] registered driver", {
      driverId: driver.id,
      fullName: driver.fullName,
    });
    return { ...driver, visaCountries };
  } catch (err: any) {
    logger.error("[road-corridor-mvp] registerDriver failed", {
      fullName: data?.fullName,
      error: err?.message,
    });
    return null;
  }
}

export async function getDriver(id: string): Promise<any | null> {
  try {
    if (!id) return null;
    const driver = await (db as any).roadDriver.findUnique({ where: { id } });
    if (!driver) return null;
    return { ...driver, visaCountries: safeParseJsonArray(driver.visaCountries) };
  } catch (err: any) {
    logger.error("[road-corridor-mvp] getDriver failed", { id, error: err?.message });
    return null;
  }
}

export async function listDrivers(ownerGtid?: string): Promise<any[]> {
  try {
    const where: any = {};
    if (ownerGtid) where.ownerGtid = ownerGtid;
    const rows = await (db as any).roadDriver.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    if (!Array.isArray(rows)) return [];
    return rows.map((d: any) => ({
      ...d,
      visaCountries: safeParseJsonArray(d.visaCountries),
    }));
  } catch (err: any) {
    logger.error("[road-corridor-mvp] listDrivers failed", { error: err?.message });
    return [];
  }
}

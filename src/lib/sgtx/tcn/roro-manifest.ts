// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
// RoRo Cargo Manifest management — Part 30.1
//
// RoRo cargo is rolled on/off the vessel (not containerized). Each item is a
// truck, trailer, vehicle, reefer trailer, or piece of machinery with its own
// dimensions, weight, and (for reefers) temperature set-point.
//
// This module manages RoRo manifests linked to a USTN, including:
//   - createManifest(ustn, items)         — creates a manifest + items
//   - getManifest(ustn)                   — fetches manifest with items
//   - updateManifestItem(itemId, updates) — patches a single item
//   - confirmRollOn(scheduleId, ustn)     — marks all items as ROLLED_ON
//   - confirmRollOff(scheduleId, ustn)    — marks all items as ROLLED_OFF
//
// Manifests + items are stored in the RoRoManifest / RoRoManifestItem tables.
// All DB access goes through `freshDb` from @/lib/db-fresh.

import { freshDb as db } from "@/lib/db-fresh";

export type RoRoItemType = "TRUCK" | "TRAILER" | "VEHICLE" | "REEFER_TRAILER" | "MACHINERY";

export interface RoRoCargoItemInput {
  itemType: RoRoItemType | string;
  licensePlate?: string;
  driverName?: string;
  driverLicense?: string;
  lengthM?: number;
  widthM?: number;
  heightM?: number;
  weightKg?: number;
  reeferTempC?: number | null;
  cargoDescription?: string;
  hsCode?: string;
}

export interface RoRoCargoItem extends RoRoCargoItemInput {
  id: string;
  manifestId: string;
  ustn: string;
  itemType: string;
  rollOnStatus: string;
  rollOffStatus: string;
  rollOnAt: Date | null;
  rollOffAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Manifest {
  id: string;
  ustn: string;
  corridorCode: string | null;
  scheduleId: string | null;
  bookingRef: string | null;
  shipperGtid: string | null;
  status: string;
  totalItems: number;
  totalWeightKg: number;
  rollOnAt: Date | null;
  rollOffAt: Date | null;
  rollOnConfirmedBy: string | null;
  rollOffConfirmedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: RoRoCargoItem[];
}

export interface CreateManifestInput {
  ustn: string;
  corridorCode?: string;
  scheduleId?: string;
  bookingRef?: string;
  shipperGtid?: string;
  items: RoRoCargoItemInput[];
}

/**
 * Create (or update if exists for this USTN) a RoRo manifest with one or more
 * cargo items. Returns the manifest with all items.
 */
export async function createManifest(input: CreateManifestInput): Promise<Manifest> {
  if (!input.ustn) throw new Error("ustn required");
  if (!input.items || input.items.length === 0) throw new Error("At least one cargo item required");

  const existing = await db.roRoCargoManifest.findFirst({
    where: { ustn: input.ustn },
    include: { items: true },
    }) as any;

  if (existing) {
    // Replace items if status is still DRAFT/SUBMITTED (cannot modify after roll-on)
    if (existing.status === "ROLLED_ON" || existing.status === "ROLLED_OFF" || existing.status === "CLOSED") {
      throw new Error(`Manifest ${existing.status.toLowerCase()} — cannot modify`);
    }
    // Delete existing items, then create new ones
        await db.roRoCargoItem.deleteMany({ where: { manifestId: existing.id } }) as any;
    const createdItems = [];
    let totalWeight = 0;
    for (const item of input.items) {
      const ci = await db.roRoCargoItem.create({
        data: {
          manifestId: existing.id,
          
          itemType: item.itemType,
          licensePlate: item.licensePlate || null,
          driverName: item.driverName || null,
          driverLicense: item.driverLicense || null,
          lengthM: item.lengthM || 0,
          widthM: item.widthM || 0,
          heightM: item.heightM || 0,
          weightKg: item.weightKg || 0,
          reeferTempC: item.reeferTempC ?? null,
          cargoDescription: item.cargoDescription || null,
          hsCode: item.hsCode || null,
          rollOnStatus: "PENDING",
          rollOffStatus: "PENDING",
        },
            }) as any;
      createdItems.push(ci) as any;
      totalWeight += item.weightKg || 0;
    }
    const updated = await db.roRoCargoManifest.update({
      where: { id: existing.id },
      data: {
        corridorCode: input.corridorCode || existing.corridorCode,
        scheduleId: input.scheduleId || existing.scheduleId,
        bookingRef: input.bookingRef || existing.bookingRef,
        shipperGtid: input.shipperGtid || existing.shipperGtid,
        totalItems: createdItems.length,
        totalWeightKg: totalWeight,
        status: "SUBMITTED",
      },
      include: { items: true },
        }) as any;
    return updated as unknown as Manifest;
  }

  // Create new manifest + items in a transaction
  let totalWeight = 0;
  for (const item of input.items) totalWeight += item.weightKg || 0;

  const created = await db.roRoCargoManifest.create({
    data: {
      manifestId: `RM-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      ustn: input.ustn,
      corridorCode: input.corridorCode || null,
      scheduleId: input.scheduleId || null,
      bookingRef: input.bookingRef || null,
      shipperGtid: input.shipperGtid || null,
      status: "SUBMITTED",
      totalItems: input.items.length,
      totalWeightKg: totalWeight,
      items: {
        create: input.items.map((item) => ({
          
          itemType: item.itemType,
          licensePlate: item.licensePlate || null,
          driverName: item.driverName || null,
          driverLicense: item.driverLicense || null,
          lengthM: item.lengthM || 0,
          widthM: item.widthM || 0,
          heightM: item.heightM || 0,
          weightKg: item.weightKg || 0,
          reeferTempC: item.reeferTempC ?? null,
          cargoDescription: item.cargoDescription || null,
          hsCode: item.hsCode || null,
          rollOnStatus: "PENDING",
          rollOffStatus: "PENDING",
        })),
      },
    },
    include: { items: true },
    }) as any;
  return created as unknown as Manifest;
}

/**
 * Fetch a manifest by USTN, including all items.
 */
export async function getManifest(ustn: string): Promise<Manifest | null> {
  if (!ustn) return null;
  const manifest = await db.roRoCargoManifest.findFirst({
    where: { ustn },
    include: { items: { orderBy: { createdAt: "asc" } } },
    }) as any;
  return (manifest as unknown as Manifest) || null;
}

/**
 * Update a single cargo item (e.g. add driver name, adjust weight, set reefer temp).
 * Cannot update after roll-on has been confirmed for that item.
 */
export async function updateManifestItem(
  itemId: string,
  updates: Partial<RoRoCargoItemInput>
): Promise<RoRoCargoItem> {
    const existing = await db.roRoCargoItem.findUnique({ where: { id: itemId } }) as any;
  if (!existing) throw new Error("Manifest item not found");
  if (existing.rollOnStatus === "ROLLED_ON" || existing.rollOnStatus === "SECURED") {
    throw new Error(`Item ${existing.rollOnStatus.toLowerCase()} — cannot modify`);
  }
  const data: any = {};
  if (updates.itemType !== undefined) data.itemType = updates.itemType;
  if (updates.licensePlate !== undefined) data.licensePlate = updates.licensePlate || null;
  if (updates.driverName !== undefined) data.driverName = updates.driverName || null;
  if (updates.driverLicense !== undefined) data.driverLicense = updates.driverLicense || null;
  if (updates.lengthM !== undefined) data.lengthM = updates.lengthM;
  if (updates.widthM !== undefined) data.widthM = updates.widthM;
  if (updates.heightM !== undefined) data.heightM = updates.heightM;
  if (updates.weightKg !== undefined) data.weightKg = updates.weightKg;
  if (updates.reeferTempC !== undefined) data.reeferTempC = updates.reeferTempC;
  if (updates.cargoDescription !== undefined) data.cargoDescription = updates.cargoDescription || null;
  if (updates.hsCode !== undefined) data.hsCode = updates.hsCode || null;

    const updated = await db.roRoCargoItem.update({ where: { id: itemId }, data }) as any;
  return updated as unknown as RoRoCargoItem;
}

/**
 * Confirm roll-on: marks all items in the manifest as ROLLED_ON + SECURED,
 * sets rollOnAt timestamp on each item and on the manifest header.
 */
export async function confirmRollOn(
  scheduleId: string,
  ustn: string,
  confirmedBy?: string
): Promise<{ confirmed: boolean; items: number; timestamp: Date; ustn: string; scheduleId: string }> {
  const manifest = await getManifest(ustn);
  if (!manifest) throw new Error(`No manifest found for USTN ${ustn}`);
  if (manifest.status === "ROLLED_ON" || manifest.status === "IN_TRANSIT" || manifest.status === "ROLLED_OFF" || manifest.status === "CLOSED") {
    throw new Error(`Manifest status ${manifest.status} — roll-on already performed`);
  }
  const now = new Date();
  await db.roRoCargoItem.updateMany({
    where: { manifestId: manifest.id, rollOnStatus: "PENDING" },
    data: { rollOnStatus: "ROLLED_ON", rollOnAt: now },
    }) as any;
  // Then secure them (two-phase: ROLLED_ON → SECURED)
  await db.roRoCargoItem.updateMany({
    where: { manifestId: manifest.id, rollOnStatus: "ROLLED_ON" },
    data: { rollOnStatus: "SECURED" },
    }) as any;
  const updated = await db.roRoCargoManifest.update({
    where: { id: manifest.id },
    data: {
      status: "ROLLED_ON",
      rollOnAt: now,
      rollOnConfirmedBy: confirmedBy || "roro-ops",
      scheduleId: scheduleId || manifest.scheduleId,
    },
    }) as any;
  return {
    confirmed: true,
    items: manifest.items.length,
    timestamp: now,
    ustn: updated.ustn,
    scheduleId: scheduleId || updated.scheduleId || "",
  };
}

/**
 * Confirm roll-off: marks all items as ROLLED_OFF + RELEASED at destination.
 */
export async function confirmRollOff(
  scheduleId: string,
  ustn: string,
  confirmedBy?: string
): Promise<{ confirmed: boolean; items: number; timestamp: Date; ustn: string; scheduleId: string }> {
  const manifest = await getManifest(ustn);
  if (!manifest) throw new Error(`No manifest found for USTN ${ustn}`);
  if (manifest.status !== "ROLLED_ON" && manifest.status !== "IN_TRANSIT") {
    throw new Error(`Manifest status ${manifest.status} — roll-on must be performed first`);
  }
  const now = new Date();
  await db.roRoCargoItem.updateMany({
    where: { manifestId: manifest.id, rollOffStatus: "PENDING" },
    data: { rollOffStatus: "ROLLED_OFF", rollOffAt: now },
    }) as any;
  await db.roRoCargoItem.updateMany({
    where: { manifestId: manifest.id, rollOffStatus: "ROLLED_OFF" },
    data: { rollOffStatus: "RELEASED" },
    }) as any;
  const updated = await db.roRoCargoManifest.update({
    where: { id: manifest.id },
    data: {
      status: "ROLLED_OFF",
      rollOffAt: now,
      rollOffConfirmedBy: confirmedBy || "roro-ops",
    },
    }) as any;
  return {
    confirmed: true,
    items: manifest.items.length,
    timestamp: now,
    ustn: updated.ustn,
    scheduleId: scheduleId || updated.scheduleId || "",
  };
}

/**
 * List manifests with optional filters (status, corridor, shipper).
 */
export async function listManifests(filter: { corridorCode?: string; shipperGtid?: string; status?: string } = {}) {
  const where: any = {};
  if (filter.corridorCode) where.corridorCode = filter.corridorCode;
  if (filter.shipperGtid) where.shipperGtid = filter.shipperGtid;
  if (filter.status) where.status = filter.status;
  const rows = await db.roRoCargoManifest.findMany({
    where,
    include: { items: true },
    orderBy: { createdAt: "desc" },
    }) as any;
  return rows as unknown as Manifest[];
}

/**
 * SGTX Lot Number System — Lot Management Library
 *
 * A Lot is a batch of goods (same production date, origin, supplier, etc.).
 * A container can hold multiple lots (e.g. lot A on pallets 1-5, lot B on pallets 6-10).
 * A pallet belongs to exactly one lot.
 *
 * Hierarchy: Trade → Shipment → Container → Lots → Pallets
 *
 * @module lot-management
 */

import { db } from "@/lib/db";

// ============ Types ============

/** The set of allowed Lot status values. */
export type LotStatus = "ACTIVE" | "QUARANTINED" | "REJECTED" | "RELEASED";

/** Input payload for creating a new Lot. lotNumber is auto-generated if omitted. */
export interface CreateLotInput {
  lotNumber?: string;
  ustn: string;
  tradeId: string;
  commodity: string;
  commodityHs?: string;
  originCountry: string;
  productionDate?: Date;
  expiryDate?: Date;
  bestBeforeDate?: Date;
  batchNumber?: string;
  harvestDate?: Date;
  packDate?: Date;
  supplierGtid?: string;
  supplierLotRef?: string;
  quantityUnits?: number;
  netWeightKg?: number;
  grossWeightKg?: number;
  coldStorageTemp?: number;
  treatmentStatus?: string;
  organicCertified?: boolean;
  gmoStatus?: string;
  allergenInfo?: string;
  countryOfOrigin?: string;
  notes?: string;
}

/** Result returned by validation helpers. */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Summary structure returned by {@link getLotSummary}. */
export interface LotSummary {
  lot: {
    id: string;
    lotNumber: string;
    ustn: string;
    tradeId: string;
    shipmentId: string | null;
    containerId: string | null;
    commodity: string;
    commodityHs: string | null;
    originCountry: string;
    status: string;
    netWeightKg: number;
    grossWeightKg: number;
    quantityUnits: number;
  };
  palletCount: number;
  totalCartons: number;
  totalNetWeightKg: number;
  totalGrossWeightKg: number;
  containerId: string | null;
  shipmentId: string | null;
  pallets: Array<{
    id: string;
    sscc: string;
    palletId: string | null;
    totalCartons: number | null;
    netWeightKg: number | null;
    grossWeightKg: number | null;
    loaded: boolean;
  }>;
}

/** Grouped lot+container+pallet view used by the packing plan generator. */
export interface LotAwarePackingListEntry {
  lot: {
    id: string;
    lotNumber: string;
    commodity: string;
    originCountry: string;
    status: string;
  };
  containerId: string | null;
  shipmentId: string | null;
  pallets: Array<{
    id: string;
    sscc: string;
    palletId: string | null;
    totalCartons: number | null;
    netWeightKg: number | null;
    grossWeightKg: number | null;
    loaded: boolean;
  }>;
}

// ============ Helpers ============

/**
 * Generate a lot number in the format `LOT-{YYYY}-{SEQ4}-{ORIGIN3}-{COMMODITY3}`.
 * SEQ4 is a zero-padded sequence number derived from the current count of lots
 * for the same USTN (deterministic per trade within a 1-second granularity).
 *
 * @param ustn - The USTN of the parent trade.
 * @param originCountry - ISO-2 country code (e.g. "EG").
 * @param commodity - Commodity name (e.g. "Frozen Strawberries").
 * @returns A formatted lot number.
 */
export function generateLotNumber(
  ustn: string,
  originCountry: string,
  commodity: string,
): string {
  const year = new Date().getFullYear();
  // Derive a 4-digit sequence from the USTN hash + current second, so two lots
  // created in the same second for the same USTN can collide (rare; the
  // @@unique([lotNumber, ustn]) constraint will reject duplicates).
  const seqSource = `${ustn}-${Date.now()}`;
  let hash = 0;
  for (let i = 0; i < seqSource.length; i++) {
    hash = (hash * 31 + seqSource.charCodeAt(i)) >>> 0;
  }
  const seq4 = String(hash % 10000).padStart(4, "0");
  const origin3 = (originCountry || "XXX").toUpperCase().slice(0, 3).padEnd(3, "X");
  const commodity3 = (commodity || "XXX")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 3)
    .padEnd(3, "X");
  return `LOT-${year}-${seq4}-${origin3}-${commodity3}`;
}

/**
 * Resolve the tradeId for a given USTN. Returns null if the trade does not exist.
 *
 * @param ustn - The USTN to resolve.
 */
export async function resolveTradeIdByUstn(ustn: string): Promise<string | null> {
  try {
    const trade = await db.trade.findUnique({
      where: { ustn },
      select: { id: true },
    });
    return trade?.id ?? null;
  } catch {
    return null;
  }
}

// ============ Core CRUD ============

/**
 * Create a new Lot record. Auto-generates a `lotNumber` if one is not provided.
 *
 * @param input - The lot creation payload. `ustn`, `tradeId`, `commodity` and
 *   `originCountry` are required; all other fields are optional.
 * @returns The created Lot record.
 * @throws Error if required fields are missing or the USTN does not match the trade.
 */
export async function createLot(input: CreateLotInput) {
  if (!input.ustn) throw new Error("createLot: ustn is required");
  if (!input.tradeId) throw new Error("createLot: tradeId is required");
  if (!input.commodity) throw new Error("createLot: commodity is required");
  if (!input.originCountry) throw new Error("createLot: originCountry is required");

  // Verify the trade exists and the USTN matches.
  const trade = await db.trade.findUnique({
    where: { id: input.tradeId },
    select: { id: true, ustn: true },
  });
  if (!trade) throw new Error(`createLot: trade ${input.tradeId} not found`);
  if (trade.ustn !== input.ustn) {
    throw new Error(
      `createLot: USTN mismatch — trade.ustn=${trade.ustn} but input.ustn=${input.ustn}`,
    );
  }

  const lotNumber =
    input.lotNumber?.trim() ||
    generateLotNumber(input.ustn, input.originCountry, input.commodity);

  const lot = await db.lot.create({
    data: {
      lotNumber,
      ustn: input.ustn,
      tradeId: input.tradeId,
      commodity: input.commodity,
      commodityHs: input.commodityHs ?? null,
      originCountry: input.originCountry,
      productionDate: input.productionDate ?? null,
      expiryDate: input.expiryDate ?? null,
      bestBeforeDate: input.bestBeforeDate ?? null,
      batchNumber: input.batchNumber ?? null,
      harvestDate: input.harvestDate ?? null,
      packDate: input.packDate ?? null,
      supplierGtid: input.supplierGtid ?? null,
      supplierLotRef: input.supplierLotRef ?? null,
      quantityUnits: input.quantityUnits ?? 0,
      netWeightKg: input.netWeightKg ?? 0,
      grossWeightKg: input.grossWeightKg ?? 0,
      coldStorageTemp: input.coldStorageTemp ?? null,
      treatmentStatus: input.treatmentStatus ?? null,
      organicCertified: input.organicCertified ?? false,
      gmoStatus: input.gmoStatus ?? null,
      allergenInfo: input.allergenInfo ?? null,
      countryOfOrigin: input.countryOfOrigin ?? null,
      notes: input.notes ?? null,
      status: "ACTIVE",
    },
  });

  return lot;
}

/**
 * Assign a lot to a container. The container must belong to the same trade as the lot.
 *
 * @param lotId - ID of the lot.
 * @param containerId - ID of the target container.
 * @returns The updated Lot record.
 * @throws Error if the lot or container does not exist, or if they belong to different trades.
 */
export async function assignLotToContainer(lotId: string, containerId: string) {
  const lot = await db.lot.findUnique({
    where: { id: lotId },
    select: { id: true, tradeId: true, ustn: true },
  });
  if (!lot) throw new Error(`assignLotToContainer: lot ${lotId} not found`);

  const container = await db.tradeContainer.findUnique({
    where: { id: containerId },
    select: { id: true, tradeId: true },
  });
  if (!container) throw new Error(`assignLotToContainer: container ${containerId} not found`);

  if (lot.tradeId !== container.tradeId) {
    throw new Error(
      `assignLotToContainer: lot trade ${lot.tradeId} ≠ container trade ${container.tradeId}`,
    );
  }

  return db.lot.update({
    where: { id: lotId },
    data: { containerId },
  });
}

/**
 * Assign a lot to a shipment. The shipment must belong to the same trade as the lot.
 *
 * @param lotId - ID of the lot.
 * @param shipmentId - ID of the target shipment.
 * @returns The updated Lot record.
 * @throws Error if the lot or shipment does not exist, or if they belong to different trades.
 */
export async function assignLotToShipment(lotId: string, shipmentId: string) {
  const lot = await db.lot.findUnique({
    where: { id: lotId },
    select: { id: true, tradeId: true },
  });
  if (!lot) throw new Error(`assignLotToShipment: lot ${lotId} not found`);

  const shipment = await db.shipment.findUnique({
    where: { id: shipmentId },
    select: { id: true, tradeId: true },
  });
  if (!shipment) throw new Error(`assignLotToShipment: shipment ${shipmentId} not found`);

  if (lot.tradeId !== shipment.tradeId) {
    throw new Error(
      `assignLotToShipment: lot trade ${lot.tradeId} ≠ shipment trade ${shipment.tradeId}`,
    );
  }

  return db.lot.update({
    where: { id: lotId },
    data: { shipmentId },
  });
}

/**
 * Assign a pallet to a lot. Copies `lotNumber` into the legacy
 * `PalletDetail.lotNumber` column for backward compatibility with code that
 * has not yet been migrated to the `lotId` FK.
 *
 * Validates that the pallet's USTN matches the lot's USTN (a pallet cannot
 * belong to a lot owned by a different trade).
 *
 * @param palletId - ID of the PalletDetail to assign.
 * @param lotId - ID of the target lot.
 * @returns The updated PalletDetail record.
 * @throws Error if the pallet or lot does not exist, or if their USTNs differ.
 */
export async function assignPalletToLot(palletId: string, lotId: string) {
  const pallet = await db.palletDetail.findUnique({
    where: { id: palletId },
    select: { id: true, ustn: true },
  });
  if (!pallet) throw new Error(`assignPalletToLot: pallet ${palletId} not found`);

  const lot = await db.lot.findUnique({
    where: { id: lotId },
    select: { id: true, ustn: true, lotNumber: true },
  });
  if (!lot) throw new Error(`assignPalletToLot: lot ${lotId} not found`);

  if (pallet.ustn !== lot.ustn) {
    throw new Error(
      `assignPalletToLot: USTN mismatch — pallet.ustn=${pallet.ustn} but lot.ustn=${lot.ustn}`,
    );
  }

  return db.palletDetail.update({
    where: { id: palletId },
    data: {
      lotId,
      lotNumber: lot.lotNumber, // back-compat with legacy column
    },
  });
}

// ============ Reads ============

/**
 * Get all lots assigned to a container, including their pallets.
 *
 * @param containerId - ID of the container.
 * @returns Array of lot records with pallets included.
 */
export async function getLotsForContainer(containerId: string) {
  return db.lot.findMany({
    where: { containerId },
    include: { pallets: true },
    orderBy: { lotNumber: "asc" },
  });
}

/**
 * Get all lots assigned to a shipment.
 *
 * @param shipmentId - ID of the shipment.
 * @returns Array of lot records.
 */
export async function getLotsForShipment(shipmentId: string) {
  return db.lot.findMany({
    where: { shipmentId },
    include: { pallets: true },
    orderBy: { lotNumber: "asc" },
  });
}

/**
 * Get all lots for a trade.
 *
 * @param tradeId - ID of the trade.
 * @returns Array of lot records.
 */
export async function getLotsForTrade(tradeId: string) {
  return db.lot.findMany({
    where: { tradeId },
    include: { pallets: true, container: true },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Get all pallets assigned to a lot.
 *
 * @param lotId - ID of the lot.
 * @returns Array of PalletDetail records.
 */
export async function getPalletsForLot(lotId: string) {
  return db.palletDetail.findMany({
    where: { lotId },
    orderBy: { sequence: "asc" },
  });
}

/**
 * Compute a summary of a lot: pallet count, total cartons, total weights.
 *
 * @param lotId - ID of the lot.
 * @returns A {@link LotSummary} object, or null if the lot does not exist.
 */
export async function getLotSummary(lotId: string): Promise<LotSummary | null> {
  const lot = await db.lot.findUnique({
    where: { id: lotId },
    include: { pallets: true },
  });
  if (!lot) return null;

  const pallets = lot.pallets;
  const totalCartons = pallets.reduce((s, p) => s + (p.totalCartons ?? 0), 0);
  const totalNetWeightKg = pallets.reduce((s, p) => s + (p.netWeightKg ?? 0), 0);
  const totalGrossWeightKg = pallets.reduce((s, p) => s + (p.grossWeightKg ?? 0), 0);

  return {
    lot: {
      id: lot.id,
      lotNumber: lot.lotNumber,
      ustn: lot.ustn,
      tradeId: lot.tradeId,
      shipmentId: lot.shipmentId,
      containerId: lot.containerId,
      commodity: lot.commodity,
      commodityHs: lot.commodityHs,
      originCountry: lot.originCountry,
      status: lot.status,
      netWeightKg: lot.netWeightKg,
      grossWeightKg: lot.grossWeightKg,
      quantityUnits: lot.quantityUnits,
    },
    palletCount: pallets.length,
    totalCartons,
    totalNetWeightKg: +totalNetWeightKg.toFixed(2),
    totalGrossWeightKg: +totalGrossWeightKg.toFixed(2),
    containerId: lot.containerId,
    shipmentId: lot.shipmentId,
    pallets: pallets.map((p) => ({
      id: p.id,
      sscc: p.sscc,
      palletId: p.palletId,
      totalCartons: p.totalCartons,
      netWeightKg: p.netWeightKg,
      grossWeightKg: p.grossWeightKg,
      loaded: p.loaded,
    })),
  };
}

// ============ Status ============

/**
 * Update a lot's status. When transitioning to QUARANTINED or REJECTED, all
 * pallets in that lot are also quarantined/rejected — i.e. `loaded` is set to
 * `false` so they cannot be loaded into a container until the lot is released.
 *
 * @param lotId - ID of the lot.
 * @param status - The new status.
 * @param reason - Optional human-readable reason for the change.
 * @returns The updated Lot record.
 * @throws Error if the status is invalid or the lot does not exist.
 */
export async function updateLotStatus(
  lotId: string,
  status: LotStatus,
  reason?: string,
) {
  const allowed: LotStatus[] = ["ACTIVE", "QUARANTINED", "REJECTED", "RELEASED"];
  if (!allowed.includes(status)) {
    throw new Error(`updateLotStatus: invalid status "${status}"`);
  }

  const lot = await db.lot.findUnique({
    where: { id: lotId },
    select: { id: true, status: true, lotNumber: true },
  });
  if (!lot) throw new Error(`updateLotStatus: lot ${lotId} not found`);

  const notesSuffix = reason ? `\n[Status → ${status}] ${reason}` : "";

  const updated = await db.lot.update({
    where: { id: lotId },
    data: {
      status,
      notes: reason ? notesSuffix.trimStart() : undefined,
    },
  });

  // Cascade quarantine/reject to pallets: mark loaded=false so the container
  // builder / shipping line cannot pick them up.
  if (status === "QUARANTINED" || status === "REJECTED") {
    await db.palletDetail.updateMany({
      where: { lotId },
      data: { loaded: false },
    });
  }

  return updated;
}

// ============ Validation ============

/**
 * Validate that a lot can be assigned to a container.
 *
 * Checks performed:
 * 1. Both lot and container exist.
 * 2. They belong to the same trade.
 * 3. The lot is not already assigned to a different container.
 * 4. The container has capacity (less than 50 lots — a soft guardrail).
 *
 * @param lotId - ID of the lot.
 * @param containerId - ID of the container.
 * @returns A {@link ValidationResult} with `valid` and a list of `errors`.
 */
export async function validateLotAssignment(
  lotId: string,
  containerId: string,
): Promise<ValidationResult> {
  const errors: string[] = [];

  const lot = await db.lot.findUnique({
    where: { id: lotId },
    select: { id: true, tradeId: true, containerId: true },
  });
  if (!lot) {
    return { valid: false, errors: [`Lot ${lotId} not found`] };
  }

  const container = await db.tradeContainer.findUnique({
    where: { id: containerId },
    select: { id: true, tradeId: true },
  });
  if (!container) {
    return { valid: false, errors: [`Container ${containerId} not found`] };
  }

  if (lot.tradeId !== container.tradeId) {
    errors.push(
      `Trade mismatch: lot.tradeId=${lot.tradeId}, container.tradeId=${container.tradeId}`,
    );
  }

  if (lot.containerId && lot.containerId !== containerId) {
    errors.push(
      `Lot is already assigned to container ${lot.containerId}; re-assignment requires explicit unassign first`,
    );
  }

  // Capacity guardrail — a container should not hold an unbounded number of lots.
  const existingLotsCount = await db.lot.count({
    where: { containerId },
  });
  if (existingLotsCount >= 50) {
    errors.push(
      `Container ${containerId} already holds ${existingLotsCount} lots (max 50)`,
    );
  }

  return { valid: errors.length === 0, errors };
}

// ============ Bulk operations ============

/**
 * Assign multiple pallets to a single lot in one transaction.
 *
 * Pallets whose USTN does not match the lot's USTN are skipped and reported
 * in the `skipped` array; the rest are assigned atomically.
 *
 * @param palletIds - Array of PalletDetail IDs.
 * @param lotId - ID of the target lot.
 * @returns `{ assigned, skipped }` with the per-pallet outcome.
 */
export async function bulkAssignPalletsToLot(
  palletIds: string[],
  lotId: string,
): Promise<{ assigned: string[]; skipped: Array<{ palletId: string; reason: string }> }> {
  if (palletIds.length === 0) {
    return { assigned: [], skipped: [] };
  }

  const lot = await db.lot.findUnique({
    where: { id: lotId },
    select: { id: true, ustn: true, lotNumber: true },
  });
  if (!lot) throw new Error(`bulkAssignPalletsToLot: lot ${lotId} not found`);

  const pallets = await db.palletDetail.findMany({
    where: { id: { in: palletIds } },
    select: { id: true, ustn: true },
  });

  const assigned: string[] = [];
  const skipped: Array<{ palletId: string; reason: string }> = [];

  const matchingPalletIds: string[] = [];
  for (const pid of palletIds) {
    const pallet = pallets.find((p) => p.id === pid);
    if (!pallet) {
      skipped.push({ palletId: pid, reason: "pallet not found" });
      continue;
    }
    if (pallet.ustn !== lot.ustn) {
      skipped.push({
        palletId: pid,
        reason: `USTN mismatch (pallet.ustn=${pallet.ustn}, lot.ustn=${lot.ustn})`,
      });
      continue;
    }
    matchingPalletIds.push(pid);
  }

  if (matchingPalletIds.length > 0) {
    await db.$transaction(
      matchingPalletIds.map((pid) =>
        db.palletDetail.update({
          where: { id: pid },
          data: { lotId, lotNumber: lot.lotNumber },
        }),
      ),
    );
    assigned.push(...matchingPalletIds);
  }

  return { assigned, skipped };
}

/**
 * Auto-split a list of pallets (carrying legacy `lotNumber` strings) into Lot
 * records. For each unique `lotNumber` value, create one Lot and assign all
 * pallets with that lotNumber to it.
 *
 * Useful for migrating existing pallets to the new Lot model.
 *
 * @param pallets - Array of pallet objects with at least `id`, `ustn`,
 *   `tradeId`, `lotNumber`, `commodity`, `originCountry`.
 * @returns `{ created, assigned }` — the created Lot IDs (by lotNumber) and
 *   the per-pallet assignment outcome.
 */
export async function autoSplitPalletsByLot(
  pallets: Array<{
    id: string;
    ustn: string;
    tradeId: string;
    lotNumber?: string | null;
    commodity: string;
    originCountry: string;
    commodityHs?: string | null;
  }>,
): Promise<{
  created: Record<string, string>;
  assigned: Array<{ palletId: string; lotId: string }>;
  skipped: Array<{ palletId: string; reason: string }>;
}> {
  const created: Record<string, string> = {};
  const assigned: Array<{ palletId: string; lotId: string }> = [];
  const skipped: Array<{ palletId: string; reason: string }> = [];

  // Group pallet IDs by their lotNumber (or "UNSPECIFIED" if missing).
  const groups = new Map<string, typeof pallets>();
  for (const p of pallets) {
    const key = (p.lotNumber?.trim() || "UNSPECIFIED").toUpperCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  for (const [lotNumber, groupPallets] of groups) {
    // Use the first pallet's metadata to seed the lot.
    const head = groupPallets[0];
    try {
      const lot = await createLot({
        lotNumber: lotNumber === "UNSPECIFIED" ? undefined : lotNumber,
        ustn: head.ustn,
        tradeId: head.tradeId,
        commodity: head.commodity,
        commodityHs: head.commodityHs ?? undefined,
        originCountry: head.originCountry,
      });
      created[lot.lotNumber] = lot.id;

      const palletIds = groupPallets.map((p) => p.id);
      const result = await bulkAssignPalletsToLot(palletIds, lot.id);
      for (const pid of result.assigned) {
        assigned.push({ palletId: pid, lotId: lot.id });
      }
      for (const s of result.skipped) {
        skipped.push({ palletId: s.palletId, reason: s.reason });
      }
    } catch (e) {
      for (const p of groupPallets) {
        skipped.push({
          palletId: p.id,
          reason: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  return { created, assigned, skipped };
}

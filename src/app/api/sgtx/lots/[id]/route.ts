import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  assignLotToContainer,
  assignLotToShipment,
  updateLotStatus,
  type LotStatus,
} from "@/lib/sgtx/packing/lot-management";

export const dynamic = "force-dynamic";

/** Params type for the `/api/sgtx/lots/[id]` dynamic segment. */
type LotRouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/sgtx/lots/[id]
 *
 * Fetch a single lot by ID, including its pallets (and the container/shipment
 * it is assigned to, if any).
 */
export async function GET(_req: NextRequest, { params }: LotRouteParams) {
  try {
    const { id } = await params;
    const lot = await db.lot.findUnique({
      where: { id },
      include: {
        pallets: { orderBy: { sequence: "asc" } },
        container: true,
        shipment: true,
      },
    });
    if (!lot) {
      return NextResponse.json({ error: `Lot ${id} not found` }, { status: 404 });
    }
    return NextResponse.json({ ok: true, lot });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/sgtx/lots/[id]
 *
 * Update a lot. Supported body fields:
 *  - `status`: LotStatus ("ACTIVE" | "QUARANTINED" | "REJECTED" | "RELEASED")
 *      — when transitioning to QUARANTINED or REJECTED, all pallets in this
 *      lot are also unloaded (`loaded = false`).
 *  - `notes`: string
 *  - `containerId`: string — assigns the lot to a container (must be the same trade)
 *  - `shipmentId`: string — assigns the lot to a shipment (must be the same trade)
 *  - `statusReason`: optional human-readable reason for the status change
 *  - any other editable Lot field (commodity, commodityHs, originCountry,
 *    batchNumber, etc.)
 */
export async function PATCH(req: NextRequest, { params }: LotRouteParams) {
  try {
    const { id } = await params;
    const body = (await req.json()) as {
      status?: LotStatus;
      notes?: string;
      containerId?: string;
      shipmentId?: string;
      statusReason?: string;
      [key: string]: unknown;
    };

    // Verify the lot exists.
    const existing = await db.lot.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: `Lot ${id} not found` }, { status: 404 });
    }

    // Status transitions are routed through updateLotStatus so that cascade
    // unloading of pallets is applied.
    if (body.status) {
      await updateLotStatus(id, body.status, body.statusReason);
    }

    // Container / shipment assignments must go through their helpers so that
    // trade-mismatch validation is enforced.
    if (body.containerId) {
      await assignLotToContainer(id, body.containerId);
    }
    if (body.shipmentId) {
      await assignLotToShipment(id, body.shipmentId);
    }

    // Build a dynamic update payload for the remaining editable fields.
    const editableKeys = new Set([
      "commodity",
      "commodityHs",
      "originCountry",
      "productionDate",
      "expiryDate",
      "bestBeforeDate",
      "batchNumber",
      "harvestDate",
      "packDate",
      "supplierGtid",
      "supplierLotRef",
      "quantityUnits",
      "netWeightKg",
      "grossWeightKg",
      "coldStorageTemp",
      "treatmentStatus",
      "organicCertified",
      "gmoStatus",
      "allergenInfo",
      "countryOfOrigin",
      "notes",
    ]);

    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (editableKeys.has(key)) {
        // Date fields: coerce ISO strings to Date objects.
        if (
          ["productionDate", "expiryDate", "bestBeforeDate", "harvestDate", "packDate"].includes(key) &&
          typeof value === "string"
        ) {
          updateData[key] = new Date(value);
        } else {
          updateData[key] = value;
        }
      }
    }

    let lot: unknown = existing;
    if (Object.keys(updateData).length > 0) {
      lot = await db.lot.update({ where: { id }, data: updateData });
    } else {
      // Re-fetch the current state so the response always reflects what's stored.
      lot = await db.lot.findUnique({
        where: { id },
        include: { pallets: true },
      });
    }

    return NextResponse.json({ ok: true, lot });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

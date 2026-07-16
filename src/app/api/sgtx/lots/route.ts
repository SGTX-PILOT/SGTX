import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  createLot,
  getLotsForTrade,
  resolveTradeIdByUstn,
  type CreateLotInput,
} from "@/lib/sgtx/packing/lot-management";
import { eventBus } from "@/lib/sgtx/brain-os";

export const dynamic = "force-dynamic";

/**
 * POST /api/sgtx/lots
 *
 * Create a new Lot record. Body fields match {@link CreateLotInput}.
 * If `lotNumber` is omitted, one is auto-generated as
 * `LOT-{YYYY}-{SEQ4}-{ORIGIN3}-{COMMODITY3}`.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<CreateLotInput> & { ustn?: string; tradeId?: string };

    if (!body.ustn) {
      return NextResponse.json({ error: "ustn is required" }, { status: 400 });
    }
    if (!body.tradeId && body.ustn) {
      const resolved = await resolveTradeIdByUstn(body.ustn);
      if (!resolved) {
        return NextResponse.json({ error: `Trade not found for USTN ${body.ustn}` }, { status: 404 });
      }
      body.tradeId = resolved;
    }
    if (!body.tradeId) {
      return NextResponse.json({ error: "tradeId is required" }, { status: 400 });
    }
    if (!body.commodity) {
      return NextResponse.json({ error: "commodity is required" }, { status: 400 });
    }
    if (!body.originCountry) {
      return NextResponse.json({ error: "originCountry is required" }, { status: 400 });
    }

    const lot = await createLot({
      lotNumber: body.lotNumber,
      ustn: body.ustn,
      tradeId: body.tradeId,
      commodity: body.commodity,
      commodityHs: body.commodityHs,
      originCountry: body.originCountry,
      productionDate: body.productionDate ? new Date(body.productionDate) : undefined,
      expiryDate: body.expiryDate ? new Date(body.expiryDate) : undefined,
      bestBeforeDate: body.bestBeforeDate ? new Date(body.bestBeforeDate) : undefined,
      batchNumber: body.batchNumber,
      harvestDate: body.harvestDate ? new Date(body.harvestDate) : undefined,
      packDate: body.packDate ? new Date(body.packDate) : undefined,
      supplierGtid: body.supplierGtid,
      supplierLotRef: body.supplierLotRef,
      quantityUnits: typeof body.quantityUnits === "number" ? body.quantityUnits : undefined,
      netWeightKg: typeof body.netWeightKg === "number" ? body.netWeightKg : undefined,
      grossWeightKg: typeof body.grossWeightKg === "number" ? body.grossWeightKg : undefined,
      coldStorageTemp: typeof body.coldStorageTemp === "number" ? body.coldStorageTemp : undefined,
      treatmentStatus: body.treatmentStatus,
      organicCertified: typeof body.organicCertified === "boolean" ? body.organicCertified : undefined,
      gmoStatus: body.gmoStatus,
      allergenInfo: body.allergenInfo,
      countryOfOrigin: body.countryOfOrigin,
      notes: body.notes,
    });

    // Publish a Brain decision event so the orchestrator's learning loop,
    // shadow pipeline, and dataset collector all capture this Lot creation
    // even though the operation itself is dispatched directly by the lib.
    // Wrapped in try/catch so a publish failure never breaks the main op.
    try {
      await eventBus.publish(
        "brain.decision.made",
        "execution.lot-create",
        {
          capability: "execution.lot-create",
          inputSummary: {
            ustn: body.ustn,
            tradeId: body.tradeId,
            commodity: body.commodity,
            originCountry: body.originCountry,
            lotNumber: lot?.lotNumber,
          },
          success: true,
          timestamp: Date.now(),
        },
        { source: "execution-lots-route" },
      );
    } catch {
      // Publish failure is non-fatal — the lot was already created.
    }

    return NextResponse.json({ ok: true, lot }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/sgtx/lots
 *
 * List lots filtered by one of `?ustn=`, `?tradeId=`, `?containerId=`, or
 * `?shipmentId=`. Exactly one filter is required.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ustn = searchParams.get("ustn");
    const tradeIdParam = searchParams.get("tradeId");
    const containerId = searchParams.get("containerId");
    const shipmentId = searchParams.get("shipmentId");

    if (!ustn && !tradeIdParam && !containerId && !shipmentId) {
      return NextResponse.json(
        { error: "Provide at least one of: ?ustn=, ?tradeId=, ?containerId=, ?shipmentId=" },
        { status: 400 },
      );
    }

    // Resolve USTN → tradeId if needed.
    let tradeId: string | undefined = tradeIdParam ?? undefined;
    if (!tradeId && ustn) {
      const resolved = await resolveTradeIdByUstn(ustn);
      if (!resolved) {
        return NextResponse.json({ error: `Trade not found for USTN ${ustn}` }, { status: 404 });
      }
      tradeId = resolved;
    }

    if (containerId) {
      const lots = await db.lot.findMany({
        where: { containerId },
        include: { pallets: true },
        orderBy: { lotNumber: "asc" },
      });
      return NextResponse.json({ ok: true, count: lots.length, lots });
    }

    if (shipmentId) {
      const lots = await db.lot.findMany({
        where: { shipmentId },
        include: { pallets: true },
        orderBy: { lotNumber: "asc" },
      });
      return NextResponse.json({ ok: true, count: lots.length, lots });
    }

    if (tradeId) {
      const lots = await getLotsForTrade(tradeId);
      return NextResponse.json({ ok: true, count: lots.length, lots });
    }

    return NextResponse.json({ error: "No filter resolved" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

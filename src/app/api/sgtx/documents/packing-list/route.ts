import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  generatePackingListPdf,
  generatePackingListJson,
  type PackingPlan,
  type PackingListContainer,
} from "@/lib/sgtx/documents/packing-list";
import { getCommodityPackingDefaults, getTreatmentRequirements } from "@/lib/sgtx/ria";

// POST /api/sgtx/documents/packing-list
// Body: { ustn: string, tradeId?: string, packingPlanId?: string }
// Returns: { html, hash, json }
//
// If a packingPlanId is provided we look up a saved PackingPlan row;
// otherwise we synthesize a default plan from RIA packing defaults + the trade's
// shipments/containers so this endpoint is always usable in demo mode.

export async function POST(req: NextRequest) {
  try {
    const { ustn, tradeId, packingPlanId } = await req.json();
    if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });

    // 1. Trade + parties + shipments + containers
    const trade = await db.trade.findFirst({
      where: tradeId ? { id: tradeId, ustn } : { ustn },
      include: {
        buyer: true,
        seller: true,
        shipments: true,
        containers: true,
      },
    });
    if (!trade) {
      return NextResponse.json({ error: "trade not found", ustn }, { status: 404 });
    }

    // 2. Build the packing plan (synthesised from RIA defaults if no explicit plan supplied)
    const plan = await buildPackingPlan(trade, packingPlanId);

    // 3. Trade data for the packing list header
    const tradeData = {
      ustn: trade.ustn,
      tradeId: trade.id,
      buyer: {
        gtid: trade.buyer.gtid,
        legalName: trade.buyer.legalName,
        country: trade.buyer.country,
        address: trade.buyer.city ? `${trade.buyer.city}, ${trade.buyer.country}` : undefined,
      },
      seller: {
        gtid: trade.seller.gtid,
        legalName: trade.seller.legalName,
        country: trade.seller.country,
        address: trade.seller.city ? `${trade.seller.city}, ${trade.seller.country}` : undefined,
      },
      commodity: trade.commodity,
      commodityHs: trade.commodityHs || undefined,
      incoterm: trade.incoterm,
      originPort: trade.originPort,
      destPort: trade.destPort,
      originCountry: trade.originCountry,
      destCountry: trade.destCountry,
      currency: trade.currency,
      packingDate: new Date().toISOString().slice(0, 10),
    };

    const { pdfBase64, hash } = generatePackingListPdf(tradeData, plan);
    const json = generatePackingListJson(tradeData, plan);
    const html = Buffer.from(pdfBase64, "base64").toString("utf8");

    // Persist a reference to the generated document
    await db.document.create({
      data: {
        type: "PACKING_LIST",
        title: `Packing List · ${trade.ustn}`,
        status: "UPLOADED",
        uploadedBy: trade.sellerGtid,
        tradeId: trade.id,
        fileSizeKb: Math.ceil(html.length / 1024),
      },
    });

    return NextResponse.json({ ok: true, html, hash, json });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ============ Helpers ============

async function buildPackingPlan(trade: any, packingPlanId?: string): Promise<PackingPlan> {
  // If a stored PackingPlan row exists, use it.
  if (packingPlanId) {
    const stored = await db.packingPlan.findUnique({ where: { id: packingPlanId } });
    if (stored) {
      const layerPatterns = stored.layerPatterns ? JSON.parse(stored.layerPatterns) : [];
      // Reuse stored containers/pallets (stored in trade.containers relation below).
      const containers = trade.containers?.length
        ? await buildContainersFromTradeRows(trade, stored)
        : [];
      return {
        containers: containers.length
          ? containers
          : [
              {
                containerNo: "DEFAULT",
                containerType: "40HC",
                pallets: [],
                temperatureSetpointC: trade.coldChain ? -18 : undefined,
              },
            ],
        totalCartons: stored.totalCartons,
        totalPallets: stored.totalPallets,
        totalNetKg: stored.totalNetKg,
        totalGrossKg: stored.totalGrossKg,
        coldChain: trade.coldChain,
        treatmentRequirements: layerPatterns,
        loomHash: stored.loomHash || undefined,
      };
    }
  }

  // Synthesise a plan from RIA + trade data.
  const hsCode = trade.commodityHs || "";
  const packingDefaults = hsCode
    ? await getCommodityPackingDefaults(hsCode, trade.originCountry)
    : null;

  // Treatment requirements (for header display + treatment_status badges)
  const treatments =
    hsCode && trade.originCountry && trade.destCountry
      ? await getTreatmentRequirements(hsCode, trade.originCountry, trade.destCountry)
      : [];

  // Containers: prefer TradeContainer rows, otherwise derive from Shipment rows.
  const containers: PackingListContainer[] = [];
  const tradeContainers = trade.containers ?? [];
  if (tradeContainers.length > 0) {
    for (const tc of tradeContainers) {
      containers.push(await buildContainerFromTradeRow(tc, trade, packingDefaults, treatments));
    }
  } else if (trade.shipments?.length > 0) {
    for (const s of trade.shipments) {
      containers.push(await buildContainerFromShipment(s, trade, packingDefaults, treatments));
    }
  } else {
    // Fallback: 1 container with 1 pallet representing the whole trade
    const totalCartons = packingDefaults
      ? Math.ceil(trade.netWeightKg / packingDefaults.netWeightPerCarton)
      : Math.ceil(trade.netWeightKg / 12.5);
    const cartonsPerPallet = packingDefaults?.cartonsPerPallet || 60;
    const totalPallets = Math.max(1, Math.ceil(totalCartons / cartonsPerPallet));
    containers.push({
      containerNo: "TBD",
      containerType: trade.coldChain ? "40HC REEFER" : "40DV",
      pallets: buildPallets(totalPallets, packingDefaults, trade, treatments, cartonsPerPallet),
      temperatureSetpointC: trade.coldChain ? -18 : undefined,
    });
  }

  const totalCartons = containers.reduce(
    (acc, c) => acc + c.pallets.reduce((a, p) => a + p.cartons, 0),
    0
  );
  const totalPallets = containers.reduce((acc, c) => acc + c.pallets.length, 0);
  const totalNetKg = containers.reduce(
    (acc, c) => acc + c.pallets.reduce((a, p) => a + p.netWeightKg, 0),
    0
  );
  const totalGrossKg = containers.reduce(
    (acc, c) => acc + c.pallets.reduce((a, p) => a + p.grossWeightKg, 0),
    0
  );

  return {
    containers,
    totalCartons,
    totalPallets,
    totalNetKg,
    totalGrossKg,
    coldChain: trade.coldChain,
    treatmentRequirements: treatments.map((t) => ({
      type: t.treatmentType,
      durationDays: t.durationDays,
      temperatureC: t.temperatureC,
      notes: t.notes,
    })),
    loomHash: undefined,
  };
}

async function buildContainerFromTradeRow(
  tc: any,
  trade: any,
  pd: any | null,
  treatments: any[]
): Promise<PackingListContainer> {
  const cartonsPerPallet = pd?.cartonsPerPallet || 60;
  const totalCartons = pd
    ? Math.ceil(trade.netWeightKg / pd.netWeightPerCarton)
    : Math.ceil(trade.netWeightKg / 12.5);
  const palletCount = Math.max(1, Math.ceil(totalCartons / cartonsPerPallet));
  return {
    containerNo: tc.containerNo || "TBD",
    containerType: tc.containerType || (trade.coldChain ? "40HC REEFER" : "40DV"),
    vesselName: tc.vesselName,
    vesselImo: tc.vesselImo,
    pallets: buildPallets(palletCount, pd, trade, treatments, cartonsPerPallet),
    temperatureSetpointC: trade.coldChain ? -18 : undefined,
  };
}

async function buildContainerFromShipment(
  s: any,
  trade: any,
  pd: any | null,
  treatments: any[]
): Promise<PackingListContainer> {
  const cartonsPerPallet = pd?.cartonsPerPallet || 60;
  // Distribute cartons evenly across shipments.
  const shipmentShare = trade.shipments.length > 0 ? 1 / trade.shipments.length : 1;
  const netKgForThis = Math.round(trade.netWeightKg * shipmentShare);
  const totalCartons = pd ? Math.ceil(netKgForThis / pd.netWeightPerCarton) : Math.ceil(netKgForThis / 12.5);
  const palletCount = Math.max(1, Math.ceil(totalCartons / cartonsPerPallet));
  return {
    containerNo: s.containerNo || "TBD",
    containerType: trade.coldChain ? "40HC REEFER" : "40DV",
    vesselName: s.vesselName,
    vesselImo: s.vesselImo,
    pallets: buildPallets(palletCount, pd, trade, treatments, cartonsPerPallet),
    temperatureSetpointC: s.coldChainTemp ?? (trade.coldChain ? -18 : undefined),
  };
}

async function buildContainersFromTradeRows(trade: any, stored: any): Promise<PackingListContainer[]> {
  const containers: PackingListContainer[] = [];
  for (const tc of trade.containers ?? []) {
    containers.push({
      containerNo: tc.containerNo || "TBD",
      containerType: tc.containerType || "40DV",
      pallets: [],
      temperatureSetpointC: undefined,
    });
  }
  return containers;
}

function buildPallets(
  count: number,
  pd: any | null,
  trade: any,
  treatments: any[],
  cartonsPerPallet: number
): any[] {
  const netPerCarton = pd?.netWeightPerCarton ?? 12.5;
  const grossPerCarton = pd?.grossWeightPerCarton ?? 13.6;
  const pallets: any[] = [];
  for (let i = 1; i <= count; i++) {
    const cartons = cartonsPerPallet;
    pallets.push({
      sequence: i,
      sscc: "", // populated by generator
      product: trade.commodity,
      lotNumber: `LOT-${trade.ustn.slice(-6)}-${String(i).padStart(2, "0")}`,
      cartons,
      netWeightKg: Number((cartons * netPerCarton).toFixed(2)),
      grossWeightKg: Number((cartons * grossPerCarton).toFixed(2)),
      treatmentStatus: treatments[0]?.treatmentType || (trade.coldChain ? "COLD_CHAIN_VERIFIED" : "NONE"),
      treatmentCertRef: treatments[0]?.certificateRequired ? `CERT-${trade.ustn.slice(-8)}` : null,
      layerBreakdown: [
        { cartonsPerLayer: Math.ceil(cartonsPerPallet / 5), numLayers: 5 },
      ],
    });
  }
  return pallets;
}

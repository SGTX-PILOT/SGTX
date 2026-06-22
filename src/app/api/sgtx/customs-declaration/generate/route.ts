// SGTX Part 5.7 — Customs Declaration Generation.
//
// POST /api/sgtx/customs-declaration/generate
// Body: { ustn, tradeId }
//
// Auto-generates a Nafeza SAD (Single Administrative Document) from the
// Trade + Invoice + PackingPlan:
//   1. Fetches Trade (with buyer, seller, containers, latest invoice, packing plan).
//   2. Creates a `CustomsDeclaration` row (regime=EXPORT, status=DRAFT).
//   3. Generates the SAD XML using `generateSadXml` from
//      src/lib/sgtx/gov/nafeza.ts.
//   4. Returns { ok, declarationId, sadXml }.
//
// In production the platform would then submit the SAD via
// `submitDeclaration` (Part 7) and request certificates (phyto, COO, etc.).

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { generateSadXml } from "@/lib/sgtx/gov/nafeza";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, tradeId } = body as { ustn?: string; tradeId?: string };

    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }

    // 1. Fetch the Trade + invoice + packing plan
    const trade = await db.trade.findUnique({
      where: { ustn },
      include: {
        buyer: true,
        seller: true,
        containers: true,
        invoices: { orderBy: { createdAt: "desc" }, take: 1 },
        customsDecls: true,
      },
    });
    if (!trade) {
      return NextResponse.json({ error: `Trade ${ustn} not found` }, { status: 404 });
    }
    const resolvedTradeId = tradeId || trade.id;

    const packingPlan = await db.packingPlan.findFirst({
      where: { ustn, locked: true },
      orderBy: { lockedAt: "desc" },
    });

    const invoice = trade.invoices[0];
    if (!invoice) {
      return NextResponse.json(
        {
          error:
            "No invoice found for this trade. Generate an invoice first via /api/sgtx/invoice/generate.",
        },
        { status: 400 },
      );
    }

    // 2. Create the CustomsDeclaration row
    const declarationNo = `SAD-${new Date()
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "")}-${String(trade.customsDecls.length + 1).padStart(3, "0")}`;
    const regime = "EXPORT";

    const declaration = await db.customsDeclaration.create({
      data: {
        tradeId: resolvedTradeId,
        brokerGtid: null, // direct submission (no broker)
        declarationNo,
        regime,
        status: "DRAFT",
        dutyUsd: null,
      },
    });

    // 3. Build the trade data structure for SAD generation
    const containerNos = trade.containers.map((c) => c.id).filter(Boolean);
    const sadTradeData = {
      ustn,
      declarationType: regime === "EXPORT" ? "EX" : "IM",
      customsOffice: trade.originPort || "EGALX",
      exporter: {
        name: trade.seller?.legalName || "SGTX Seller",
        country: trade.seller?.country || trade.originCountry,
        taxId: trade.seller?.gtid
          ? createHash("sha256").update(trade.seller.gtid).digest("hex").slice(0, 10).toUpperCase()
          : "",
      },
      importer: {
        name: trade.buyer?.legalName || "SGTX Buyer",
        country: trade.buyer?.country || trade.destCountry,
        taxId: trade.buyer?.gtid
          ? createHash("sha256").update(trade.buyer.gtid).digest("hex").slice(0, 10).toUpperCase()
          : "",
      },
      transportMode: "SEA",
      containers: containerNos,
      billOfLading: "",
      totalValue: invoice.amountUsd,
      incoterm: trade.incoterm,
      currency: invoice.currency || trade.currency || "USD",
      items: [
        {
          hsCode: trade.commodityHs || "",
          description: trade.commodity,
          quantity: packingPlan?.totalNetKg ?? trade.netWeightKg,
          unit: "KGM",
          grossWeightKg: packingPlan?.totalGrossKg ?? trade.grossWeightKg,
          netWeightKg: packingPlan?.totalNetKg ?? trade.netWeightKg,
          originCountry: trade.originCountry,
          value: trade.tradeValueUsd,
          currency: invoice.currency || trade.currency || "USD",
        },
      ],
    };

    const sadXml = generateSadXml(sadTradeData);
    const sadHash = createHash("sha256").update(sadXml).digest("hex");

    // 4. Persist the SAD XML on the declaration
    await db.customsDeclaration.update({
      where: { id: declaration.id },
      data: { etaXml: sadXml, nafezaStatus: "DRAFT_GENERATED" },
    });

    // 5. Activity log
    await db.activity.create({
      data: {
        tradeId: resolvedTradeId,
        actorGtid: trade.sellerGtid,
        action: "CUSTOMS_DECLARATION_GENERATED",
        type: "SUCCESS",
        description: `Customs declaration ${declarationNo} generated for ${ustn}. Regime: ${regime}. SAD XML ${sadXml.length} bytes, sha256:${sadHash.slice(0, 16)}…. Linked to invoice ${invoice.number}.`,
        metadata: JSON.stringify({
          declarationId: declaration.id,
          declarationNo,
          regime,
          sadHash,
          invoiceId: invoice.id,
          packingPlanId: packingPlan?.id ?? null,
        }),
      },
    });

    return NextResponse.json({
      ok: true,
      declarationId: declaration.id,
      declarationNo,
      regime,
      sadXml,
      sadHash,
    });
  } catch (e: any) {
    console.error("[customs-declaration/generate] error:", e);
    return NextResponse.json(
      { error: e.message || "Unknown error" },
      { status: 500 },
    );
  }
}

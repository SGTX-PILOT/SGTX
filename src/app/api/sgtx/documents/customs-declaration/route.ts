import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createHash } from "crypto";
import { getTreatmentRequirements } from "@/lib/sgtx/ria";

// POST /api/sgtx/documents/customs-declaration
// Body: { ustn: string, tradeId: string }
// Returns: { sadXml, declarationId }
//
// Generates a Nafeza SAD (Single Administrative Document) XML representation
// pre-filled from trade + invoice data. Per Part 5.5, the packing list and invoice
// data are reused to pre-fill the SAD, which is submitted via the broker or directly.

export async function POST(req: NextRequest) {
  try {
    const { ustn, tradeId } = await req.json();
    if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });

    const trade = await db.trade.findFirst({
      where: tradeId ? { id: tradeId, ustn } : { ustn },
      include: { buyer: true, seller: true, shipments: true, invoices: true },
    });
    if (!trade) {
      return NextResponse.json({ error: "trade not found", ustn }, { status: 404 });
    }

    // Find the existing CustomsDeclaration row, or create one.
    let decl = await db.customsDeclaration.findFirst({
      where: tradeId ? { tradeId: trade.id } : { trade: { ustn } },
    });
    const declarationId = decl?.declarationNo || `SAD-${trade.ustn.slice(-12).replace(/-/g, "")}`;

    // Treatment requirements (need to know if any certificate is mandatory for the SAD)
    const treatments =
      trade.commodityHs && trade.originCountry && trade.destCountry
        ? await getTreatmentRequirements(trade.commodityHs, trade.originCountry, trade.destCountry)
        : [];

    const commercialInvoice = trade.invoices.find((i: any) => i.type === "COMMERCIAL");
    const invoiceNumber = commercialInvoice?.number || `INV-${trade.ustn.slice(-12)}`;
    const invoiceValue = commercialInvoice?.amountUsd ?? trade.tradeValueUsd;

    // Generate the SAD XML.
    const sadXml = generateSadXml({
      declarationId,
      ustn: trade.ustn,
      tradeId: trade.id,
      regime: "EXPORT",
      seller: trade.seller,
      buyer: trade.buyer,
      commodity: trade.commodity,
      commodityHs: trade.commodityHs || "",
      grossWeightKg: trade.grossWeightKg,
      netWeightKg: trade.netWeightKg,
      originCountry: trade.originCountry,
      destCountry: trade.destCountry,
      originPort: trade.originPort,
      destPort: trade.destPort,
      incoterm: trade.incoterm,
      currency: trade.currency,
      invoiceNumber,
      invoiceValue,
      containerCount: trade.containerCount,
      coldChain: trade.coldChain,
      treatments,
    });

    const sadHash = createHash("sha256").update(sadXml, "utf8").digest("hex");

    // Upsert the declaration row.
    if (decl) {
      decl = await db.customsDeclaration.update({
        where: { id: decl.id },
        data: {
          declarationNo: declarationId,
          regime: "EXPORT",
          etaXml: sadXml,
          nafezaStatus: decl.nafezaStatus || "DRAFT",
        },
      });
    } else {
      decl = await db.customsDeclaration.create({
        data: {
          tradeId: trade.id,
          brokerGtid: null,
          declarationNo: declarationId,
          regime: "EXPORT",
          status: "DRAFT",
          dutyUsd: 0,
          etaXml: sadXml,
          nafezaStatus: "DRAFT",
        },
      });
    }

    // Persist a Document row for the SAD.
    await db.document.create({
      data: {
        type: "CUSTOMS_DECL",
        title: `Customs Declaration ${declarationId}`,
        status: "UPLOADED",
        uploadedBy: trade.sellerGtid,
        tradeId: trade.id,
        fileSizeKb: Math.ceil(sadXml.length / 1024),
        hashSha256: sadHash,
      },
    });

    return NextResponse.json({
      ok: true,
      declarationId,
      sadXml,
      hash: sadHash,
      status: decl.status,
      nafezaStatus: decl.nafezaStatus,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ============ SAD XML generator (Nafeza-compatible subset) ============
function escXml(s: any): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function generateSadXml(d: {
  declarationId: string;
  ustn: string;
  tradeId: string;
  regime: string;
  seller: any;
  buyer: any;
  commodity: string;
  commodityHs: string;
  grossWeightKg: number;
  netWeightKg: number;
  originCountry: string;
  destCountry: string;
  originPort: string;
  destPort: string;
  incoterm: string;
  currency: string;
  invoiceNumber: string;
  invoiceValue: number;
  containerCount: number;
  coldChain: boolean;
  treatments: any[];
}): string {
  const generatedAt = new Date().toISOString();
  const treatmentCerts = d.treatments
    .filter((t) => t.certificateRequired)
    .map((t) => `<Certificate><Type>${escXml(t.treatmentType)}</Type><Reference>${escXml(`CERT-${d.ustn.slice(-8)}`)}</Reference></Certificate>`)
    .join("\n        ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<CustomsDeclaration xmlns="urn:sgtx:nafeza:sad:1.0"
                    xmlns:cbc="urn:sgtx:nafeza:common:1.0">
  <cbc:DeclarationID>${escXml(d.declarationId)}</cbc:DeclarationID>
  <cbc:USTN>${escXml(d.ustn)}</cbc:USTN>
  <cbc:TradeID>${escXml(d.tradeId)}</cbc:TradeID>
  <cbc:GeneratedAt>${escXml(generatedAt)}</cbc:GeneratedAt>
  <cbc:Regime>${escXml(d.regime)}</cbc:Regime>
  <cbc:TypeOfDeclaration>EX</cbc:TypeOfDeclaration>
  <cbc:GoodsItemCount>1</cbc:GoodsItemCount>
  <cbc:TotalPackages>${d.containerCount}</cbc:TotalPackages>
  <cbc:TotalGrossMass unitCode="KGM">${d.grossWeightKg}</cbc:TotalGrossMass>
  <cbc:TotalNetMass unitCode="KGM">${d.netWeightKg}</cbc:TotalNetMass>
  <cbc:InvoiceAmount currencyID="${escXml(d.currency)}">${d.invoiceValue.toFixed(2)}</cbc:InvoiceAmount>
  <cbc:InvoiceNumber>${escXml(d.invoiceNumber)}</cbc:InvoiceNumber>
  <cbc:Incoterm>${escXml(d.incoterm)}</cbc:Incoterm>
  <cbc:ColdChain>${d.coldChain ? "true" : "false"}</cbc:ColdChain>

  <Exporter>
    <cbc:GTID>${escXml(d.seller.gtid)}</cbc:GTID>
    <cbc:Name>${escXml(d.seller.legalName)}</cbc:Name>
    <cbc:Country>${escXml(d.seller.country)}</cbc:Country>
    <cbc:City>${escXml(d.seller.city || "")}</cbc:City>
  </Exporter>
  <Consignee>
    <cbc:GTID>${escXml(d.buyer.gtid)}</cbc:GTID>
    <cbc:Name>${escXml(d.buyer.legalName)}</cbc:Name>
    <cbc:Country>${escXml(d.buyer.country)}</cbc:Country>
    <cbc:City>${escXml(d.buyer.city || "")}</cbc:City>
  </Consignee>

  <Transport>
    <cbc:OriginPort>${escXml(d.originPort)}</cbc:OriginPort>
    <cbc:DestinationPort>${escXml(d.destPort)}</cbc:DestinationPort>
    <cbc:OriginCountry>${escXml(d.originCountry)}</cbc:OriginCountry>
    <cbc:DestinationCountry>${escXml(d.destCountry)}</cbc:DestinationCountry>
    <cbc:ModeOfTransport>SEA</cbc:ModeOfTransport>
    <cbc:ContainerCount>${d.containerCount}</cbc:ContainerCount>
  </Transport>

  <GoodsItem>
    <cbc:ItemNumber>1</cbc:ItemNumber>
    <cbc:CommodityCode>${escXml(d.commodityHs)}</cbc:CommodityCode>
    <cbc:CommodityDescription>${escXml(d.commodity)}</cbc:CommodityDescription>
    <cbc:OriginCountry>${escXml(d.originCountry)}</cbc:OriginCountry>
    <cbc:DestinationCountry>${escXml(d.destCountry)}</cbc:DestinationCountry>
    <cbc:GrossMass unitCode="KGM">${d.grossWeightKg}</cbc:GrossMass>
    <cbc:NetMass unitCode="KGM">${d.netWeightKg}</cbc:NetMass>
    <cbc:InvoiceAmount currencyID="${escXml(d.currency)}">${d.invoiceValue.toFixed(2)}</cbc:InvoiceAmount>
    ${
      treatmentCerts
        ? `<Certificates>
        ${treatmentCerts}
      </Certificates>`
        : ""
    }
  </GoodsItem>

  <CustomsOffice>
    <cbc:Code>${escXml(d.originPort.match(/[A-Z]{5}/)?.[0] || "")}</cbc:Code>
    <cbc:Name>${escXml(d.originPort)}</cbc:Name>
  </CustomsOffice>
</CustomsDeclaration>`;
}

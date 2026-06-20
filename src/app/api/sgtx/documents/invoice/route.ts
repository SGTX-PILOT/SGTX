import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  generateUblXml,
  generateCommercialInvoiceHtml,
  generateInvoiceQrPayload,
  invoiceHash,
  type InvoiceData,
  type InvoiceLine,
} from "@/lib/sgtx/documents/invoice";

// POST /api/sgtx/documents/invoice
// Body: { ustn: string, tradeId: string }
// Returns: { ublXml, html, qrPayload, hash, invoiceNumber }

export async function POST(req: NextRequest) {
  try {
    const { ustn, tradeId } = await req.json();
    if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });

    const trade = await db.trade.findFirst({
      where: tradeId ? { id: tradeId, ustn } : { ustn },
      include: { buyer: true, seller: true, invoices: true },
    });
    if (!trade) {
      return NextResponse.json({ error: "trade not found", ustn }, { status: 404 });
    }

    // 1. Find the existing commercial Invoice row (created at trade-time) or synthesise a number.
    const commercialInvoiceRow = trade.invoices.find((i: any) => i.type === "COMMERCIAL");
    const invoiceNumber =
      commercialInvoiceRow?.number || `INV-${trade.ustn.slice(-12).replace(/-/g, "")}`;
    const dueDate = commercialInvoiceRow?.dueDate
      ? new Date(commercialInvoiceRow.dueDate).toISOString().slice(0, 10)
      : undefined;

    // 2. Build invoice lines from the trade (single line: goods at trade value)
    //    Logistics, SGTX fee, optional services are added as AllowanceCharges (per blueprint 5.4).
    const goodsUnitPrice = trade.netWeightKg > 0 ? trade.tradeValueUsd / trade.netWeightKg : trade.tradeValueUsd;
    const lines: InvoiceLine[] = [
      {
        id: "1",
        name: trade.commodity,
        description: `Commercial sale of ${trade.commodity}`,
        hsCode: trade.commodityHs || undefined,
        quantity: trade.netWeightKg,
        unitCode: "KGM",
        unitPrice: Number(goodsUnitPrice.toFixed(4)),
        currency: trade.currency,
        taxPercent: 0,
      },
    ];

    // 3. Aggregate the SGTX fee + optional-service invoices (already in DB) into charges.
    const sgtxFeeUsd = trade.invoices
      .filter((i: any) => i.type === "SGTX_FEE")
      .reduce((acc: number, i: any) => acc + i.amountUsd, 0);
    const logisticsCostUsd = trade.invoices
      .filter((i: any) => i.type === "LOGISTICS")
      .reduce((acc: number, i: any) => acc + i.amountUsd, 0);
    const optionalServiceFeesUsd = trade.invoices
      .filter((i: any) => ["LAB", "QC", "BROKER"].includes(i.type))
      .reduce((acc: number, i: any) => acc + i.amountUsd, 0);

    // 4. Build the InvoiceData object.
    const inv: InvoiceData = {
      invoiceNumber,
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate,
      currency: trade.currency,
      ustn: trade.ustn,
      tradeId: trade.id,
      seller: {
        gtid: trade.seller.gtid,
        legalName: trade.seller.legalName,
        country: trade.seller.country,
        city: trade.seller.city || undefined,
        taxId: trade.seller.gtid,
        email: undefined,
      },
      buyer: {
        gtid: trade.buyer.gtid,
        legalName: trade.buyer.legalName,
        country: trade.buyer.country,
        city: trade.buyer.city || undefined,
        taxId: trade.buyer.gtid,
        email: undefined,
      },
      lines,
      taxTotal: 0,
      logisticsCostUsd,
      sgtxFeeUsd,
      optionalServiceFeesUsd,
      paymentTerms: trade.paymentTerms || undefined,
      paymentTermsDetails: trade.paymentTermsDetails || undefined,
      incoterm: trade.incoterm,
      originCountry: trade.originCountry,
      destCountry: trade.destCountry,
      originPort: trade.originPort,
      destPort: trade.destPort,
    };

    // 5. Generate the three representations.
    const ublXml = generateUblXml(inv);
    const html = generateCommercialInvoiceHtml(inv);
    const qrPayload = generateInvoiceQrPayload(inv);
    const hash = invoiceHash(inv);

    // 6. Persist a Document row referencing the UBL XML.
    await db.document.create({
      data: {
        type: "COMMERCIAL_INVOICE",
        title: `Commercial Invoice ${invoiceNumber}`,
        status: "UPLOADED",
        uploadedBy: trade.sellerGtid,
        tradeId: trade.id,
        fileSizeKb: Math.ceil(ublXml.length / 1024),
        hashSha256: hash,
      },
    });

    return NextResponse.json({
      ok: true,
      invoiceNumber,
      ublXml,
      html,
      qrPayload,
      hash,
      totals: {
        goodsSubtotal: Number((trade.netWeightKg * goodsUnitPrice).toFixed(2)),
        logisticsCost: logisticsCostUsd,
        sgtxFee: sgtxFeeUsd,
        optionalServices: optionalServiceFeesUsd,
        taxTotal: 0,
        payable: Number((trade.tradeValueUsd + logisticsCostUsd + sgtxFeeUsd + optionalServiceFeesUsd).toFixed(2)),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

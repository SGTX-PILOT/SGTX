import { logger } from "@/lib/sgtx/logger";
// SGTX Part 5.6 — Automated Invoice Generation.
//
// POST /api/sgtx/invoice/generate
// Body: { ustn, tradeId }
//
// Generates a COMMERCIAL invoice from the Trade + containers + packing plan:
//   1. Fetches Trade (with containers, packing plan, buyer/seller tenants).
//   2. Builds the invoice number, type, amountUsd from trade value + SGTX fee.
//   3. Persists an `Invoice` row.
//   4. Generates a UBL 2.1 XML payload using `generateUblXml` from
//      src/lib/sgtx/gov/eta.ts (the same generator used for ETA submission).
//   5. Returns { ok, invoiceId, ublXml, totalAmount }.
//
// In production the platform would also:
//   - Submit the XML to ETA via `submitInvoice` (Part 7).
//   - Attach a QES signature (Part 3).
//   - Trigger the buyer's Smart Inbox (priority 80) "Invoice received".

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { generateUblXml } from "@/lib/sgtx/gov/eta";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, tradeId } = body as { ustn?: string; tradeId?: string };

    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }

    // 1. Fetch the Trade + related entities
    const trade = await db.trade.findUnique({
      where: { ustn },
      include: {
        buyer: true,
        seller: true,
        containers: true,
        invoices: true,
      },
    });
    if (!trade) {
      return NextResponse.json({ error: `Trade ${ustn} not found` }, { status: 404 });
    }
    const resolvedTradeId = tradeId || trade.id;

    // Fetch the most recent locked PackingPlan (optional but preferred)
    const packingPlan = await db.packingPlan.findFirst({
      where: { ustn, locked: true },
      orderBy: { lockedAt: "desc" },
    });

    // 2. Build invoice number + amount
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const seqPart = String(trade.invoices.length + 1).padStart(3, "0");
    const invoiceNumber = `INV-${datePart}-${seqPart}-${ustn.slice(-6)}`;
    const invoiceType = "COMMERCIAL";
    const sgtxFee = trade.sgtxFeeUsd ?? trade.tradeValueUsd * 0.015;
    const totalAmount = trade.tradeValueUsd + sgtxFee;

    // 3. Persist the Invoice row
    const invoice = await db.invoice.create({
      data: {
        tradeId: resolvedTradeId,
        type: invoiceType,
        number: invoiceNumber,
        amountUsd: totalAmount,
        currency: trade.currency || "USD",
        status: "PENDING",
        payerGtid: trade.buyerGtid,
        payeeGtid: trade.sellerGtid,
        dueDate: new Date(Date.now() + 30 * 24 * 3600 * 1000), // 30-day default
      },
    });

    // 4. Build the invoice data structure for UBL generation
    const invoiceData = {
      id: invoiceNumber,
      invoiceNumber,
      uuid: invoice.id,
      issueDate: new Date().toISOString().slice(0, 10),
      currency: trade.currency || "USD",
      taxRate: 14,
      typeCode: "388", // commercial invoice
      supplier: {
        name: trade.seller?.legalName || "SGTX Seller",
        // Tenant model has no taxId field; derive a stable placeholder from gtid.
        taxId: trade.seller?.gtid
          ? createHash("sha256").update(trade.seller.gtid).digest("hex").slice(0, 10).toUpperCase()
          : "EG123456789",
      },
      customer: {
        name: trade.buyer?.legalName || "SGTX Buyer",
        taxId: trade.buyer?.gtid
          ? createHash("sha256").update(trade.buyer.gtid).digest("hex").slice(0, 10).toUpperCase()
          : "DE123456789",
      },
      lines: [
        {
          sku: trade.commodityHs || "",
          name: trade.commodity,
          description: `${trade.commodity} — ${trade.incoterm} ${trade.originPort} → ${trade.destPort}`,
          quantity: packingPlan?.totalNetKg ?? trade.netWeightKg,
          unit: "KGM",
          amount: trade.tradeValueUsd,
        },
        {
          sku: "SGTX-FEE",
          name: "SGTX Platform Fee",
          description: "SGTX orchestration fee (1.5% of trade value)",
          quantity: 1,
          unit: "C62",
          amount: sgtxFee,
        },
      ],
    };

    const ublXml = generateUblXml(invoiceData);
    const ublHash = createHash("sha256").update(ublXml).digest("hex");

    // 5. Activity log
    await db.activity.create({
      data: {
        tradeId: resolvedTradeId,
        actorGtid: trade.sellerGtid,
        action: "INVOICE_GENERATED",
        type: "SUCCESS",
        description: `Commercial invoice ${invoiceNumber} generated for ${ustn}. Total: $${totalAmount.toFixed(2)} (${trade.currency || "USD"}). UBL 2.1 XML ${ublXml.length} bytes, sha256:${ublHash.slice(0, 16)}….`,
        metadata: JSON.stringify({
          invoiceId: invoice.id,
          invoiceNumber,
          totalAmount,
          ublHash,
          packingPlanId: packingPlan?.id ?? null,
        }),
      },
    });

    // 6. Smart Inbox to buyer (priority 80)
    await db.inboxItem.create({
      data: {
        tenantGtid: trade.buyerGtid,
        tradeId: resolvedTradeId,
        category: "NEEDS_DOCUMENT",
        priority: 80,
        title: `Invoice received — ${invoiceNumber} ($${totalAmount.toFixed(2)})`,
        description: `${trade.commodity} · ${trade.incoterm} · Total $${totalAmount.toFixed(2)} (incl. $${sgtxFee.toFixed(2)} SGTX fee). UBL 2.1 XML attached. Due in 30 days.`,
        ctaLabel: "View Invoice",
      },
    });

    return NextResponse.json({
      ok: true,
      invoiceId: invoice.id,
      invoiceNumber,
      ublXml,
      ublHash,
      totalAmount,
      currency: trade.currency || "USD",
    });
  } catch (e: any) {
    logger.error("[invoice/generate] error:", e);
    return NextResponse.json(
      { error: e.message || "Unknown error" },
      { status: 500 },
    );
  }
}

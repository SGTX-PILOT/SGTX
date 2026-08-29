// @ts-nocheck
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { createHash } from "crypto";

export interface GeneratedDocument {
  documentType: string; ustn: string; generatedAt: Date;
  format: string; content: any; hash: string; generatorVersion: string;
}

function hash(content: any): string {
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

export async function generateCommercialInvoice(ustn: string): Promise<GeneratedDocument> {
  try {
    const trade = await db.trade.findFirst({ where: { ustn }, include: { containers: true } });
    if (!trade) return null;
    const buyer = await db.tenant.findUnique({ where: { gtid: trade.buyerGtid } }).catch(() => null);
    const seller = await db.tenant.findUnique({ where: { gtid: trade.sellerGtid } }).catch(() => null);
    const content = {
      invoiceNumber: `INV-${ustn}-${Date.now()}`,
      invoiceDate: new Date().toISOString().split("T")[0],
      seller: { name: seller?.legalName, gtid: trade.sellerGtid, address: seller?.city, country: seller?.country },
      buyer: { name: buyer?.legalName, gtid: trade.buyerGtid, address: buyer?.city, country: buyer?.country },
      commodity: trade.commodity, hsCode: trade.commodityHs, incoterm: trade.incoterm,
      originCountry: trade.originCountry, destinationCountry: trade.destCountry,
      originPort: trade.originPort, destinationPort: trade.destPort,
      currency: trade.currency, totalAmount: trade.tradeValueUsd,
      paymentTerms: trade.paymentTerms, containers: trade.containers?.map(c => ({ size: c.containerSize, commodities: c.commodities })),
      bankDetails: seller?.bankSwift ? { swift: seller.bankSwift, bankName: seller.bankName, account: seller.bankAccountNo } : null,
    };
    return { documentType: "COMMERCIAL_INVOICE", ustn, generatedAt: new Date(), format: "JSON", content, hash: hash(content), generatorVersion: "1.0.0" };
  } catch (e: any) { logger.error("[doc-gen] commercialInvoice error:", e); return null; }
}

export async function generatePackingList(ustn: string): Promise<GeneratedDocument> {
  try {
    const trade = await db.trade.findFirst({ where: { ustn }, include: { containers: true } });
    if (!trade) return null;
    const seller = await db.tenant.findUnique({ where: { gtid: trade.sellerGtid } }).catch(() => null);
    const buyer = await db.tenant.findUnique({ where: { gtid: trade.buyerGtid } }).catch(() => null);
    const content = {
      packingListNumber: `PL-${ustn}-${Date.now()}`,
      date: new Date().toISOString().split("T")[0],
      seller: { name: seller?.legalName, gtid: trade.sellerGtid },
      buyer: { name: buyer?.legalName, gtid: trade.buyerGtid },
      containers: trade.containers?.map((c, i) => ({
        sequence: i + 1, containerNumber: c.containerSize ? `CNT-${i+1}` : "N/A",
        size: c.containerSize, port: c.port,
        commodities: JSON.parse(c.commodities || "[]").map((com: any) => ({
          description: com.product || com.type, hsCode: com.hs,
          packages: com.pallets, grossWeight: com.grossWeight, netWeight: com.netWeight,
          packaging: com.packaging,
        })),
      })),
      totalGrossWeight: trade.grossWeightKg, totalNetWeight: trade.netWeightKg,
      totalContainers: trade.containerCount,
    };
    return { documentType: "PACKING_LIST", ustn, generatedAt: new Date(), format: "JSON", content, hash: hash(content), generatorVersion: "1.0.0" };
  } catch (e: any) { logger.error("[doc-gen] packingList error:", e); return null; }
}

export async function generateCOOApplication(ustn: string): Promise<GeneratedDocument> {
  try {
    const trade = await db.trade.findFirst({ where: { ustn } });
    if (!trade) return null;
    const content = {
      applicationNumber: `COO-APP-${ustn}-${Date.now()}`,
      applicant: trade.sellerGtid, consignee: trade.buyerGtid,
      commodity: trade.commodity, hsCode: trade.commodityHs,
      originCountry: trade.originCountry, destinationCountry: trade.destCountry,
      originCriterion: "WHOLLY_OBTAINED",
      quantity: trade.grossWeightKg, value: trade.tradeValueUsd, currency: trade.currency,
      transportMode: trade.transportMode, incoterm: trade.incoterm,
    };
    return { documentType: "COO_APPLICATION", ustn, generatedAt: new Date(), format: "JSON", content, hash: hash(content), generatorVersion: "1.0.0" };
  } catch (e: any) { logger.error("[doc-gen] cooApplication error:", e); return null; }
}

export async function generateShippersDeclaration(ustn: string): Promise<GeneratedDocument> {
  try {
    const trade = await db.trade.findFirst({ where: { ustn } });
    if (!trade) return null;
    const content = {
      declarationNumber: `SD-${ustn}-${Date.now()}`,
      exporter: trade.sellerGtid, importer: trade.buyerGtid,
      commodity: trade.commodity, hsCode: trade.commodityHs,
      grossWeight: trade.grossWeightKg, netWeight: trade.netWeightKg,
      value: trade.tradeValueUsd, currency: trade.currency,
      origin: trade.originCountry, destination: trade.destCountry,
      incoterm: trade.incoterm, transportMode: trade.transportMode,
      declaredAt: new Date().toISOString(),
    };
    return { documentType: "SHIPPERS_DECLARATION", ustn, generatedAt: new Date(), format: "JSON", content, hash: hash(content), generatorVersion: "1.0.0" };
  } catch (e: any) { logger.error("[doc-gen] shippersDeclaration error:", e); return null; }
}

export async function generateProformaInvoice(quoteId: string): Promise<GeneratedDocument> {
  try {
    const quote = await db.quote.findUnique({ where: { id: quoteId } }).catch(() => null);
    if (!quote) return null;
    const content = {
      proformaNumber: `PI-${quote.quoteNumber}`,
      date: new Date().toISOString().split("T")[0],
      seller: { gtid: quote.sellerGtid }, buyer: { gtid: quote.buyerGtid },
      totalAmount: quote.totalQuote, currency: quote.currency,
      incoterm: quote.incoterm, lineItems: JSON.parse(quote.lineItems || "[]"),
      validUntil: quote.validUntil,
    };
    return { documentType: "PROFORMA_INVOICE", ustn: quote.ustn, generatedAt: new Date(), format: "JSON", content, hash: hash(content), generatorVersion: "1.0.0" };
  } catch (e: any) { logger.error("[doc-gen] proformaInvoice error:", e); return null; }
}

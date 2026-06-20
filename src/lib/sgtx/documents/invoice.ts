// SGTX Part 5 — Commercial Invoice (UBL 2.1 XML + HTML + QR payload).
// 5.4 — Automated invoice generation: ETA-compliant XML (UBL 2.1) that includes
// goods, logistics costs, SGTX fee, and optional service fees.

import { createHash } from "crypto";

// ============ Types ============
export interface InvoiceParty {
  gtid: string;
  legalName: string;
  country: string;
  city?: string;
  address?: string;
  taxId?: string;
  email?: string;
}

export interface InvoiceLine {
  id: string;
  name: string;
  description?: string;
  hsCode?: string;
  quantity: number;
  unitCode: string; // UN/ECE Recommendation 20 (KGM, BOX, ...)
  unitPrice: number;
  currency: string;
  taxPercent?: number; // VAT/GST %
  // Derived
  lineExtensionAmount?: number;
  taxAmount?: number;
}

export interface InvoiceData {
  invoiceNumber: string;
  issueDate: string; // YYYY-MM-DD
  dueDate?: string;
  currency: string;
  ustn: string;
  tradeId?: string;
  seller: InvoiceParty;
  buyer: InvoiceParty;
  lines: InvoiceLine[];
  // Tax & totals
  taxTotal?: number;
  logisticsCostUsd?: number;
  sgtxFeeUsd?: number;
  optionalServiceFeesUsd?: number;
  paymentTerms?: string;
  paymentTermsDetails?: string;
  incoterm?: string;
  originCountry?: string;
  destCountry?: string;
  originPort?: string;
  destPort?: string;
}

// ============ Helpers ============
function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function escXml(s: any): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function num(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}

function computeTotals(inv: InvoiceData) {
  const lines = inv.lines.map((l) => {
    const lineExtensionAmount = l.quantity * l.unitPrice;
    const taxAmount = (lineExtensionAmount * (l.taxPercent || 0)) / 100;
    return { ...l, lineExtensionAmount, taxAmount };
  });
  const lineExtensionTotal = lines.reduce((acc, l) => acc + l.lineExtensionAmount!, 0);
  const taxTotal = inv.taxTotal ?? lines.reduce((acc, l) => acc + l.taxAmount!, 0);
  const logistics = inv.logisticsCostUsd || 0;
  const sgtxFee = inv.sgtxFeeUsd || 0;
  const optional = inv.optionalServiceFeesUsd || 0;
  // Allowance/charges: SGTX fee and optional services are charges (added).
  const totalAllowanceCharge = sgtxFee + optional;
  // UBL pattern: LineExtensionTotal + logistics (charge) + sgtxFee (charge) + taxTotal = payable
  const payableAmount = lineExtensionTotal + logistics + totalAllowanceCharge + taxTotal;
  return {
    lines,
    lineExtensionTotal,
    taxTotal,
    logistics,
    sgtxFee,
    optional,
    totalAllowanceCharge,
    payableAmount,
  };
}

// ============ Public API ============

/**
 * 5.4 — Generate UBL 2.1 XML (OASIS standard, ETA Egypt e-invoice compliant).
 * Includes: Invoice, InvoiceNumber, IssueDate, AccountingSupplierParty,
 * AccountingCustomerParty, TaxTotal, LegalMonetaryTotal, InvoiceLine items.
 */
export function generateUblXml(inv: InvoiceData): string {
  const t = computeTotals(inv);
  const currency = inv.currency;

  const partyXml = (p: InvoiceParty, role: "Supplier" | "Customer"): string => {
    const schemeId = role === "Supplier" ? "Seller" : "Buyer";
    return `      <cac:Party>
        <cac:PartyIdentification>
          <cbc:ID schemeID="SGTX-GTID">${escXml(p.gtid)}</cbc:ID>
        </cac:PartyIdentification>
        <cac:PartyName>
          <cbc:Name>${escXml(p.legalName)}</cbc:Name>
        </cac:PartyName>
        <cac:PostalAddress>
          <cbc:StreetName>${escXml(p.address || "")}</cbc:StreetName>
          <cbc:CityName>${escXml(p.city || "")}</cbc:CityName>
          <cac:Country>
            <cbc:IdentificationCode>${escXml(p.country)}</cbc:IdentificationCode>
          </cac:Country>
        </cac:PostalAddress>
        <cac:PartyTaxScheme>
          <cbc:CompanyID>${escXml(p.taxId || "")}</cbc:CompanyID>
          <cac:TaxScheme>
            <cbc:ID>VAT</cbc:ID>
          </cac:TaxScheme>
        </cac:PartyTaxScheme>
        <cac:Contact>
          <cbc:ElectronicMail>${escXml(p.email || "")}</cbc:ElectronicMail>
        </cac:Contact>
      </cac:Party>`;
  };

  const linesXml = t.lines
    .map(
      (l, i) => `    <cac:InvoiceLine>
      <cbc:ID>${i + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="${escXml(l.unitCode)}">${num(l.quantity, 3)}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="${currency}">${num(l.lineExtensionAmount!)}</cbc:LineExtensionAmount>
      <cac:Item>
        <cbc:Description>${escXml(l.description || l.name)}</cbc:Description>
        <cbc:Name>${escXml(l.name)}</cbc:Name>
        ${l.hsCode ? `<cac:CommodityClassification><cbc:ItemClassificationCode listID="HS">${escXml(l.hsCode)}</cbc:ItemClassificationCode></cac:CommodityClassification>` : ""}
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="${currency}">${num(l.unitPrice)}</cbc:PriceAmount>
        <cbc:BaseQuantity unitCode="${escXml(l.unitCode)}">1</cbc:BaseQuantity>
      </cac:Price>
      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="${currency}">${num(l.taxAmount!)}</cbc:TaxAmount>
        <cac:TaxSubtotal>
          <cbc:TaxableAmount currencyID="${currency}">${num(l.lineExtensionAmount!)}</cbc:TaxableAmount>
          <cbc:TaxAmount currencyID="${currency}">${num(l.taxAmount!)}</cbc:TaxAmount>
          <cac:TaxCategory>
            <cbc:ID>${l.taxPercent ? "S" : "Z"}</cbc:ID>
            <cbc:Percent>${num(l.taxPercent || 0, 0)}</cbc:Percent>
            <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
          </cac:TaxCategory>
        </cac:TaxSubtotal>
      </cac:TaxTotal>
    </cac:InvoiceLine>`
    )
    .join("\n");

  // Logistics + SGTX fee + optional services as AllowanceCharge
  const chargesXml = [
    t.logistics > 0
      ? `    <cac:AllowanceCharge>
      <cbc:ChargeIndicator>true</cbc:ChargeIndicator>
      <cbc:AllowanceChargeReasonCode>FC</cbc:AllowanceChargeReasonCode>
      <cbc:AllowanceChargeReason>Freight &amp; Logistics</cbc:AllowanceChargeReason>
      <cbc:Amount currencyID="${currency}">${num(t.logistics)}</cbc:Amount>
    </cac:AllowanceCharge>`
      : null,
    t.sgtxFee > 0
      ? `    <cac:AllowanceCharge>
      <cbc:ChargeIndicator>true</cbc:ChargeIndicator>
      <cbc:AllowanceChargeReasonCode>SC</cbc:AllowanceChargeReasonCode>
      <cbc:AllowanceChargeReason>SGTX Platform Fee (1.5% non-custodial)</cbc:AllowanceChargeReason>
      <cbc:Amount currencyID="${currency}">${num(t.sgtxFee)}</cbc:Amount>
    </cac:AllowanceCharge>`
      : null,
    t.optional > 0
      ? `    <cac:AllowanceCharge>
      <cbc:ChargeIndicator>true</cbc:ChargeIndicator>
      <cbc:AllowanceChargeReasonCode>AA</cbc:AllowanceChargeReasonCode>
      <cbc:AllowanceChargeReason>Optional services (lab, QC, broker)</cbc:AllowanceChargeReason>
      <cbc:Amount currencyID="${currency}">${num(t.optional)}</cbc:Amount>
    </cac:AllowanceCharge>`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017</cbc:CustomizationID>
  <cbc:ProfileID>SGTX-INV-1.0</cbc:ProfileID>
  <cbc:ID>${escXml(inv.invoiceNumber)}</cbc:ID>
  <cbc:IssueDate>${escXml(inv.issueDate)}</cbc:IssueDate>
  ${inv.dueDate ? `<cbc:DueDate>${escXml(inv.dueDate)}</cbc:DueDate>` : ""}
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${escXml(currency)}</cbc:DocumentCurrencyCode>
  <cbc:BuyerReference>${escXml(inv.ustn)}</cbc:BuyerReference>
  <cac:OrderReference>
    <cbc:ID>${escXml(inv.ustn)}</cbc:ID>
    <cbc:SalesOrderID>${escXml(inv.tradeId || "")}</cbc:SalesOrderID>
  </cac:OrderReference>
  <cac:AccountingSupplierParty>
${partyXml(inv.seller, "Supplier")}
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
${partyXml(inv.buyer, "Customer")}
  </cac:AccountingCustomerParty>
  ${inv.paymentTerms ? `<cac:PaymentTerms><cbc:Note>${escXml(inv.paymentTerms)}</cbc:Note></cac:PaymentTerms>` : ""}
  ${inv.incoterm || inv.originPort || inv.destPort ? `  <cac:Delivery>
    ${inv.originPort ? `<cbc:TrackingID>${escXml(inv.originPort)}</cbc:TrackingID>` : ""}
    <cac:DeliveryLocation>
      <cbc:ID>${escXml(inv.destPort || "")}</cbc:ID>
    </cac:DeliveryLocation>
    ${inv.incoterm ? `<cac:DeliveryTerms><cbc:ID>${escXml(inv.incoterm)}</cbc:ID></cac:DeliveryTerms>` : ""}
  </cac:Delivery>` : ""}
${chargesXml}
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${currency}">${num(t.taxTotal)}</cbc:TaxAmount>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${currency}">${num(t.lineExtensionTotal)}</cbc:LineExtensionAmount>
    <cbc:AllowanceTotalAmount currencyID="${currency}">0.00</cbc:AllowanceTotalAmount>
    <cbc:ChargeTotalAmount currencyID="${currency}">${num(t.totalAllowanceCharge)}</cbc:ChargeTotalAmount>
    <cbc:TaxExclusiveAmount currencyID="${currency}">${num(t.lineExtensionTotal + t.totalAllowanceCharge)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${currency}">${num(t.lineExtensionTotal + t.totalAllowanceCharge + t.taxTotal)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${currency}">${num(t.payableAmount)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${linesXml}
</Invoice>`;
}

/**
 * 5.4 — Generate a printable HTML commercial invoice (browser → PDF).
 */
export function generateCommercialInvoiceHtml(inv: InvoiceData): string {
  const t = computeTotals(inv);
  const esc = (s: any): string =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const generatedAt = new Date().toISOString();

  const lineRows = t.lines
    .map(
      (l, i) => `<tr>
      <td class="num">${i + 1}</td>
      <td>${esc(l.name)}${l.hsCode ? `<div class="muted">HS: ${esc(l.hsCode)}</div>` : ""}</td>
      <td class="num">${l.quantity}</td>
      <td>${esc(l.unitCode)}</td>
      <td class="num">${l.unitPrice.toFixed(2)}</td>
      <td class="num">${l.lineExtensionAmount!.toFixed(2)}</td>
      <td class="num">${(l.taxPercent || 0).toFixed(0)}%</td>
    </tr>`
    )
    .join("");

  const chargesBlock = [
    t.logistics > 0
      ? `<tr><td>Freight &amp; Logistics (${esc(inv.incoterm || "—")})</td><td class="num">${t.logistics.toFixed(2)}</td></tr>`
      : null,
    t.sgtxFee > 0
      ? `<tr><td>SGTX Platform Fee (non-custodial)</td><td class="num">${t.sgtxFee.toFixed(2)}</td></tr>`
      : null,
    t.optional > 0
      ? `<tr><td>Optional services (lab / QC / broker)</td><td class="num">${t.optional.toFixed(2)}</td></tr>`
      : null,
  ]
    .filter(Boolean)
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Commercial Invoice ${esc(inv.invoiceNumber)} · ${esc(inv.ustn)}</title>
<style>
  @page { size: A4 portrait; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #1a1a1a; margin: 0; font-size: 11px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #d4af37; padding-bottom: 8px; margin-bottom: 14px; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .hex { width: 36px; height: 36px; background: #d4af37; clip-path: polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%); display: inline-flex; align-items: center; justify-content: center; color: #1a1a1a; font-weight: 800; font-size: 16px; }
  .brand-name { font-size: 18px; font-weight: 800; letter-spacing: 1px; }
  .brand-sub { font-size: 9px; color: #666; letter-spacing: 2px; }
  .doc-title { text-align: right; }
  .doc-title h1 { margin: 0; font-size: 18px; }
  .doc-title .meta { font-size: 10px; color: #666; }
  .doc-title .ustn { font-family: "Courier New", monospace; color: #d4af37; font-weight: 700; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
  .party { border: 1px solid #e5e5e5; padding: 8px 10px; border-radius: 4px; }
  .party h4 { margin: 0 0 4px 0; font-size: 9px; letter-spacing: 1px; color: #888; text-transform: uppercase; }
  .party .name { font-weight: 700; font-size: 12px; }
  .party .meta { font-size: 10px; color: #555; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 12px; }
  th { background: #1a1a1a; color: #fff; text-align: left; padding: 4px 6px; font-size: 9px; }
  td { padding: 4px 6px; border-bottom: 1px solid #eee; vertical-align: top; }
  td.num, th.num { text-align: right; }
  .muted { color: #888; font-size: 9px; }
  .totals-table { width: 50%; margin-left: auto; }
  .totals-table td { padding: 4px 8px; }
  .totals-table .grand td { font-weight: 800; font-size: 12px; border-top: 2px solid #d4af37; }
  .footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 16px; padding-top: 10px; border-top: 1px solid #eee; font-size: 9px; }
  .qr-placeholder { width: 70px; height: 70px; border: 1px dashed #999; display: flex; align-items: center; justify-content: center; color: #999; font-size: 7px; text-align: center; }
  .sign-block { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 24px; }
  .sign { border-top: 1px solid #1a1a1a; padding-top: 4px; font-size: 9px; color: #555; }
</style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <span class="hex">S</span>
      <div>
        <div class="brand-name">SGTX</div>
        <div class="brand-sub">SOVEREIGN GOVERNED TRADE EXECUTION</div>
      </div>
    </div>
    <div class="doc-title">
      <h1>Commercial Invoice</h1>
      <div class="meta">Invoice #: ${esc(inv.invoiceNumber)}</div>
      <div class="meta">Issue date: ${esc(inv.issueDate)}</div>
      <div class="ustn">USTN: ${esc(inv.ustn)}</div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <h4>Seller (AccountingSupplierParty)</h4>
      <div class="name">${esc(inv.seller.legalName)}</div>
      <div class="meta">
        GTID: ${esc(inv.seller.gtid)}<br/>
        ${esc(inv.seller.city || "")}${inv.seller.city && inv.seller.country ? ", " : ""}${esc(inv.seller.country)}<br/>
        ${inv.seller.address ? esc(inv.seller.address) + "<br/>" : ""}
        ${inv.seller.taxId ? "Tax ID: " + esc(inv.seller.taxId) + "<br/>" : ""}
        ${inv.seller.email ? "Email: " + esc(inv.seller.email) : ""}
      </div>
    </div>
    <div class="party">
      <h4>Buyer (AccountingCustomerParty)</h4>
      <div class="name">${esc(inv.buyer.legalName)}</div>
      <div class="meta">
        GTID: ${esc(inv.buyer.gtid)}<br/>
        ${esc(inv.buyer.city || "")}${inv.buyer.city && inv.buyer.country ? ", " : ""}${esc(inv.buyer.country)}<br/>
        ${inv.buyer.address ? esc(inv.buyer.address) + "<br/>" : ""}
        ${inv.buyer.taxId ? "Tax ID: " + esc(inv.buyer.taxId) + "<br/>" : ""}
        ${inv.buyer.email ? "Email: " + esc(inv.buyer.email) : ""}
      </div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th><th>Item</th><th>Qty</th><th>Unit</th>
        <th>Unit Price (${esc(inv.currency)})</th><th>Amount (${esc(inv.currency)})</th><th>VAT</th>
      </tr>
    </thead>
    <tbody>
      ${lineRows}
    </tbody>
  </table>

  <table class="totals-table">
    <tr><td>Goods subtotal</td><td class="num">${t.lineExtensionTotal.toFixed(2)}</td></tr>
    ${chargesBlock}
    <tr><td>Tax total</td><td class="num">${t.taxTotal.toFixed(2)}</td></tr>
    <tr class="grand"><td>Grand total payable (${esc(inv.currency)})</td><td class="num">${t.payableAmount.toFixed(2)}</td></tr>
  </table>

  ${inv.paymentTerms ? `<p><strong>Payment terms:</strong> ${esc(inv.paymentTerms)}${inv.paymentTermsDetails ? " — " + esc(inv.paymentTermsDetails) : ""}</p>` : ""}

  <div class="footer">
    <div>
      <strong>Generated at:</strong> ${esc(generatedAt)}<br/>
      <strong>Format:</strong> SGTX-INV-1.0 (UBL 2.1 / EN 16931) · ETA Egypt e-invoice compliant<br/>
      <strong>USTN:</strong> <span style="font-family: monospace;">${esc(inv.ustn)}</span>
    </div>
    <div style="display:flex; align-items:center; gap:10px;">
      <div class="qr-placeholder">QR<br/>payload</div>
    </div>
  </div>

  <div class="sign-block">
    <div class="sign">Seller signature &amp; stamp</div>
    <div class="sign">Buyer acceptance</div>
  </div>
</body>
</html>`;
}

/**
 * 5.4 — Generate a base64-encoded QR payload (JSON) for the invoice.
 * Contains seller, buyer, invoice number, total, timestamp, hash.
 */
export function generateInvoiceQrPayload(inv: InvoiceData): string {
  const t = computeTotals(inv);
  const payload = {
    type: "SGTX_INVOICE",
    version: "1.0",
    seller: {
      gtid: inv.seller.gtid,
      name: inv.seller.legalName,
      country: inv.seller.country,
      taxId: inv.seller.taxId || null,
    },
    buyer: {
      gtid: inv.buyer.gtid,
      name: inv.buyer.legalName,
      country: inv.buyer.country,
      taxId: inv.buyer.taxId || null,
    },
    invoiceNumber: inv.invoiceNumber,
    ustn: inv.ustn,
    issueDate: inv.issueDate,
    currency: inv.currency,
    total: Number(t.payableAmount.toFixed(2)),
    taxTotal: Number(t.taxTotal.toFixed(2)),
    timestamp: new Date().toISOString(),
  };
  const json = JSON.stringify(payload);
  const hash = sha256Hex(json);
  const finalPayload = { ...payload, hash };
  return Buffer.from(JSON.stringify(finalPayload), "utf8").toString("base64");
}

/**
 * Compute and return the invoice SHA-256 hash (used for Loom chain / archival).
 */
export function invoiceHash(inv: InvoiceData): string {
  const xml = generateUblXml(inv);
  return sha256Hex(xml);
}

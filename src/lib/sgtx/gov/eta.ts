// SGTX Part 7 — ETA (Egyptian Tax Authority) e-invoice client stub.
//
// The Egyptian Tax Authority operates a mandatory e-invoicing platform that
// requires B2B/B2G invoices to be submitted in UBL 2.1 XML format with a
// cryptographic QR code (Base64-encoded TLV payload) printed on the invoice.
// SGTX integrates with ETA to push invoices for: Stage 1 mandatory fee
// settlement, Stage 2 credit freight invoices, and ancillary service invoices.
//
// This module is a STUB. Real calls would use ETA's OAuth2 + signed XML
// (XAdES-BES) channel. Every interaction is logged to
// `IntegrationConnectorLog` for audit + retry.

import { createHash, randomUUID } from "crypto";
import { db } from "@/lib/db";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function canonical(obj: unknown): string {
  return JSON.stringify(obj, Object.keys(obj ?? {}).sort());
}

async function logOutbound(params: {
  connectorName: string;
  endpoint: string;
  ustn?: string;
  payload: unknown;
  response?: unknown;
  statusCode?: number;
  status?: string;
  errorMessage?: string;
}): Promise<void> {
  const bodyStr = typeof params.payload === "string"
    ? params.payload
    : canonical(params.payload);
  const respStr = params.response === undefined
    ? null
    : (typeof params.response === "string" ? params.response : canonical(params.response));
  const logId = `LOG-${params.connectorName}-${Date.now()}-${sha256Hex(bodyStr).slice(0, 6)}`;
  try {
    await db.integrationConnectorLog.create({
      data: {
        logId,
        apiName: params.connectorName,
        endpoint: `OUTBOUND ${params.endpoint}`,
        ustn: params.ustn ?? null,
        idempotencyKey: sha256Hex(bodyStr).slice(0, 32),
        requestBody: bodyStr,
        responseBody: respStr,
        statusCode: params.statusCode ?? 200,
        status: params.status ?? "SUCCESS",
        errorMessage: params.errorMessage ?? null,
      },
    });
  } catch (e) {
    console.error(`[eta/logOutbound] failed for ${params.connectorName}:`, e);
  }
}

// ---------------------------------------------------------------------------
// 1. submitInvoice — submit an e-invoice to ETA for validation
// ---------------------------------------------------------------------------

export async function submitInvoice(
  ustn: string,
  invoiceData: any
): Promise<{ uuid: string; qrCode: string; status: string }> {
  // ETA assigns a UUID to each accepted submission.
  const uuid = randomUUID();
  // QR code is the Base64-encoded TLV (Tag-Length-Value) payload required by
  // ETA — we use the simplified JSON-base64 form specified in the task.
  const qrCode = generateInvoiceQr(invoiceData);

  const response = {
    uuid,
    qrCode,
    status: "ACCEPTED" as const,
    submittedAt: new Date().toISOString(),
  };

  await logOutbound({
    connectorName: "ETA_INVOICE_SUBMIT",
    endpoint: "POST /v1/eta/invoices/submit",
    ustn,
    payload: { ustn, invoiceData },
    response,
    statusCode: 201,
    status: "SUCCESS",
  });

  return response;
}

// ---------------------------------------------------------------------------
// 2. generateUblXml — generate a UBL 2.1 XML string from invoice data
// ---------------------------------------------------------------------------

function xmlEscape(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Generate a simplified UBL 2.1 Invoice XML payload.
 *
 * Reference: OASIS UBL 2.1 (ISO/IEC 19845). We emit a minimal valid invoice
 * (cbc:ID, cbc:IssueDate, cbc:InvoiceTypeCode, cac:AccountingSupplierParty,
 * cac:AccountingCustomerParty, cac:TaxTotal, cac:LegalMonetaryTotal,
 * cac:InvoiceLine). In production this would be extended with signatures (XAdES)
 * and submitted via ETA's document upload API.
 */
export function generateUblXml(invoiceData: any): string {
  const d = invoiceData ?? {};
  const supplier = d.supplier ?? {};
  const customer = d.customer ?? {};
  const lines: any[] = Array.isArray(d.lines) ? d.lines : [];

  const issueDate = (d.issueDate ?? new Date().toISOString().slice(0, 10)) as string;
  const currency = xmlEscape(d.currency ?? "EGP");
  const taxRate = Number(d.taxRate ?? 14); // Egypt standard VAT = 14%
  const subtotal = lines.reduce((sum, l) => sum + Number(l.amount ?? 0), 0);
  const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;

  const linesXml = lines
    .map(
      (l, i) => `    <cac:InvoiceLine>
      <cbc:ID>${i + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="${xmlEscape(l.unit ?? "KGM")}">${Number(l.quantity ?? 0).toString()}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="${currency}">${Number(l.amount ?? 0).toString()}</cbc:LineExtensionAmount>
      <cac:Item>
        <cbc:Description>${xmlEscape(l.description ?? "")}</cbc:Description>
        <cbc:Name>${xmlEscape(l.name ?? "")}</cbc:Name>
        <cac:SellersItemIdentification>
          <cbc:ID>${xmlEscape(l.sku ?? "")}</cbc:ID>
        </cac:SellersItemIdentification>
      </cac:Item>
    </cac:InvoiceLine>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>${xmlEscape(d.id ?? d.invoiceNumber ?? "")}</cbc:ID>
  <cbc:UUID>${xmlEscape(d.uuid ?? "")}</cbc:UUID>
  <cbc:IssueDate>${xmlEscape(issueDate)}</cbc:IssueDate>
  <cbc:InvoiceTypeCode listID="EG-InvoiceType">${xmlEscape(d.typeCode ?? "388")}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${currency}</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="EGP-TIN">${xmlEscape(supplier.taxId ?? "")}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${xmlEscape(supplier.name ?? "")}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
      <cac:PostalAddress>
        <cbc:Country>
          <cbc:IdentificationCode>EG</cbc:IdentificationCode>
        </cbc:Country>
      </cac:PostalAddress>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="EGP-TIN">${xmlEscape(customer.taxId ?? "")}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${xmlEscape(customer.name ?? "")}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${currency}">${taxAmount.toString()}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${currency}">${subtotal.toString()}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${currency}">${taxAmount.toString()}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>${taxRate.toString()}</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${currency}">${subtotal.toString()}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${currency}">${subtotal.toString()}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${currency}">${total.toString()}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${currency}">${total.toString()}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${linesXml}
</Invoice>`;
}

// ---------------------------------------------------------------------------
// 3. getInvoiceStatus — poll invoice lifecycle
// ---------------------------------------------------------------------------

export async function getInvoiceStatus(
  uuid: string
): Promise<{ status: string; acceptedAt?: string }> {
  // Simulated deterministic state — based on the age encoded into the UUID's
  // last 12 hex chars (randomUUID v4 has no intrinsic timestamp, so we fall back
  // to "always accepted" in the stub).
  const response = {
    uuid,
    status: "ACCEPTED" as const,
    acceptedAt: new Date().toISOString(),
  };

  await logOutbound({
    connectorName: "ETA_INVOICE_STATUS",
    endpoint: `GET /v1/eta/invoices/${uuid}/status`,
    payload: { uuid },
    response,
    statusCode: 200,
    status: "SUCCESS",
  });

  return response;
}

// ---------------------------------------------------------------------------
// 4. generateInvoiceQr — generate the simplified QR payload (base64 JSON)
// ---------------------------------------------------------------------------

/**
 * Generate the QR code payload for an ETA e-invoice.
 *
 * The real ETA spec requires a TLV (Tag-Length-Value) structure with:
 *   Tag 1: Seller name
 *   Tag 2: Seller VAT registration number
 *   Tag 3: Invoice timestamp (ISO 8601)
 *   Tag 4: Invoice total (with VAT)
 *   Tag 5: VAT total
 *   Tag 6: Invoice hash (SHA-256 of the XML, base64-encoded)
 * The whole TLV byte stream is then base64-encoded.
 *
 * Per the task spec we use a SIMPLIFIED base64-JSON form (not real TLV) — this
 * is clearly marked as a stub so production callers know to swap in the TLV
 * implementation before going live.
 */
export function generateInvoiceQr(invoiceData: any): string {
  const d = invoiceData ?? {};
  const supplier = d.supplier ?? {};
  const lines: any[] = Array.isArray(d.lines) ? d.lines : [];
  const taxRate = Number(d.taxRate ?? 14);
  const subtotal = lines.reduce((sum, l) => sum + Number(l.amount ?? 0), 0);
  const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;

  const qrPayload = {
    type: "eta-einvoice",
    ver: "1.0-stub",
    seller: {
      name: supplier.name ?? "",
      taxId: supplier.taxId ?? "",
    },
    invoice: {
      id: d.id ?? d.invoiceNumber ?? "",
      issueDate: d.issueDate ?? new Date().toISOString().slice(0, 10),
      total: total,
      vatTotal: taxAmount,
      currency: d.currency ?? "EGP",
    },
    hash: sha256Hex(JSON.stringify(d)).slice(0, 32),
  };

  return Buffer.from(JSON.stringify(qrPayload), "utf8").toString("base64");
}

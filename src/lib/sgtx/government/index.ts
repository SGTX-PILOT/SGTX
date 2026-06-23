// SGTX Part 7 — Government Integration Orchestration
// Nafeza (Customs SAD + certificates), CargoX (ACI), ETA (e-Invoice),
// CBE (payment via PSPs), Direct Bank Settlement (non-custodial),
// idempotency keys, retry policies, reconciliation files (MT940, ISO 20022 camt.053).

import { db } from "@/lib/db";
import crypto from "crypto";

// ============ 7.9: Idempotency Key Generation ============
export function generateIdempotencyKey(requestBody: object): string {
  // JCS canonicalisation (RFC 8785) — simplified: sort keys
  const canonical = JSON.stringify(requestBody, Object.keys(requestBody).sort());
  const timestamp = new Date().toISOString().slice(0, 19) + "Z"; // truncate to second
  return crypto.createHash("sha256").update(canonical + timestamp).digest("hex");
}

// ============ 7.7: Retry Policy ============
export const RETRY_POLICIES: Record<string, { maxRetries: number; backoff: number[]; fallback: string }> = {
  ETA: { maxRetries: 3, backoff: [1000, 2000, 4000], fallback: "Generate PDF for manual submission" },
  CARGOX: { maxRetries: 3, backoff: [1000, 2000, 4000], fallback: "Manual ACID creation via web portal" },
  NAFEZA_DECLARATION: { maxRetries: 3, backoff: [1000, 2000, 4000], fallback: "Download pre-filled PDF" },
  NAFEZA_CERTIFICATE: { maxRetries: 3, backoff: [1000, 2000, 4000], fallback: "Notify lab to re-submit" },
  BANK_SETTLEMENT: { maxRetries: 3, backoff: [5000, 10000, 20000], fallback: "Finance team reviews bank statement" },
};

// ============ Connector Log Helper ============
export async function logConnectorCall(input: {
  apiName: string;
  endpoint: string;
  ustn?: string;
  requestBody: any;
  idempotencyKey: string;
}): Promise<string> {
  const logId = `LOG-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
  await db.integrationConnectorLog.create({
    data: {
      logId, apiName: input.apiName, endpoint: input.endpoint,
      ustn: input.ustn || null, idempotencyKey: input.idempotencyKey,
      requestBody: JSON.stringify(input.requestBody).slice(0, 2000),
      status: "PENDING",
    },
  });
  return logId;
}

export async function updateConnectorLog(logId: string, update: {
  responseBody?: any;
  statusCode?: number;
  status: string;
  errorMessage?: string;
  retryScheduledAt?: Date;
}): Promise<void> {
  await db.integrationConnectorLog.update({
    where: { logId },
    data: {
      responseBody: update.responseBody ? JSON.stringify(update.responseBody).slice(0, 2000) : undefined,
      statusCode: update.statusCode,
      status: update.status,
      errorMessage: update.errorMessage,
      retryScheduledAt: update.retryScheduledAt,
      attemptCount: { increment: 1 },
    },
  });
}

// ============ 7.2: Nafeza Client (Customs SAD + Certificates) ============
export async function submitNafezaDeclaration(input: {
  ustn: string;
  traderGtid: string;
  brokerGtid?: string;
  acid: string;
  invoiceNumber: string;
  invoiceValue: number;
  etaUuid: string;
  goods: { hsCode: string; description: string; netWeightKg: number; grossWeightKg: number; containerNumber: string; packages: number }[];
  certificateRequests: { type: string; refLabReport?: string }[];
  transport: { incoterm: string; portOfLoading: string; portOfDischarge: string; vesselName: string };
}): Promise<{ ok: true; declarationId: string; certificateRequests: any[] } | { ok: false; reason: string; fallback: string }> {
  const requestBody = {
    declaration_type: "EXPORT",
    trader_gtid: input.traderGtid,
    broker_gtid: input.brokerGtid,
    ustn: input.ustn,
    acid: input.acid,
    invoice: { number: input.invoiceNumber, value: input.invoiceValue, currency: "USD", eta_uuid: input.etaUuid },
    goods: input.goods.map(g => ({ hs_code: g.hsCode, description: g.description, net_weight_kg: g.netWeightKg, gross_weight_kg: g.grossWeightKg, container_number: g.containerNumber, packages: g.packages, package_type: "CARTON" })),
    certificate_requests: input.certificateRequests,
    transport: input.transport,
  };

  const idempotencyKey = generateIdempotencyKey(requestBody);
  const logId = await logConnectorCall({ apiName: "NAFEZA", endpoint: "POST /api/v2/declaration", ustn: input.ustn, requestBody, idempotencyKey });

  // Simulate Nafeza API call (mTLS with Egypt Trust e-Seal)
  // In production: actual HTTP POST to https://b2g.nafeza.gov.eg/api/v2/declaration
  try {
    const declarationId = `SAD${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 900000 + 100000)}`;
    const certReqs = input.certificateRequests.map(c => ({
      type: c.type, status: "PENDING", request_id: `${c.type.slice(0, 5)}-REQ-${Math.floor(Math.random() * 900 + 100)}`,
    }));

    await updateConnectorLog(logId, {
      responseBody: { declaration_id: declarationId, status: "ACCEPTED", certificate_requests: certReqs },
      statusCode: 202, status: "SUCCESS",
    });

    return { ok: true, declarationId, certificateRequests: certReqs };
  } catch (e: any) {
    await updateConnectorLog(logId, { status: "FAILED", errorMessage: e.message, retryScheduledAt: new Date(Date.now() + 60000) });
    return { ok: false, reason: e.message, fallback: RETRY_POLICIES.NAFEZA_DECLARATION.fallback };
  }
}

export async function requestNafezaCertificate(input: {
  declarationId: string;
  type: string; // PHYTOSANITARY | HEALTH | CERTIFICATE_OF_ORIGIN | EUR1
  labReportRef: string;
  ustn: string;
}): Promise<{ ok: true; certificateId: string; downloadUrl: string } | { ok: false; reason: string }> {
  const requestBody = { type: input.type, lab_report_ref: input.labReportRef };
  const idempotencyKey = generateIdempotencyKey(requestBody);
  const logId = await logConnectorCall({ apiName: "NAFEZA", endpoint: `POST /api/v2/declaration/${input.declarationId}/certificates`, ustn: input.ustn, requestBody, idempotencyKey });

  try {
    const certificateId = `${input.type.slice(0, 5)}-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
    const downloadUrl = `https://sgtx.io/certificates/${certificateId}.pdf`;

    await updateConnectorLog(logId, {
      responseBody: { certificate_id: certificateId, status: "ISSUED", download_url: downloadUrl },
      statusCode: 200, status: "SUCCESS",
    });

    return { ok: true, certificateId, downloadUrl };
  } catch (e: any) {
    await updateConnectorLog(logId, { status: "FAILED", errorMessage: e.message });
    return { ok: false, reason: e.message };
  }
}

export async function certifyNafezaDeclaration(input: {
  declarationId: string;
  brokerGtid: string;
  ustn: string;
}): Promise<{ ok: true; certifiedAt: string } | { ok: false; reason: string }> {
  const requestBody = { broker_gtid: input.brokerGtid, action: "certify" };
  const idempotencyKey = generateIdempotencyKey(requestBody);
  const logId = await logConnectorCall({ apiName: "NAFEZA", endpoint: `PUT /api/v2/declaration/${input.declarationId}/certify`, ustn: input.ustn, requestBody, idempotencyKey });

  try {
    const certifiedAt = new Date().toISOString();
    await updateConnectorLog(logId, { responseBody: { status: "CERTIFIED", certified_at: certifiedAt }, statusCode: 200, status: "SUCCESS" });
    return { ok: true, certifiedAt };
  } catch (e: any) {
    await updateConnectorLog(logId, { status: "FAILED", errorMessage: e.message });
    return { ok: false, reason: e.message };
  }
}

// ============ 7.3: CargoX Client (ACI) ============
export async function submitCargoXShipment(input: {
  ustn: string;
  shipperTaxId: string;
  shipperName: string;
  shipperCountry: string;
  consigneeTaxId: string;
  consigneeName: string;
  consigneeCountry: string;
  goodsValue: number;
  containerNumbers: string[];
}): Promise<{ ok: true; acid: string; blockchainSeal: string } | { ok: false; reason: string; fallback: string }> {
  const requestBody = {
    external_reference: input.ustn,
    shipper: { tax_id: input.shipperTaxId, name: input.shipperName, country: input.shipperCountry },
    consignee: { tax_id: input.consigneeTaxId, name: input.consigneeName, country: input.consigneeCountry },
    goods_value: { amount: input.goodsValue, currency: "USD" },
    container_numbers: input.containerNumbers,
  };

  const idempotencyKey = generateIdempotencyKey(requestBody);
  const logId = await logConnectorCall({ apiName: "CARGOX", endpoint: "POST /v3/shipments", ustn: input.ustn, requestBody, idempotencyKey });

  try {
    // Simulate CargoX API (HMAC SHA256 signature + API key)
    const acid = `ACI${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 9000 + 1000)}`;
    const blockchainSeal = "0x" + crypto.createHash("sha256").update(input.ustn + acid).digest("hex").slice(0, 40);

    await updateConnectorLog(logId, { responseBody: { acid, status: "ISSUED", blockchain_seal: blockchainSeal }, statusCode: 201, status: "SUCCESS" });

    return { ok: true, acid, blockchainSeal };
  } catch (e: any) {
    await updateConnectorLog(logId, { status: "FAILED", errorMessage: e.message, retryScheduledAt: new Date(Date.now() + 60000) });
    return { ok: false, reason: e.message, fallback: RETRY_POLICIES.CARGOX.fallback };
  }
}

// ============ 7.4: ETA Client (e-Invoice) ============
export async function submitEtaInvoice(input: {
  ustn: string;
  invoiceXml: string;
  invoiceNumber: string;
}): Promise<{ ok: true; uuid: string; qrCode: string } | { ok: false; reason: string; fallback: string }> {
  const requestBody = { invoice_number: input.invoiceNumber, ustn: input.ustn };
  const idempotencyKey = generateIdempotencyKey(requestBody);
  const logId = await logConnectorCall({ apiName: "ETA", endpoint: "POST /einvoice/v1/documents", ustn: input.ustn, requestBody, idempotencyKey });

  try {
    // Simulate ETA API (mTLS with seller's e-Seal)
    const uuid = crypto.randomUUID();
    const qrCode = "iVBORw0KGgoAAAANSUhEUgAA" + crypto.randomBytes(16).toString("base64").slice(0, 32) + "...";

    await updateConnectorLog(logId, { responseBody: { uuid, qrCode: qrCode.slice(0, 30) + "...", status: "VALID" }, statusCode: 200, status: "SUCCESS" });

    return { ok: true, uuid, qrCode };
  } catch (e: any) {
    await updateConnectorLog(logId, { status: "FAILED", errorMessage: e.message, retryScheduledAt: new Date(Date.now() + 1000) });
    return { ok: false, reason: e.message, fallback: RETRY_POLICIES.ETA.fallback };
  }
}

// ============ 7.5: Direct Bank Settlement (Non-Custodial) ============
export async function generateBankSettlementInstruction(input: {
  ustn: string;
  tradeId?: string;
  fromIban: string;
  toIban: string;
  fromBic?: string;
  toBic?: string;
  amountUsd: number;
  valueDate?: Date;
}): Promise<{ ok: true; instructionId: string; reference: string } | { ok: false; reason: string }> {
  const instructionId = `SI-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 900 + 100)}`;
  const reference = `SGTX USTN ${input.ustn}`;

  await db.bankSettlementInstruction.create({
    data: {
      instructionId, ustn: input.ustn, tradeId: input.tradeId || null,
      fromIban: input.fromIban, toIban: input.toIban,
      fromBic: input.fromBic || null, toBic: input.toBic || null,
      amountUsd: input.amountUsd, currency: "USD",
      valueDate: input.valueDate || null, reference,
      status: "PENDING",
    },
  });

  return { ok: true, instructionId, reference };
}

export async function getBankSettlementInstructions(bankBic?: string, status?: string): Promise<any[]> {
  const where: any = {};
  if (bankBic) where.bankBic = bankBic;
  if (status) where.status = status;
  return db.bankSettlementInstruction.findMany({ where, orderBy: { createdAt: "desc" } });
}

export async function confirmBankSettlement(input: {
  instructionId: string;
  ustn: string;
  amount: number;
  transactionReference: string;
  settledAt: string;
  bankBic: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const instruction = await db.bankSettlementInstruction.findUnique({ where: { instructionId: input.instructionId } });
  if (!instruction) return { ok: false, reason: "Settlement instruction not found." };
  if (instruction.ustn !== input.ustn) return { ok: false, reason: "USTN mismatch." };
  if (instruction.status === "SETTLED") return { ok: false, reason: "Already settled." };

  await db.bankSettlementInstruction.update({
    where: { instructionId: input.instructionId },
    data: {
      status: "SETTLED", transactionRef: input.transactionReference,
      settledAt: new Date(input.settledAt), bankBic: input.bankBic,
    },
  });

  return { ok: true };
}

// ============ 7.5.4: Reconciliation Files (MT940, ISO 20022 camt.053) ============
export function generateMt940(instructions: any[], date: string): string {
  let mt940 = `:20:SGTX${date.replace(/-/g, "")}\n:25:SGTX RECONCILIATION\n`;
  for (const inst of instructions) {
    if (inst.status !== "SETTLED") continue;
    const amount = inst.amountUsd.toFixed(2).replace(".", ",");
    mt940 += `:61:${date.slice(2).replace(/-/g, "")}C${amount}NTRF${inst.transactionRef || "NONREF"}\n`;
    mt940 += `:86:USTN ${inst.ustn}\n`;
  }
  mt940 += `:62F:C${instructions.filter(i => i.status === "SETTLED").reduce((s, i) => s + i.amountUsd, 0).toFixed(2).replace(".", ",")}\n-`;
  return mt940;
}

export function generateCamt053(instructions: any[], date: string): string {
  // ISO 20022 camt.053 (Bank to Customer Statement) XML
  const entries = instructions.filter(i => i.status === "SETTLED").map(i => `
    <Ntry>
      <Amt Ccy="${i.currency}">${i.amountUsd.toFixed(2)}</Amt>
      <CdtDbtInd>CRDT</CdtDbtInd>
      <Sts>BOOK</Sts>
      <BookgDt><Dt>${date}</Dt></BookgDt>
      <AcctSvcrRef>${i.transactionRef || "NONREF"}</AcctSvcrRef>
      <NtryDtls><TxDtls><RmtInf><Ustrd>USTN ${i.ustn}</Ustrd></RmtInf></TxDtls></NtryDtls>
    </Ntry>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <Stmt>
      <Id>SGTX${date.replace(/-/g, "")}</Id>
      <ElctrncSeqNb>1</ElctrncSeqNb>
      <CreDtTm>${new Date().toISOString()}</CreDtTm>
      <Acct><Id><IBAN>SGTX0000000000000</IBAN></Id></Acct>
      ${entries}
    </Stmt>
  </BkToCstmrStmt>
</Document>`;
}

// ============ 7.1: One-Click Trigger Map ============
export const TRIGGER_MAP: Record<string, { api: string; endpoint: string; triggerCondition: string; dataSent: string }[]> = {
  "Buyer accepts quote → contract lock": [
    { api: "ETA", endpoint: "POST /einvoice/v1/documents", triggerCondition: "Immediate (no payment)", dataSent: "Invoice XML (UBL 2.1)" },
  ],
  "Seller clicks Pay Stage 1": [
    { api: "CargoX", endpoint: "POST /v3/shipments", triggerCondition: "After PSP webhook confirms split", dataSent: "Shipment envelope" },
    { api: "Nafeza", endpoint: "POST /api/v2/declaration", triggerCondition: "After CargoX ACID received", dataSent: "SAD + certificate requests" },
  ],
  "Lab submits results": [
    { api: "Nafeza", endpoint: "POST /api/v2/declaration/{id}/certificates", triggerCondition: "After lab results are compliant", dataSent: "Certificate request with lab report ref" },
  ],
  "Broker certifies declaration": [
    { api: "Nafeza", endpoint: "PUT /api/v2/declaration/{id}/certify", triggerCondition: "After broker clicks Certify", dataSent: "Broker's digital seal" },
  ],
  "Buyer clicks Settle Payment": [
    { api: "CBE (via PSP or bank)", endpoint: "PSP-specific or MT940/ISO 20022", triggerCondition: "After buyer approves settlement", dataSent: "Payment instruction" },
  ],
};

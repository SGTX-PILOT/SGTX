// SGTX Part 7.5 — Direct Bank Integration (non-custodial settlement).
//
// SGTX is non-custodial: it never holds trade principal or fee funds. Instead,
// it generates settlement instructions (USTN-tagged) for banks to pull via API,
// and accepts payment confirmations from banks when the transfer completes.
//
// This module provides:
//   - listPendingInstructions: banks call this to pull all PENDING settlement
//     instructions for their BIC (Part 7.5.2).
//   - confirmSettlement: banks call this to confirm a settlement was executed
//     (Part 7.5.3). SGTX verifies the instruction exists and matches, then
//     marks it SETTLED.
//   - generateReconciliationFile: banks download daily reconciliation files in
//     MT940, ISO 20022 camt.053, or CSV format (Part 7.5.4). Files are cached
//     in `BankReconciliationFile` with a SHA-256 hash for tamper detection.
//
// All operations log to IntegrationConnectorLog for audit (Part 7.9.3).

import { createHash } from "crypto";
import { db } from "@/lib/db";

// ---------------------------------------------------------------------------
// Helpers
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
  const idempotencyKey = sha256Hex(bodyStr).slice(0, 32);
  const logId = `LOG-${params.connectorName}-${Date.now()}-${idempotencyKey.slice(0, 6)}`;
  try {
    // Part 7.7.4 — idempotent logging (upsert with no-op update on duplicate keys).
    await db.integrationConnectorLog.upsert({
      where: { idempotencyKey },
      create: {
        logId,
        apiName: params.connectorName,
        endpoint: `OUTBOUND ${params.endpoint}`,
        ustn: params.ustn ?? null,
        idempotencyKey,
        requestBody: bodyStr,
        responseBody: respStr,
        statusCode: params.statusCode ?? 200,
        status: params.status ?? "SUCCESS",
        errorMessage: params.errorMessage ?? null,
      },
      update: {},
    });
  } catch (e) {
    console.error(`[bank/logOutbound] failed for ${params.connectorName}:`, e);
  }
}

// ---------------------------------------------------------------------------
// 1. listPendingInstructions (Part 7.5.2) — banks pull PENDING instructions
// ---------------------------------------------------------------------------

export interface SettlementInstruction {
  instruction_id: string;
  ustn: string;
  from_iban: string;
  to_iban: string;
  from_bic: string | null;
  to_bic: string | null;
  amount: number;
  currency: string;
  value_date: string | null;
  reference: string;
  status: string;
  bank_bic: string | null;
}

/**
 * Return all PENDING settlement instructions matching the supplied bank BIC.
 * The bank's BIC is matched against BOTH `fromBic` (debtor bank — buyer's bank,
 * which receives the instruction to debit the buyer) and `bankBic` (explicit
 * bank_bic field set at instruction-creation time).
 *
 * Banks call this once per polling cycle (Part 7.5.2 OneClick for banks).
 */
export async function listPendingInstructions(
  bankBic: string,
  status: string = "PENDING"
): Promise<{ instructions: SettlementInstruction[]; count: number }> {
  const upperBic = bankBic.toUpperCase();
  const rows = await db.bankSettlementInstruction.findMany({
    where: {
      status,
      OR: [{ fromBic: upperBic }, { bankBic: upperBic }],
    },
    orderBy: { createdAt: "asc" },
  });

  const instructions: SettlementInstruction[] = rows.map((r) => ({
    instruction_id: r.instructionId,
    ustn: r.ustn,
    from_iban: r.fromIban,
    to_iban: r.toIban,
    from_bic: r.fromBic,
    to_bic: r.toBic,
    amount: r.amountUsd,
    currency: r.currency,
    value_date: r.valueDate ? r.valueDate.toISOString().slice(0, 10) : null,
    reference: r.reference,
    status: r.status,
    bank_bic: r.bankBic,
  }));

  await logOutbound({
    connectorName: "BANK_PULL_INSTRUCTIONS",
    endpoint: `GET /v1/settlement/instructions?bank_bic=${upperBic}&status=${status}`,
    payload: { bank_bic: upperBic, status },
    response: { count: instructions.length },
    statusCode: 200,
    status: "SUCCESS",
  });

  return { instructions, count: instructions.length };
}

// ---------------------------------------------------------------------------
// 2. confirmSettlement (Part 7.5.3) — bank confirms transfer was executed
// ---------------------------------------------------------------------------

export interface SettlementConfirmation {
  instructionId: string;
  ustn: string;
  amount: number;
  transactionReference: string;
  settledAt: string;
  bankBic: string;
}

/**
 * Bank reports that a settlement was executed. SGTX verifies the instruction
 * exists with matching USTN + amount, then marks it SETTLED with the bank's
 * transaction reference (MT103 / ISO 20022 pacs.008 reference).
 *
 * Part 7.10 GGOV7 — Bank settlement instruction matches open instruction.
 * If the USTN doesn't match an open PENDING instruction, the confirmation is
 * held for manual reconciliation (`status = MANUAL_REVIEW`).
 *
 * SGTX never touches the funds — it only records the confirmation.
 */
export async function confirmSettlement(
  confirmation: SettlementConfirmation
): Promise<{ ok: boolean; instructionId: string; status: string; ustn: string }> {
  const row = await db.bankSettlementInstruction.findUnique({
    where: { instructionId: confirmation.instructionId },
  });

  if (!row) {
    await logOutbound({
      connectorName: "BANK_CONFIRM_SETTLEMENT",
      endpoint: "POST /v1/settlement/confirm",
      ustn: confirmation.ustn,
      payload: confirmation,
      response: { error: "instruction not found" },
      statusCode: 404,
      status: "FAILED",
      errorMessage: `Instruction ${confirmation.instructionId} not found`,
    });
    return { ok: false, instructionId: confirmation.instructionId, status: "NOT_FOUND", ustn: confirmation.ustn };
  }

  // Part 7.10 GGOV7 — instruction must match open instruction
  if (row.ustn !== confirmation.ustn || Math.abs(row.amountUsd - confirmation.amount) > 0.01) {
    // Hold for manual reconciliation
    await db.bankSettlementInstruction.update({
      where: { instructionId: confirmation.instructionId },
      data: {
        status: "MANUAL_REVIEW",
        transactionRef: confirmation.transactionReference,
        bankBic: confirmation.bankBic,
      },
    });
    await logOutbound({
      connectorName: "BANK_CONFIRM_SETTLEMENT",
      endpoint: "POST /v1/settlement/confirm",
      ustn: confirmation.ustn,
      payload: confirmation,
      response: { status: "MANUAL_REVIEW", reason: "ustn or amount mismatch" },
      statusCode: 409,
      status: "MANUAL_REVIEW",
      errorMessage: "USTN or amount mismatch — held for manual reconciliation (GGOV7)",
    });
    return { ok: false, instructionId: confirmation.instructionId, status: "MANUAL_REVIEW", ustn: confirmation.ustn };
  }

  const settledAt = new Date(confirmation.settledAt);
  await db.bankSettlementInstruction.update({
    where: { instructionId: confirmation.instructionId },
    data: {
      status: "SETTLED",
      transactionRef: confirmation.transactionReference,
      bankBic: confirmation.bankBic,
      settledAt,
    },
  });

  await logOutbound({
    connectorName: "BANK_CONFIRM_SETTLEMENT",
    endpoint: "POST /v1/settlement/confirm",
    ustn: confirmation.ustn,
    payload: confirmation,
    response: { status: "SETTLED", settledAt: settledAt.toISOString() },
    statusCode: 200,
    status: "SUCCESS",
  });

  return { ok: true, instructionId: confirmation.instructionId, status: "SETTLED", ustn: confirmation.ustn };
}

// ---------------------------------------------------------------------------
// 3. generateReconciliationFile (Part 7.5.4) — MT940 / ISO 20022 camt.053 / CSV
// ---------------------------------------------------------------------------

export type ReconciliationFormat = "MT940" | "CAMT_053" | "CSV";

/** Format a Date as YYYY-MM-DD. */
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Format a Date as YYMMDD for MT940. */
function mt940Date(d: Date): string {
  return d.toISOString().slice(2, 10).replace(/-/g, "");
}

/** Format an amount with 2 decimal places, comma-separated for MT940. */
function mt940Amount(amount: number): string {
  return amount.toFixed(2).replace(".", ",");
}

/**
 * Generate an MT940 (SWIFT Customer Statement Message) reconciliation file for
 * the given bank BIC + date. Contains all SETTLED instructions for that date
 * with USTN as the customer reference (Part 7.5.4).
 *
 * MT940 structure: :20: (transaction ref), :25: (account), :28C: (statement
 * number), :60F: (opening balance), :61: (statement line per transaction),
 * :86: (transaction details — USTN reference), :62F: (closing balance).
 */
function formatMt940(rows: Array<{
  instructionId: string;
  ustn: string;
  fromIban: string;
  toIban: string;
  amountUsd: number;
  currency: string;
  reference: string;
  transactionRef: string | null;
  settledAt: Date | null;
}>, bankBic: string, date: Date): string {
  const dateStr = mt940Date(date);
  const account = `BANK/${bankBic}`;
  const totalAmount = rows.reduce((sum, r) => sum + r.amountUsd, 0);

  let out = "";
  out += `:20:SGTX-${dateStr}\r\n`;
  out += `:25:${account}\r\n`;
  out += `:28C:1\r\n`;
  // Opening balance (always 0 since SGTX is non-custodial — this is a
  // reconciliation statement, not a real account ledger).
  out += `:60F:C${dateStr}USD0,00\r\n`;

  for (const r of rows) {
    const settledDate = r.settledAt ? mt940Date(r.settledAt) : dateStr;
    const txRef = (r.transactionRef ?? r.instructionId).replace(/[^A-Za-z0-9-]/g, "").slice(0, 16);
    // :61: statement line: Date, Amount, Transaction type (NTRF = non-trade
    // related funds transfer credit), Customer reference.
    out += `:61:${settledDate}${mt940Amount(r.amountUsd)}NTRFNONREF\r\n`;
    // :86: information-to-owner — contains the USTN reference (bank's customer
    // can match the payment back to the SGTX trade).
    out += `:86:SGTX USTN ${r.ustn} REF ${txRef}\r\n`;
  }

  // Closing balance = sum of all settlements
  out += `:62F:C${dateStr}USD${mt940Amount(totalAmount)}\r\n`;
  out += `-`;
  return out;
}

/**
 * Generate an ISO 20022 camt.053 (Bank-to-Customer Statement) reconciliation
 * file in XML format (Part 7.5.4). Contains all SETTLED instructions for the
 * given bank BIC + date.
 */
function formatCamt053(rows: Array<{
  instructionId: string;
  ustn: string;
  fromIban: string;
  toIban: string;
  amountUsd: number;
  currency: string;
  reference: string;
  transactionRef: string | null;
  settledAt: Date | null;
}>, bankBic: string, date: Date): string {
  const dateStr = ymd(date);
  const totalAmount = rows.reduce((sum, r) => sum + r.amountUsd, 0);
  const msgId = `SGTX-CAMT053-${bankBic}-${dateStr}`;

  const entriesXml = rows.map((r, i) => {
    const settledDate = r.settledAt ? ymd(r.settledAt) : dateStr;
    const txRef = (r.transactionRef ?? r.instructionId).replace(/[<>&"']/g, "");
    return `    <Ntry>
      <NtryDtls>
        <TxDtls>
          <Refs>
            <EndToEndId>${r.ustn}</EndToEndId>
            <TxId>${txRef}</TxId>
          </Refs>
          <Amt Ccy="${r.currency}">${r.amountUsd.toFixed(2)}</Amt>
          <CdtDbtInd>CRDT</CdtDbtInd>
          <RltdPties>
            <CdtrAcct>
              <Id>
                <IBAN>${r.toIban}</IBAN>
              </Id>
            </CdtrAcct>
          </RltdPties>
          <RmtInf>
            <Ustrd>SGTX USTN ${r.ustn}</Ustrd>
          </RmtInf>
        </TxDtls>
      </NtryDtls>
      <Sts>BOOKED</Sts>
      <BookgDt>
        <Dt>${settledDate}</Dt>
      </BookgDt>
      <ValDt>
        <Dt>${settledDate}</Dt>
      </ValDt>
      <Amt Ccy="USD">${r.amountUsd.toFixed(2)}</Amt>
      <CdtDbtInd>CRDT</CdtDbtInd>
      <NtryRef>${r.instructionId}</NtryRef>
      <AcctSvcrRef>SGTX-${i + 1}</AcctSvcrRef>
    </Ntry>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${new Date().toISOString()}</CreDtTm>
      <MsgRcpt>
        <Id>
          <OrgId>
            <BICOrBEI>${bankBic}</BICOrBEI>
          </OrgId>
        </Id>
      </MsgRcpt>
    </GrpHdr>
    <Stmt>
      <Id>${msgId}</Id>
      <CreDtTm>${new Date().toISOString()}</CreDtTm>
      <Acct>
        <Id>
          <Othr>
            <Id>BANK/${bankBic}</Id>
          </Othr>
        </Id>
        <Ccy>USD</Ccy>
      </Acct>
      <Bal>
        <Tp>
          <CdOrPrtry>
            <Cd>OPBD</CdOrPrtry>
          </CdOrPrtry>
        </Tp>
        <Amt Ccy="USD">0.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Dt>
          <Dt>${dateStr}</Dt>
        </Dt>
      </Bal>
      <Bal>
        <Tp>
          <CdOrPrtry>
            <Cd>CLBD</CdOrPrtry>
          </CdOrPrtry>
        </Tp>
        <Amt Ccy="USD">${totalAmount.toFixed(2)}</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Dt>
          <Dt>${dateStr}</Dt>
        </Dt>
      </Bal>
${entriesXml}
    </Stmt>
  </BkToCstmrStmt>
</Document>`;
}

/**
 * Generate a CSV reconciliation file (header + one row per settled instruction).
 */
function formatCsv(rows: Array<{
  instructionId: string;
  ustn: string;
  fromIban: string;
  toIban: string;
  amountUsd: number;
  currency: string;
  reference: string;
  transactionRef: string | null;
  settledAt: Date | null;
}>, bankBic: string, date: Date): string {
  const dateStr = ymd(date);
  let out = `instruction_id,ustn,from_iban,to_iban,amount,currency,value_date,reference,transaction_ref,bank_bic\r\n`;
  for (const r of rows) {
    const settledDate = r.settledAt ? ymd(r.settledAt) : dateStr;
    const fields = [
      r.instructionId,
      r.ustn,
      r.fromIban,
      r.toIban,
      r.amountUsd.toFixed(2),
      r.currency,
      settledDate,
      r.reference,
      r.transactionRef ?? "",
      bankBic,
    ].map((f) => {
      const s = String(f ?? "");
      return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    });
    out += fields.join(",") + "\r\n";
  }
  return out;
}

/**
 * Generate + persist a reconciliation file for the given bank BIC + date.
 * Returns the file content + SHA-256 hash. Subsequent calls return the cached
 * row if the underlying settlements haven't changed.
 *
 * Part 7.5.4: banks call this once per day to download the day's reconciliation
 * file. The file is also persisted to `BankReconciliationFile` for audit
 * (retention 7 years per Part 7.9.3).
 */
export async function generateReconciliationFile(
  bankBic: string,
  date: Date,
  format: ReconciliationFormat
): Promise<{
  fileContent: string;
  fileHash: string;
  settlementCount: number;
  totalAmountUsd: number;
  fileId: string;
}> {
  const upperBic = bankBic.toUpperCase();
  const dateStart = new Date(date);
  dateStart.setUTCHours(0, 0, 0, 0);
  const dateEnd = new Date(dateStart);
  dateEnd.setUTCDate(dateEnd.getUTCDate() + 1);

  // Pull all SETTLED instructions for this bank + date window.
  const rows = await db.bankSettlementInstruction.findMany({
    where: {
      status: "SETTLED",
      OR: [{ fromBic: upperBic }, { bankBic: upperBic }],
      settledAt: { gte: dateStart, lt: dateEnd },
    },
    orderBy: { settledAt: "asc" },
  });

  let fileContent: string;
  switch (format) {
    case "MT940":
      fileContent = formatMt940(rows, upperBic, date);
      break;
    case "CAMT_053":
      fileContent = formatCamt053(rows, upperBic, date);
      break;
    case "CSV":
      fileContent = formatCsv(rows, upperBic, date);
      break;
    default:
      throw new Error(`Unsupported reconciliation format: ${format}`);
  }

  const fileHash = sha256Hex(fileContent);
  const totalAmountUsd = rows.reduce((sum, r) => sum + r.amountUsd, 0);

  // Persist (idempotent — if a file with the same hash already exists for this
  // bank+date+format, return the existing row).
  const existing = await db.bankReconciliationFile.findFirst({
    where: { bankBic: upperBic, fileDate: dateStart, format, fileHash },
  });
  let fileId: string;
  if (existing) {
    fileId = existing.id;
  } else {
    const created = await db.bankReconciliationFile.create({
      data: {
        bankBic: upperBic,
        fileDate: dateStart,
        format,
        fileContent,
        fileHash,
        settlementCount: rows.length,
        totalAmountUsd,
      },
    });
    fileId = created.id;
  }

  await logOutbound({
    connectorName: "BANK_RECONCILIATION_FILE",
    endpoint: `GET /v1/settlement/reconciliation?bank_bic=${upperBic}&date=${ymd(date)}&format=${format}`,
    payload: { bank_bic: upperBic, date: ymd(date), format },
    response: { fileId, settlementCount: rows.length, totalAmountUsd, fileHash },
    statusCode: 200,
    status: "SUCCESS",
  });

  return {
    fileContent,
    fileHash,
    settlementCount: rows.length,
    totalAmountUsd,
    fileId,
  };
}

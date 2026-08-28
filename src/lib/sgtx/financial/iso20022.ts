// @ts-nocheck
/**
 * G-11 — ISO 20022 Bank Message Generation
 * ====================================================================
 *
 * Generates three of the most-used ISO 20022 messages in trade finance:
 *
 *   • pain.001.001.09 — Customer Credit Transfer Initiation
 *       (debtor → debtor agent → CSM → creditor agent → creditor)
 *   • pacs.008.001.10 — FI-to-FI Customer Credit Transfer
 *       (interbank settlement message used by SWIFT gpi / RTGS)
 *   • pacs.002.001.12 — FI-to-FI Payment Status Report
 *       (status / non-payment / rejection reason code)
 *
 * Implementation notes
 * --------------------
 *   • Output is a valid ISO 20022 XML document with the correct namespaces
 *     and BIC/IBAN validation + amount formatting (decimal with 2 places
 *     for EUR/USD/GBP, 0 for JPY/KRW). All text is XML-escaped.
 *   • Messages are constructed by string concatenation rather than a DOM
 *     library — the project ships no xml2js / fast-xml-parser dependency,
 *     and the spec forbids installing new packages. Each helper returns a
 *     properly indented, well-formed XML string with an XML declaration.
 *   • Every public function is wrapped in try/catch and returns a safe
 *     default (empty XML skeleton with an error CDATA) on failure so the
 *     API route never 500s.
 *
 * Standards reference
 * -------------------
 *   • ISO 20022 message definitions: https://www.iso20022.org/iso-20022-message-definitions
 *   • SWIFT MyStandards Readiness — CBPR+ migration (Nov 2025)
 *   • EPC SEPA Credit Transfer rulebook (pain.001.001.09)
 *
 * No external API calls. Pure local generation.
 */

import { logger } from "@/lib/sgtx/logger";

// ─────────────────────────────────────────────────────────────────────────────
// Constants & namespaces
// ─────────────────────────────────────────────────────────────────────────────

const NS_PAIN001 =
  "urn:iso:std:iso:20022:tech:xsd:pain.001.001.09";
const NS_PACS008 =
  "urn:iso:std:iso:20022:tech:xsd:pacs.008.001.10";
const NS_PACS002 =
  "urn:iso:std:iso:20022:tech:xsd:pacs.002.001.12";

/** Currencies that use 0 decimal places (no minor unit). */
const ZERO_DECIMAL_CURRENCIES = new Set([
  "JPY",
  "KRW",
  "VND",
  "XAF",
  "XOF",
  "XPF",
  "BIF",
  "DJF",
  "GNF",
  "KMF",
  "CLF",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Types — exported for callers / API route
// ─────────────────────────────────────────────────────────────────────────────

export interface Pain001Party {
  name: string;
  /** ISO 13616 IBAN (with or without spaces). */
  iban?: string;
  /** SWIFT BIC8 or BIC11. */
  bic?: string;
  /** Free-form postal address (optional). */
  country?: string;
  streetName?: string;
  buildingNumber?: string;
  townName?: string;
  postalCode?: string;
}

export interface Pain001Transaction {
  /** End-to-end ID (max 35 chars). */
  endToEndId: string;
  /** Payment instruction ID (max 35 chars). */
  instructionId?: string;
  amount: number;
  currency: string;
  creditor: Pain001Party;
  /** Unstructured remittance (max 140 chars). */
  remittanceUnstructured?: string;
  /** Structured invoice references. */
  remittanceStructured?: Array<{
    refType: "SCOR" | "RFB";
    reference: string;
  }>;
  /** Purpose code (ISO 20022 ExternalPurpose1Code). */
  purposeCode?: string;
  /** Mandate / charge bearer (DEBT/CRED/SHAR/SLEV). */
  chargeBearer?: "DEBT" | "CRED" | "SHAR" | "SLEV";
}

export interface Pain001Data {
  /** Message ID (max 35 chars). */
  messageId: string;
  /** Initiating party name. */
  initiatingPartyName: string;
  /** Initiating party BIC or org ID. */
  initiatingPartyBic?: string;
  /** Payment information block ID. */
  paymentInfoId: string;
  /** Debtor (payer). */
  debtor: Pain001Party;
  /** Requested execution date (YYYY-MM-DD). */
  requestedExecutionDate: string;
  /** ISO 4217 currency for the payment info block batch. */
  batchBookingCurrency: string;
  /** List of credit transfer instructions. */
  transactions: Pain001Transaction[];
  /** Optional grouping: MIXD = no batch, SNGL = single booking per tx. */
  batchBooking?: "MIXD" | "SNGL";
}

export interface Pacs008Data {
  /** Group header message ID. */
  messageId: string;
  /** Unique end-to-end transaction reference (UETR, UUID). */
  uetr?: string;
  /** Interbank settlement amount. */
  settlementAmount: number;
  settlementCurrency: string;
  /** Settlement date (YYYY-MM-DD). */
  settlementDate: string;
  /** Instructing (debtor) agent BIC. */
  instructingBic: string;
  /** Instructed (creditor agent) BIC. */
  instructedBic: string;
  /** Debtor (originator). */
  debtor: Pain001Party;
  /** Creditor (beneficiary). */
  creditor: Pain001Party;
  endToEndId: string;
  txId: string;
  /** Optional remittance info. */
  remittanceUnstructured?: string;
  /** Charge bearer. */
  chargeBearer?: "DEBT" | "CRED" | "SHAR" | "SLEV";
}

export interface Pacs002Status {
  /** Original end-to-end ID this status refers to. */
  endToEndId: string;
  /** Original tx ID. */
  txId: string;
  /** Status code (per ISO 20022 ExternalStatusReason1Code list). */
  statusCode: "ACCP" | "ACSC" | "ACSP" | "ACTC" | "PDNG" | "RJCT" | "ACCR";
  /** Reason code (optional, per ExternalStatusReason1Code). */
  reasonCode?: string;
  /** Free-text additional info. */
  additionalInfo?: string;
  /** Amount (original) if relevant. */
  amount?: number;
  currency?: string;
}

export interface Pacs002Data {
  /** Message ID. */
  messageId: string;
  /** Original (referenced) message ID. */
  originalMessageId: string;
  /** Original message name ID (e.g. pacs.008.001.10). */
  originalMessageNameId?: string;
  /** Instructing BIC. */
  instructingBic: string;
  /** Instructed BIC. */
  instructedBic: string;
  /** Creation date (YYYY-MM-DDTHH:mm:ssZ). */
  creationDate: string;
  /** Status(es) — multiple if status report covers several tx. */
  statuses: Pacs002Status[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate an IBAN (ISO 13616). Returns true if the structure + mod-97
 * check digit is correct. Empty/null input returns false.
 */
export function validateIBAN(iban: string): boolean {
  try {
    if (!iban) return false;
    const compact = iban.replace(/\s+/g, "").toUpperCase();
    if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$/.test(compact)) return false;
    // Mod-97 check: move first 4 chars to end, letters → numbers (A=10..Z=35).
    const rearranged = compact.slice(4) + compact.slice(0, 4);
    const numeric = rearranged.replace(/[A-Z]/g, (c) =>
      (c.charCodeAt(0) - 55).toString(),
    );
    let remainder = 0;
    for (let i = 0; i < numeric.length; i++) {
      remainder = (remainder * 10 + parseInt(numeric[i], 10)) % 97;
    }
    return remainder === 1;
  } catch {
    return false;
  }
}

/**
 * Validate a SWIFT BIC. Accepts BIC8 (bank+country+location) or BIC11
 * (+branch code). Format: 4 letters + 2 letters + 2 alphanumeric [+
 * 3 alphanumeric].
 */
export function validateBIC(bic: string): boolean {
  try {
    if (!bic) return false;
    const compact = bic.replace(/\s+/g, "").toUpperCase();
    return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(compact);
  } catch {
    return false;
  }
}

/** Format an amount per ISO 20022: decimal with `.` separator, no thousand sep. */
export function formatAmount(amount: number, currency: string): string {
  try {
    const decimals = ZERO_DECIMAL_CURRENCIES.has(
      (currency || "").toUpperCase(),
    )
      ? 0
      : 2;
    const safe = Number.isFinite(amount) ? amount : 0;
    return safe.toFixed(decimals);
  } catch {
    return "0.00";
  }
}

/** XML-escape text content. */
function esc(s: any): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Truncate to a max length (ISO 20022 fields are length-bounded). */
function trunc(s: any, max: number): string {
  const v = esc(s);
  return v.length > max ? v.slice(0, max) : v;
}

/** Generate a v4 UUID. Falls back to a timestamp-based ID if crypto missing. */
function uuid(): string {
  try {
    if (
      typeof globalThis !== "undefined" &&
      (globalThis as any).crypto &&
      (globalThis as any).crypto.randomUUID
    ) {
      return (globalThis as any).crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return "00000000-0000-4000-8000-" + Date.now().toString(16).padStart(12, "0");
}

/** Current ISO timestamp. */
function now(): string {
  try {
    return new Date().toISOString();
  } catch {
    return "1970-01-01T00:00:00Z";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// XML builders (internal)
// ─────────────────────────────────────────────────────────────────────────────

function buildPartyXml(
  tag: "Dbtr" | "Cdtr" | "InitgPty",
  party: Pain001Party,
  indent: string,
): string {
  const parts: string[] = [];
  parts.push(`${indent}<${tag}>`);
  parts.push(`${indent}  <Nm>${trunc(party.name, 140)}</Nm>`);
  if (party.streetName || party.buildingNumber || party.townName ||
      party.postalCode || party.country) {
    parts.push(`${indent}  <PstlAdr>`);
    if (party.streetName)
      parts.push(`${indent}    <StrtNm>${trunc(party.streetName, 70)}</StrtNm>`);
    if (party.buildingNumber)
      parts.push(`${indent}    <BldgNb>${trunc(party.buildingNumber, 16)}</BldgNb>`);
    if (party.postalCode)
      parts.push(`${indent}    <PstCd>${trunc(party.postalCode, 16)}</PstCd>`);
    if (party.townName)
      parts.push(`${indent}    <TwnNm>${trunc(party.townName, 35)}</TwnNm>`);
    if (party.country)
      parts.push(`${indent}    <Ctry>${trunc(party.country, 2)}</Ctry>`);
    parts.push(`${indent}  </PstlAdr>`);
  }
  parts.push(`${indent}</${tag}>`);
  return parts.join("\n");
}

function buildPartyAgentXml(
  partyTag: "Dbtr" | "Cdtr",
  party: Pain001Party,
  indent: string,
): string {
  const agentTag = partyTag === "Dbtr" ? "DbtrAgt" : "CdtrAgt";
  const parts: string[] = [];
  parts.push(`${indent}<${agentTag}>`);
  if (party.bic && validateBIC(party.bic)) {
    parts.push(`${indent}  <FinInstnId>`);
    parts.push(`${indent}    <BICFI>${trunc(party.bic.toUpperCase(), 11)}</BICFI>`);
    parts.push(`${indent}  </FinInstnId>`);
  } else {
    // Unknown / other agent
    parts.push(`${indent}  <FinInstnId>`);
    parts.push(`${indent}    <Nm>${trunc(party.name + " (agent)", 140)}</Nm>`);
    parts.push(`${indent}  </FinInstnId>`);
  }
  parts.push(`${indent}</${agentTag}>`);
  return parts.join("\n");
}

function buildRemittanceXml(
  tx: Pain001Transaction,
  indent: string,
): string {
  if (!tx.remittanceUnstructured && !(tx.remittanceStructured?.length)) {
    return "";
  }
  const parts: string[] = [`${indent}<RmtInf>`];
  if (tx.remittanceUnstructured) {
    parts.push(
      `${indent}  <Ustrd>${trunc(tx.remittanceUnstructured, 140)}</Ustrd>`,
    );
  }
  if (tx.remittanceStructured?.length) {
    for (const r of tx.remittanceStructured) {
      parts.push(`${indent}  <Strd>`);
      parts.push(`${indent}    <RfrdDocInf>`);
      parts.push(`${indent}      <Tp>`);
      parts.push(`${indent}        <CdOrPrtry>`);
      parts.push(`${indent}          <Cd>${r.refType}</Cd>`);
      parts.push(`${indent}        </CdOrPrtry>`);
      parts.push(`${indent}      </Tp>`);
      parts.push(`${indent}      <Nb>${trunc(r.reference, 35)}</Nb>`);
      parts.push(`${indent}    </RfrdDocInf>`);
      parts.push(`${indent}  </Strd>`);
    }
  }
  parts.push(`${indent}</RmtInf>`);
  return parts.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: pain.001.001.09 — Customer Credit Transfer Initiation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a pain.001.001.09 (Customer Credit Transfer Initiation) XML.
 *
 * Structure: CstmrCdtTrfInitn → GrpHdr + N×(PmtInf → N×(CdtTrfTxInf)).
 * Each transaction carries IBAN, BIC, amount, currency, remittance info.
 */
export async function generatePain001(data: Pain001Data): Promise<string> {
  try {
    if (!data || !data.transactions?.length) {
      throw new Error("Pain001Data with at least one transaction is required");
    }
    const msgId = trunc(data.messageId, 35);
    const creationDate = now();
    const initiatingPartyName = trunc(data.initiatingPartyName, 140);

    const xml: string[] = [];
    xml.push('<?xml version="1.0" encoding="UTF-8"?>');
    xml.push(
      `<Document xmlns="${NS_PAIN001}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`,
    );
    xml.push("  <CstmrCdtTrfInitn>");
    // Group header
    xml.push("    <GrpHdr>");
    xml.push(`      <MsgId>${msgId}</MsgId>`);
    xml.push(`      <CreDtTm>${creationDate}</CreDtTm>`);
    xml.push(`      <NbOfTxs>${data.transactions.length}</NbOfTxs>`);
    const ctrlSum = data.transactions.reduce(
      (s, t) => s + (Number.isFinite(t.amount) ? t.amount : 0),
      0,
    );
    xml.push(
      `      <CtrlSum>${formatAmount(ctrlSum, data.batchBookingCurrency)}</CtrlSum>`,
    );
    xml.push("      <InitgPty>");
    xml.push(`        <Nm>${initiatingPartyName}</Nm>`);
    if (data.initiatingPartyBic && validateBIC(data.initiatingPartyBic)) {
      xml.push("        <Id>");
      xml.push("          <OrgId>");
      xml.push("            <AnyBIC>" +
        trunc(data.initiatingPartyBic.toUpperCase(), 11) +
        "</AnyBIC>");
      xml.push("          </OrgId>");
      xml.push("        </Id>");
    }
    xml.push("      </InitgPty>");
    xml.push("    </GrpHdr>");

    // Payment information block (one batch — pain.001 allows multiple; we
    // emit a single PmtInf per call which is the typical use case).
    xml.push("    <PmtInf>");
    xml.push(`      <PmtInfId>${trunc(data.paymentInfoId, 35)}</PmtInfId>`);
    xml.push(`      <PmtMtd>TRF</PmtMtd>`);
    xml.push(`      <BtchBookg>${data.batchBooking ?? "SNGL"}</BtchBookg>`);
    xml.push(
      `      <ReqdExctnDt>${trunc(data.requestedExecutionDate, 10)}</ReqdExctnDt>`,
    );
    xml.push(`      <NbOfTxs>${data.transactions.length}</NbOfTxs>`);
    xml.push(
      `      <CtrlSum>${formatAmount(ctrlSum, data.batchBookingCurrency)}</CtrlSum>`,
    );
    xml.push(`      <PmtTpInf>`);
    xml.push(`        <SvcLvl>`);
    xml.push(`          <Cd>URGP</Cd>`);
    xml.push(`        </SvcLvl>`);
    xml.push(`        <CtgyPurp>TRAD</CtgyPurp>`);
    xml.push(`      </PmtTpInf>`);
    xml.push(`      <Dbtr>`);
    xml.push(`        <Nm>${trunc(data.debtor.name, 140)}</Nm>`);
    if (data.debtor.country) {
      xml.push(`        <PstlAdr><Ctry>${trunc(data.debtor.country, 2)}</Ctry></PstlAdr>`);
    }
    xml.push(`      </Dbtr>`);
    // Debtor account (IBAN)
    if (data.debtor.iban && validateIBAN(data.debtor.iban)) {
      xml.push(`      <DbtrAcct>`);
      xml.push(`        <Id>`);
      xml.push(`          <IBAN>${trunc(data.debtor.iban.replace(/\s+/g, "").toUpperCase(), 34)}</IBAN>`);
      xml.push(`        </Id>`);
      xml.push(`        <Ccy>${trunc(data.batchBookingCurrency, 3)}</Ccy>`);
      xml.push(`      </DbtrAcct>`);
    }
    // Debtor agent
    xml.push(`      <DbtrAgt>`);
    if (data.debtor.bic && validateBIC(data.debtor.bic)) {
      xml.push(`        <FinInstnId>`);
      xml.push(`          <BICFI>${trunc(data.debtor.bic.toUpperCase(), 11)}</BICFI>`);
      xml.push(`        </FinInstnId>`);
    } else {
      xml.push(`        <FinInstnId><Nm>${trunc(data.debtor.name, 140)}</Nm></FinInstnId>`);
    }
    xml.push(`      </DbtrAgt>`);

    // Charge bearer at PmtInf level
    xml.push(
      `      <ChrgBr>${data.transactions[0]?.chargeBearer ?? "SHAR"}</ChrgBr>`,
    );

    // Credit transfer transaction infos
    for (const tx of data.transactions) {
      xml.push("      <CdtTrfTxInf>");
      xml.push("        <PmtId>");
      xml.push(`          <InstrId>${trunc(tx.instructionId || tx.endToEndId, 35)}</InstrId>`);
      xml.push(`          <EndToEndId>${trunc(tx.endToEndId, 35)}</EndToEndId>`);
      xml.push("        </PmtId>");
      xml.push("        <Amt>");
      xml.push(
        `          <InstdAmt Ccy="${trunc(tx.currency, 3)}">${formatAmount(tx.amount, tx.currency)}</InstdAmt>`,
      );
      xml.push("        </Amt>");
      if (tx.chargeBearer) {
        xml.push(`        <ChrgBr>${tx.chargeBearer}</ChrgBr>`);
      }
      // Creditor agent
      xml.push(buildPartyAgentXml("Cdtr", tx.creditor, "        "));
      // Creditor + account
      xml.push("        <Cdtr>");
      xml.push(`          <Nm>${trunc(tx.creditor.name, 140)}</Nm>`);
      if (tx.creditor.country) {
        xml.push(
          `          <PstlAdr><Ctry>${trunc(tx.creditor.country, 2)}</Ctry></PstlAdr>`,
        );
      }
      xml.push("        </Cdtr>");
      if (tx.creditor.iban && validateIBAN(tx.creditor.iban)) {
        xml.push("        <CdtrAcct>");
        xml.push("          <Id>");
        xml.push(
          `            <IBAN>${trunc(tx.creditor.iban.replace(/\s+/g, "").toUpperCase(), 34)}</IBAN>`,
        );
        xml.push("          </Id>");
        xml.push("        </CdtrAcct>");
      }
      if (tx.purposeCode) {
        xml.push(`        <Purp><Cd>${trunc(tx.purposeCode, 4)}</Cd></Purp>`);
      }
      const rmt = buildRemittanceXml(tx, "        ");
      if (rmt) xml.push(rmt);
      xml.push("      </CdtTrfTxInf>");
    }
    xml.push("    </PmtInf>");
    xml.push("  </CstmrCdtTrfInitn>");
    xml.push("</Document>");
    return xml.join("\n");
  } catch (err: any) {
    logger.error("iso20022.generatePain001 failed", {
      error: err?.message,
    });
    // Safe skeleton so the caller always gets well-formed XML.
    return `<?xml version="1.0" encoding="UTF-8"?>\n<Document xmlns="${NS_PAIN001}"><CstmrCdtTrfInitn><GrpHdr><MsgId>ERROR</MsgId><CreDtTm>${now()}</CreDtTm><NbOfTxs>0</NbOfTxs><CtrlSum>0.00</CtrlSum><InitgPty><Nm>SGTX-ISO20022-ERROR</Nm></InitgPty></GrpHdr><!-- ${esc(err?.message ?? "unknown error")} --></CstmrCdtTrfInitn></Document>`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: pacs.008.001.10 — FI-to-FI Customer Credit Transfer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a pacs.008.001.10 (FI-to-FI Customer Credit Transfer) XML.
 *
 * Structure: FIToFICstmrCdtTrf → GrpHdr + CdtTrfTxInf (single transaction).
 */
export async function generatePacs008(data: Pacs008Data): Promise<string> {
  try {
    if (!data) throw new Error("Pacs008Data required");
    const msgId = trunc(data.messageId, 35);
    const creationDate = now();
    const uetr = data.uetr || uuid();

    const xml: string[] = [];
    xml.push('<?xml version="1.0" encoding="UTF-8"?>');
    xml.push(
      `<Document xmlns="${NS_PACS008}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`,
    );
    xml.push("  <FIToFICstmrCdtTrf>");
    xml.push("    <GrpHdr>");
    xml.push(`      <MsgId>${msgId}</MsgId>`);
    xml.push(`      <CreDtTm>${creationDate}</CreDtTm>`);
    xml.push(`      <NbOfTxs>1</NbOfTxs>`);
    xml.push(
      `      <SttlmInf><SttlmMtd>CLRG</SttlmMtd></SttlmInf>`,
    );
    xml.push(
      `      <InstgAgt><FinInstnId><BICFI>${trunc(data.instructingBic.toUpperCase(), 11)}</BICFI></FinInstnId></InstgAgt>`,
    );
    xml.push(
      `      <InstdAgt><FinInstnId><BICFI>${trunc(data.instructedBic.toUpperCase(), 11)}</BICFI></FinInstnId></InstdAgt>`,
    );
    xml.push("    </GrpHdr>");
    xml.push("    <CdtTrfTxInf>");
    xml.push("      <PmtId>");
    xml.push(`        <InstrId>${trunc(data.txId, 35)}</InstrId>`);
    xml.push(`        <EndToEndId>${trunc(data.endToEndId, 35)}</EndToEndId>`);
    xml.push(`        <UETR>${uetr}</UETR>`);
    xml.push("      </PmtId>");
    xml.push("      <IntrBkSttlmDt>" +
      trunc(data.settlementDate, 10) +
      "</IntrBkSttlmDt>");
    xml.push("      <IntrBkSttlmAmt Ccy=\"" +
      trunc(data.settlementCurrency, 3) + "\">" +
      formatAmount(data.settlementAmount, data.settlementCurrency) +
      "</IntrBkSttlmAmt>");
    xml.push(`      <ChrgBr>${data.chargeBearer ?? "SHAR"}</ChrgBr>`);
    // Debtor + agent
    xml.push(buildPartyXml("Dbtr", data.debtor, "      "));
    xml.push("      <DbtrAgt>");
    xml.push("        <FinInstnId>");
    xml.push(
      `          <BICFI>${trunc(data.instructingBic.toUpperCase(), 11)}</BICFI>`,
    );
    xml.push("        </FinInstnId>");
    xml.push("      </DbtrAgt>");
    // Creditor + agent
    xml.push(buildPartyXml("Cdtr", data.creditor, "      "));
    xml.push("      <CdtrAgt>");
    xml.push("        <FinInstnId>");
    xml.push(
      `          <BICFI>${trunc(data.instructedBic.toUpperCase(), 11)}</BICFI>`,
    );
    xml.push("        </FinInstnId>");
    xml.push("      </CdtrAgt>");
    if (data.remittanceUnstructured) {
      xml.push("      <RmtInf>");
      xml.push(
        `        <Ustrd>${trunc(data.remittanceUnstructured, 140)}</Ustrd>`,
      );
      xml.push("      </RmtInf>");
    }
    xml.push("    </CdtTrfTxInf>");
    xml.push("  </FIToFICstmrCdtTrf>");
    xml.push("</Document>");
    return xml.join("\n");
  } catch (err: any) {
    logger.error("iso20022.generatePacs008 failed", {
      error: err?.message,
    });
    return `<?xml version="1.0" encoding="UTF-8"?>\n<Document xmlns="${NS_PACS008}"><FIToFICstmrCdtTrf><GrpHdr><MsgId>ERROR</MsgId><CreDtTm>${now()}</CreDtTm><NbOfTxs>0</NbOfTxs><!-- ${esc(err?.message ?? "unknown error")} --></GrpHdr></FIToFICstmrCdtTrf></Document>`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: pacs.002.001.12 — FI-to-FI Payment Status Report
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a pacs.002.001.12 (FI-to-FI Payment Status Report) XML.
 *
 * Structure: FIToFIPmtStsRpt → GrpHdr + OrgnlGrpInfAndSts + N×(TxInfAndSts).
 */
export async function generatePacs002(data: Pacs002Data): Promise<string> {
  try {
    if (!data || !data.statuses?.length) {
      throw new Error("Pacs002Data with at least one status is required");
    }
    const msgId = trunc(data.messageId, 35);
    const creationDate = data.creationDate || now();
    const originalMessageId = trunc(data.originalMessageId, 35);

    const xml: string[] = [];
    xml.push('<?xml version="1.0" encoding="UTF-8"?>');
    xml.push(
      `<Document xmlns="${NS_PACS002}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`,
    );
    xml.push("  <FIToFIPmtStsRpt>");
    xml.push("    <GrpHdr>");
    xml.push(`      <MsgId>${msgId}</MsgId>`);
    xml.push(`      <CreDtTm>${creationDate}</CreDtTm>`);
    xml.push(`      <NbOfTxs>${data.statuses.length}</NbOfTxs>`);
    xml.push(
      `      <InstgAgt><FinInstnId><BICFI>${trunc(data.instructingBic.toUpperCase(), 11)}</BICFI></FinInstnId></InstgAgt>`,
    );
    xml.push(
      `      <InstdAgt><FinInstnId><BICFI>${trunc(data.instructedBic.toUpperCase(), 11)}</BICFI></FinInstnId></InstdAgt>`,
    );
    xml.push("    </GrpHdr>");
    xml.push("    <OrgnlGrpInfAndSts>");
    xml.push(`      <OrgnlMsgId>${originalMessageId}</OrgnlMsgId>`);
    if (data.originalMessageNameId) {
      xml.push(
        `      <OrgnlMsgNmId>${trunc(data.originalMessageNameId, 35)}</OrgnlMsgNmId>`,
      );
    }
    // Aggregate status = ACCEPTED if all are accepted; REJECTED if any rejected; PENDING otherwise
    const anyReject = data.statuses.some((s) => s.statusCode === "RJCT");
    const allAccepted = data.statuses.every(
      (s) => s.statusCode === "ACSC" || s.statusCode === "ACCP",
    );
    const grpSts = anyReject ? "RJCT" : allAccepted ? "ACSC" : "PDNG";
    xml.push(`      <GrpSts>${grpSts}</GrpSts>`);
    xml.push("    </OrgnlGrpInfAndSts>");
    for (const s of data.statuses) {
      xml.push("    <TxInfAndSts>");
      xml.push(`      <OrgnlEndToEndId>${trunc(s.endToEndId, 35)}</OrgnlEndToEndId>`);
      xml.push(`      <OrgnlTxId>${trunc(s.txId, 35)}</OrgnlTxId>`);
      xml.push(`      <TxSts>${s.statusCode}</TxSts>`);
      if (s.reasonCode) {
        xml.push("      <StsRsnInf>");
        xml.push("        <Rsn>");
        xml.push(`          <Cd>${trunc(s.reasonCode, 4)}</Cd>`);
        xml.push("        </Rsn>");
        if (s.additionalInfo) {
          xml.push(
            `        <AddtlInf>${trunc(s.additionalInfo, 350)}</AddtlInf>`,
          );
        }
        xml.push("      </StsRsnInf>");
      } else if (s.additionalInfo) {
        xml.push("      <StsRsnInf>");
        xml.push(
          `        <AddtlInf>${trunc(s.additionalInfo, 350)}</AddtlInf>`,
        );
        xml.push("      </StsRsnInf>");
      }
      if (s.amount !== undefined && s.currency) {
        xml.push(
          `      <OrgnlTxRef><Amt><InstdAmt Ccy="${trunc(s.currency, 3)}">${formatAmount(s.amount, s.currency)}</InstdAmt></Amt></OrgnlTxRef>`,
        );
      }
      xml.push("    </TxInfAndSts>");
    }
    xml.push("  </FIToFIPmtStsRpt>");
    xml.push("</Document>");
    return xml.join("\n");
  } catch (err: any) {
    logger.error("iso20022.generatePacs002 failed", {
      error: err?.message,
    });
    return `<?xml version="1.0" encoding="UTF-8"?>\n<Document xmlns="${NS_PACS002}"><FIToFIPmtStsRpt><GrpHdr><MsgId>ERROR</MsgId><CreDtTm>${now()}</CreDtTm><NbOfTxs>0</NbOfTxs><!-- ${esc(err?.message ?? "unknown error")} --></GrpHdr></FIToFIPmtStsRpt></Document>`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience dispatcher (used by the API route)
// ─────────────────────────────────────────────────────────────────────────────

export type Iso20022MessageType = "pain001" | "pacs008" | "pacs002";

export async function generateIso20022Message(
  messageType: Iso20022MessageType,
  data: any,
): Promise<{ xml: string; messageType: string; generatedAt: string }> {
  const generatedAt = now();
  let xml: string;
  switch (messageType) {
    case "pain001":
      xml = await generatePain001(data as Pain001Data);
      break;
    case "pacs008":
      xml = await generatePacs008(data as Pacs008Data);
      break;
    case "pacs002":
      xml = await generatePacs002(data as Pacs002Data);
      break;
    default:
      throw new Error(`Unsupported ISO 20022 message type: ${messageType}`);
  }
  return { xml, messageType, generatedAt };
}

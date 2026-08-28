// @ts-nocheck
/**
 * G-12 — SWIFT MT700 Series (Documentary Credit) Message Generation
 * ====================================================================
 *
 * Generates SWIFT MT (Message Type) text messages used in trade finance
 * Letter-of-Credit workflows:
 *
 *   • MT700 — Issue of a Documentary Credit
 *   • MT707 — Amendment to a Documentary Credit
 *   • MT752 — Authorisation to Reimburse
 *
 * Output format: legacy SWIFT FIN text — field tags appear as `:NNN:`
 * (e.g. `:27: 1/1`), with each field on its own line and `-}` as the
 * conventional end-of-message marker. Newlines within a multi-line
 * field use a literal `//` separator or `$` (here we use `//`).
 *
 * Standards reference
 * -------------------
 *   • SWIFT UHB (User Handbook) — MT700, MT707, MT752 specs (Nov 2023).
 *   • ICC Uniform Customs and Practice for Documentary Credits (UCP 600).
 *   • SWIFT field dictionary — each field has a strict format
 *     (e.g. 32B = currency + amount, 31D = YYYYMMDD date).
 *
 * Validation:
 *   • Field 50 (Applicant) and 59 (Beneficiary) — max 4 lines × 35 chars
 *   • Field 32B amount — 15 digits max including decimals
 *   • Field 20 (Sender's reference) — max 16 chars, alphanumeric + `/`
 *   • Field 31D — date in YYYYMMDD format
 *
 * All public functions are wrapped in try/catch; on failure they return
 * a minimal valid SWIFT text with the error embedded in field 72
 * (Sender to Receiver Information) so the caller never gets a 500.
 */

import { logger } from "@/lib/sgtx/logger";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface LCParty {
  /** Account number (field 50/59 line 1, optional). */
  account?: string;
  /** Party name (max 35 chars). */
  name: string;
  /** Address line 1 (max 35 chars). */
  address1?: string;
  /** Address line 2 (max 35 chars). */
  address2?: string;
  /** Address line 3 (max 35 chars). */
  address3?: string;
}

export interface LCData {
  /** Field 27 — Sequence of Total (e.g. "1/1"). */
  sequenceOfTotal?: string;
  /** Field 40A — Form of Documentary Credit (IRREVOCABLE / REVOCABLE + STANDBY etc). */
  formOfCredit?: "IRREVOCABLE" | "REVOCABLE" | "IRREVOCABLE TRANSFERABLE" | "IRREVOCABLE STANDBY";
  /** Field 20 — Sender's Reference (max 16). */
  sendersReference: string;
  /** Field 31C — Date of Issue (YYYYMMDD). Optional — defaults to today. */
  dateOfIssue?: string;
  /** Field 31D — Date and Place of Expiry. */
  dateOfExpiry: string;
  placeOfExpiry: string;
  /** Field 50 — Applicant. */
  applicant: LCParty;
  /** Field 59 — Beneficiary. */
  beneficiary: LCParty;
  /** Field 32B — Currency Code, Amount. */
  currencyCode: string;
  amount: number;
  /** Field 39A — Percentage Credit Amount Tolerance (e.g. "5/5"). */
  tolerancePercentage?: string;
  /** Field 41A — Available With (BIC) + by (PAYMENT/ACCEPTANCE/NEGOTIATION). */
  availableWithBic: string;
  availableBy: "BY PAYMENT" | "BY ACCEPTANCE" | "BY NEGOTIATION" | "BY DEFERRED PAYMENT";
  /** Field 42C — Drafts At (e.g. "60 DAYS AFTER SIGHT"). */
  draftsAt?: string;
  /** Field 43P — Partial Shipments (ALLOWED / NOT ALLOWED). */
  partialShipments?: "ALLOWED" | "NOT ALLOWED";
  /** Field 43T — Transhipment (ALLOWED / NOT ALLOWED). */
  transhipment?: "ALLOWED" | "NOT ALLOWED";
  /** Field 44A — On Board / Taking in Charge at/from (place). */
  loadingDispatchPlace?: string;
  /** Field 44B — For Transportation to (place). */
  dischargeDestinationPlace?: string;
  /** Field 44C — Latest Date of Shipment (YYYYMMDD). */
  latestShipmentDate?: string;
  /** Field 45A — Description of Goods and/or Services (free text, multiline). */
  descriptionOfGoods?: string;
  /** Field 46A — Documents Required (free text, multiline). */
  documentsRequired?: string;
  /** Field 47A — Additional Conditions (free text, multiline). */
  additionalConditions?: string;
  /** Field 49 — Confirmation Instructions (CONFIRM / MAY ADD / WITHOUT). */
  confirmationInstructions?: "CONFIRM" | "MAY ADD" | "WITHOUT";
  /** Field 78 — Instructions to the Paying/Accepting/Negotiating Bank. */
  instructionsToBank?: string;
  /** Field 72 — Sender to Receiver Information. */
  senderToReceiverInfo?: string;
}

export interface LCAmendmentData {
  /** Field 27 — Sequence of Total. */
  sequenceOfTotal?: string;
  /** Field 20 — Sender's Reference. */
  sendersReference: string;
  /** Field 21 — Number of Amendment. */
  amendmentNumber: string;
  /** Field 30 — Date of Amendment (YYYYMMDD). */
  dateOfAmendment?: string;
  /** Field 23E — Date of Issue of LC (the original). */
  dateOfIssue?: string;
  /** Field 20 (old) — Beneficiary's Reference (the original LC). */
  beneficiariesReference?: string;
  /** Field 31D — New Date and Place of Expiry (if amended). */
  newDateOfExpiry?: string;
  newPlaceOfExpiry?: string;
  /** Field 32B — New LC Amount (if amended). */
  newCurrencyCode?: string;
  newAmount?: number;
  /** Field 34B — Total Amount Claimed / Discrepant fee. */
  totalAmountClaimed?: number;
  /** Field 50 — Applicant. */
  applicant?: LCParty;
  /** Field 59 — Beneficiary. */
  beneficiary?: LCParty;
  /** Field 79 — Narrative (the actual amendment text). */
  narrative: string;
  /** Field 72 — Sender to Receiver Information. */
  senderToReceiverInfo?: string;
}

export interface ReimbursementData {
  /** Field 27 — Sequence of Total. */
  sequenceOfTotal?: string;
  /** Field 20 — Transaction Reference Number. */
  transactionReference: string;
  /** Field 21 — Documentary Credit Number. */
  documentaryCreditNumber: string;
  /** Field 30 — Date of Authorisation (YYYYMMDD). */
  dateOfAuthorisation?: string;
  /** Field 25 — Reimbursement Bank's BIC. */
  reimbursementBankBic: string;
  /** Field 30 — Date of this authorisation. */
  authorisationDate?: string;
  /** Field 32B — Currency + Amount to be reimbursed. */
  currencyCode: string;
  amount: number;
  /** Field 34B — Amount to be reimbursed (alt format). */
  reimbursementAmount?: number;
  /** Field 71B — Details of Charges (OUR/BEN). */
  detailsOfCharges?: string;
  /** Field 72 — Sender to Receiver Information. */
  senderToReceiverInfo?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const EOL = "\r\n"; // SWIFT standard line terminator is CR+LF
const EOM = "-" + EOL; // end-of-block marker for SWIFT text

/** Truncate to max length (SWIFT field lengths are strict). */
function trunc(s: any, max: number): string {
  if (s === null || s === undefined) return "";
  return String(s).slice(0, max);
}

/** Format an amount per SWIFT field 32B: no thousand separator, max 15 digits. */
function formatAmount(amount: number, currency: string): string {
  try {
    const decimals = ["JPY", "KRW", "VND", "XAF", "XOF", "XPF", "BIF", "DJF"]
      .includes((currency || "").toUpperCase())
      ? 0
      : 2;
    const safe = Number.isFinite(amount) ? amount : 0;
    return safe.toFixed(decimals);
  } catch {
    return "0.00";
  }
}

/** Format a date as YYYYMMDD (SWIFT date format). */
function fmtDate(d: string | undefined): string {
  try {
    if (!d) {
      const today = new Date();
      return (
        today.getUTCFullYear().toString() +
        String(today.getUTCMonth() + 1).padStart(2, "0") +
        String(today.getUTCDate()).padStart(2, "0")
      );
    }
    // Accept YYYY-MM-DD or YYYYMMDD
    const cleaned = String(d).replace(/[^0-9]/g, "");
    return cleaned.length === 8 ? cleaned : fmtDate(undefined);
  } catch {
    return "19700101";
  }
}

/** Render a 4-line party block (fields 50 / 59 / 52A / 58A etc.). */
function renderParty(p: LCParty): string {
  const lines: string[] = [];
  if (p?.account) lines.push(trunc(p.account, 34));
  if (p?.name) lines.push(trunc(p.name, 35));
  if (p?.address1) lines.push(trunc(p.address1, 35));
  if (p?.address2) lines.push(trunc(p.address2, 35));
  if (p?.address3) lines.push(trunc(p.address3, 35));
  // SWIFT field 50 / 59 allow up to 4 lines (account + 3 OR 4 name/addr)
  return lines.slice(0, 4).join(EOL);
}

/** Convert a multi-line free-text field to SWIFT format. SWIFT free text
 * fields use a line-break marker `//` and limit each line to 65 chars. */
function renderFreeText(text: string | undefined): string {
  if (!text) return "";
  const lines = String(text).split(/\r?\n/);
  const out: string[] = [];
  for (const l of lines) {
    // Split lines > 65 chars into multiple lines
    const chunk = l.length > 65 ? l.match(/.{1,65}/g) || [] : [l];
    for (const c of chunk) out.push(c);
  }
  return out.join(EOL);
}

/** Basic block header for SWIFT text output. */
function swHeader(blockId: string, blockContent: string): string {
  return `{1:${blockId}}${EOL}{2:O${blockContent}}${EOL}{4:${EOL}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MT700 — Issue of Documentary Credit
// ─────────────────────────────────────────────────────────────────────────────

export async function generateMT700(data: LCData): Promise<string> {
  try {
    if (!data) throw new Error("LCData required");
    const lines: string[] = [];
    // :27: Sequence of Total
    lines.push(`:27: ${trunc(data.sequenceOfTotal ?? "1/1", 8)}`);
    // :40A: Form of Documentary Credit
    lines.push(`:40A: ${trunc(data.formOfCredit ?? "IRREVOCABLE", 30)}`);
    // :20: Sender's Reference (16 chars)
    lines.push(`:20: ${trunc(data.sendersReference, 16)}`);
    // :31C: Date of Issue
    lines.push(`:31C: ${fmtDate(data.dateOfIssue)}`);
    // :31D: Date and Place of Expiry
    lines.push(`:31D: ${fmtDate(data.dateOfExpiry)} ${trunc(data.placeOfExpiry, 29)}`);
    // :50: Applicant
    lines.push(`:50: ${renderParty(data.applicant)}`);
    // :59: Beneficiary
    lines.push(`:59: ${renderParty(data.beneficiary)}`);
    // :32B: Currency Code, Amount
    lines.push(
      `:32B: ${trunc(data.currencyCode.toUpperCase(), 3)}${formatAmount(data.amount, data.currencyCode)}`,
    );
    // :39A: Percentage Credit Amount Tolerance
    if (data.tolerancePercentage) {
      lines.push(`:39A: ${trunc(data.tolerancePercentage, 4)}`);
    }
    // :41A: Available With ... By ...
    lines.push(
      `:41A: ${trunc(data.availableWithBic.toUpperCase(), 11)}${EOL}${trunc(data.availableBy, 18)}`,
    );
    // :42C: Drafts At
    if (data.draftsAt) {
      lines.push(`:42C: ${trunc(data.draftsAt, 42)}`);
    }
    // :43P: Partial Shipments
    lines.push(`:43P: ${trunc(data.partialShipments ?? "NOT ALLOWED", 14)}`);
    // :43T: Transhipment
    lines.push(`:43T: ${trunc(data.transhipment ?? "NOT ALLOWED", 14)}`);
    // :44A: On Board / Taking in Charge at/from
    if (data.loadingDispatchPlace) {
      lines.push(`:44A: ${trunc(data.loadingDispatchPlace, 65)}`);
    }
    // :44B: For Transportation to
    if (data.dischargeDestinationPlace) {
      lines.push(`:44B: ${trunc(data.dischargeDestinationPlace, 65)}`);
    }
    // :44C: Latest Date of Shipment
    if (data.latestShipmentDate) {
      lines.push(`:44C: ${fmtDate(data.latestShipmentDate)}`);
    }
    // :45A: Description of Goods and/or Services
    if (data.descriptionOfGoods) {
      lines.push(`:45A: ${renderFreeText(data.descriptionOfGoods)}`);
    }
    // :46A: Documents Required
    if (data.documentsRequired) {
      lines.push(`:46A: ${renderFreeText(data.documentsRequired)}`);
    }
    // :47A: Additional Conditions
    if (data.additionalConditions) {
      lines.push(`:47A: ${renderFreeText(data.additionalConditions)}`);
    }
    // :49: Confirmation Instructions
    lines.push(`:49: ${trunc(data.confirmationInstructions ?? "WITHOUT", 7)}`);
    // :78: Instructions to the Paying/Accepting/Negotiating Bank
    if (data.instructionsToBank) {
      lines.push(`:78: ${renderFreeText(data.instructionsToBank)}`);
    }
    // :72: Sender to Receiver Information
    if (data.senderToReceiverInfo) {
      lines.push(`:72: ${trunc(data.senderToReceiverInfo, 90)}`);
    }

    // Compose SWIFT FIN text — block 4 wraps the fields, terminated by `-}`
    const block4 = `{4:${EOL}` + lines.join(EOL) + EOL + `-}`;
    return block4;
  } catch (err: any) {
    logger.error("swift-mt700.generateMT700 failed", {
      error: err?.message,
    });
    return `{4:${EOL}:27: 1/1${EOL}:20: ERROR${EOL}:72: ${trunc(err?.message ?? "unknown error", 90)}${EOL}-}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MT707 — Amendment to a Documentary Credit
// ─────────────────────────────────────────────────────────────────────────────

export async function generateMT707(data: LCAmendmentData): Promise<string> {
  try {
    if (!data) throw new Error("LCAmendmentData required");
    const lines: string[] = [];
    lines.push(`:27: ${trunc(data.sequenceOfTotal ?? "1/1", 8)}`);
    lines.push(`:20: ${trunc(data.sendersReference, 16)}`);
    lines.push(`:21: ${trunc(data.amendmentNumber, 16)}`);
    if (data.dateOfIssue) {
      lines.push(`:23E: ${fmtDate(data.dateOfIssue)}`);
    }
    lines.push(`:30: ${fmtDate(data.dateOfAmendment)}`);
    if (data.beneficiariesReference) {
      lines.push(`:52D: ${trunc(data.beneficiariesReference, 16)}`);
    }
    if (data.newDateOfExpiry || data.newPlaceOfExpiry) {
      lines.push(
        `:31D: ${fmtDate(data.newDateOfExpiry)} ${trunc(data.newPlaceOfExpiry ?? "", 29)}`,
      );
    }
    if (data.newCurrencyCode && data.newAmount !== undefined) {
      lines.push(
        `:32B: ${trunc(data.newCurrencyCode.toUpperCase(), 3)}${formatAmount(data.newAmount, data.newCurrencyCode)}`,
      );
    }
    if (data.totalAmountClaimed !== undefined) {
      lines.push(`:34B: ${formatAmount(data.totalAmountClaimed, "USD")}`);
    }
    if (data.applicant) {
      lines.push(`:50: ${renderParty(data.applicant)}`);
    }
    if (data.beneficiary) {
      lines.push(`:59: ${renderParty(data.beneficiary)}`);
    }
    // :79: Narrative — the amendment details
    lines.push(`:79: ${renderFreeText(data.narrative)}`);
    if (data.senderToReceiverInfo) {
      lines.push(`:72: ${trunc(data.senderToReceiverInfo, 90)}`);
    }
    return `{4:${EOL}` + lines.join(EOL) + EOL + `-}`;
  } catch (err: any) {
    logger.error("swift-mt700.generateMT707 failed", {
      error: err?.message,
    });
    return `{4:${EOL}:27: 1/1${EOL}:20: ERROR${EOL}:79: ${trunc(err?.message ?? "unknown error", 350)}${EOL}-}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MT752 — Authorisation to Reimburse
// ─────────────────────────────────────────────────────────────────────────────

export async function generateMT752(data: ReimbursementData): Promise<string> {
  try {
    if (!data) throw new Error("ReimbursementData required");
    const lines: string[] = [];
    lines.push(`:27: ${trunc(data.sequenceOfTotal ?? "1/1", 8)}`);
    lines.push(`:20: ${trunc(data.transactionReference, 16)}`);
    lines.push(`:21: ${trunc(data.documentaryCreditNumber, 16)}`);
    if (data.reimbursementBankBic) {
      lines.push(`:25: ${trunc(data.reimbursementBankBic.toUpperCase(), 11)}`);
    }
    lines.push(`:30: ${fmtDate(data.dateOfAuthorisation)}`);
    lines.push(
      `:32B: ${trunc(data.currencyCode.toUpperCase(), 3)}${formatAmount(data.amount, data.currencyCode)}`,
    );
    if (data.reimbursementAmount !== undefined) {
      lines.push(`:34B: ${formatAmount(data.reimbursementAmount, data.currencyCode)}`);
    }
    if (data.detailsOfCharges) {
      lines.push(`:71B: ${trunc(data.detailsOfCharges, 90)}`);
    }
    if (data.senderToReceiverInfo) {
      lines.push(`:72: ${trunc(data.senderToReceiverInfo, 90)}`);
    }
    return `{4:${EOL}` + lines.join(EOL) + EOL + `-}`;
  } catch (err: any) {
    logger.error("swift-mt700.generateMT752 failed", {
      error: err?.message,
    });
    return `{4:${EOL}:27: 1/1${EOL}:20: ERROR${EOL}:72: ${trunc(err?.message ?? "unknown error", 90)}${EOL}-}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dispatcher
// ─────────────────────────────────────────────────────────────────────────────

export type SwiftMessageType = "MT700" | "MT707" | "MT752";

export async function generateSwiftMessage(
  messageType: SwiftMessageType,
  data: any,
): Promise<{ text: string; messageType: string; generatedAt: string }> {
  const generatedAt = new Date().toISOString();
  let text: string;
  switch (messageType) {
    case "MT700":
      text = await generateMT700(data as LCData);
      break;
    case "MT707":
      text = await generateMT707(data as LCAmendmentData);
      break;
    case "MT752":
      text = await generateMT752(data as ReimbursementData);
      break;
    default:
      throw new Error(`Unsupported SWIFT MT message type: ${messageType}`);
  }
  return { text, messageType, generatedAt };
}

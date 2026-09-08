// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v17 §10.23-10.24 — Co-Financing: encrypted blind bidding, blended APR,
// master + annex agreements, PSP split disbursement.
// ═══════════════════════════════════════════════════════════════════════════════
//
// Multiple financiers can split funding for a single trade. Each financier's
// bid is encrypted client-side (simulated NaCl-style public-key encryption)
// and remains opaque until the bidding window closes. The borrower then
// accepts a subset of bids whose total ≤ requested amount P. The accepted
// bids form one master financing agreement (with blended APR + SGTX Witness
// Clause) and one annex per financier tranche. Disbursement is a single PSP
// split instruction with 0.25% fee per leg.
//
// ── ENCRYPTION (SIMULATED) ────────────────────────────────────────────────────
// In production, `encryptBid` would run in the financier's browser using
// libsodium-wrappers `crypto_box_seal(message, financierPublicKey)` (X25519 +
// XSalsa20-Poly1305). The financier's private key would be the only key able
// to decrypt. SGTX would never see the plaintext bid terms until the financier
// (or the financier's authorised delegate) decrypts after the bidding window
// closes.
//
// HERE we simulate that flow with a deterministic XOR cipher keyed by
// SHA-256(financier_public_key). This is NOT real encryption — anyone with
// the public key can "decrypt". It exists purely to demonstrate the blind-
// bidding UX (bid terms hidden from the borrower + other financiers until
// the window closes). Real NaCl MUST be wired in before production.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from "crypto";
import {
  WITNESS_CLAUSE,
  FINANCING_FEE_RATE,
  computeFinancingFee,
} from "@/lib/sgtx/financing";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface BidData {
  amountOffered: number;
  apr: number;
  settlementMethod: string;
  collateralRequired: string;
  conditions?: string | null;
  noteToBorrower?: string | null;
  isDeFi: boolean;
  deFiProtocol?: string | null;
}

export interface EncryptedBid {
  encryptedPayload: string;
  encryptionMethod: string; // "simulated-nacl"
}

export interface AcceptedBid {
  bidId: string;
  financierGtid: string;
  amount: number;
  apr: number;
  status?: string;
}

export interface BlendedAprResult {
  blendedApr: number;
  totalAmount: number;
  weightedSum: number;
}

export interface CoFinancingValidationResult {
  valid: boolean;
  errors: string[];
}

export interface CoFinancingAgreement {
  masterAgreement: {
    agreementId: string;
    requestId: string;
    blendedApr: number;
    totalAmount: number;
    acceptedBids: { bidId: string; financierGtid: string; amount: number; apr: number }[];
    witnessClause: string;
    masterHash: string;
    createdAt: string;
  };
  annexes: CoFinancingAnnex[];
  blendedApr: number;
  totalAmount: number;
  sha256Hash: string;
}

export interface CoFinancingAnnex {
  annexId: string;
  bidId: string;
  financierGtid: string;
  amount: number;
  apr: number;
  tenorDays: number;
  fee: number;
  borrowerNet: number;
  witnessClause: string;
  annexHash: string;
}

export interface PspSplitLeg {
  legId: string;
  financierGtid: string;
  amount: number;
  currency: string;
  feeUsd: number;
  borrowerNet: number;
}

export interface PspSplitInstruction {
  splitId: string;
  legs: PspSplitLeg[];
  totalFeeUsd: number;
  totalBorrowerNet: number;
  currency: string;
  feeRatePct: number;
}

// ── Encryption helpers (SIMULATED — see header) ──────────────────────────────

const ENC_PREFIX = "simnacl:v1:";

/**
 * Derive the XOR key from the public/private key material.
 *
 * The simulation is SYMMETRIC: both `encryptBid(bid, publicKey)` and
 * `decryptBid(enc, privateKey)` derive the SAME XOR key when the public and
 * private keys share a common seed (the financier's GTID). The public key
 * format is `"<gtid>:public-key-v1"` and the private key format is
 * `"<gtid>:private-key-v1"` — we extract the GTID prefix and hash it.
 *
 * This is NOT real public-key cryptography — anyone who knows the financier's
 * GTID can derive the XOR key. The simulation exists purely to demonstrate
 * the blind-bidding UX (bid terms hidden from the borrower + other financiers
 * until the window closes). Real NaCl MUST be wired in before production.
 */
function deriveXorKey(keyMaterial: string): Buffer {
  // Extract the GTID prefix (before the first ":") if a suffix is present,
  // otherwise use the entire key material as the seed.
  const seed = keyMaterial.includes(":") ? keyMaterial.split(":")[0] : keyMaterial;
  return crypto.createHash("sha256").update(seed, "utf-8").digest();
}

function xorCipher(plainText: string, key: Buffer): string {
  const buf = Buffer.from(plainText, "utf-8");
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) {
    out[i] = buf[i] ^ key[i % key.length];
  }
  return out.toString("base64");
}

function xorDecipher(b64: string, key: Buffer): string {
  const buf = Buffer.from(b64, "base64");
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) {
    out[i] = buf[i] ^ key[i % key.length];
  }
  return out.toString("utf-8");
}

/**
 * Encrypt a bid payload with the financier's public key.
 *
 * SIMULATION ONLY. Real production would use libsodium `crypto_box_seal`
 * in the financier's browser so SGTX never sees the plaintext until the
 * financier chooses to decrypt after the bidding window closes.
 *
 * @param bidData the plaintext bid terms
 * @param financierPublicKey the financier's public key (their GTID-derived
 *   key in the demo, an X25519 public key in production)
 */
export function encryptBid(bidData: BidData, financierPublicKey: string): EncryptedBid {
  if (!financierPublicKey) throw new Error("financier_public_key is required to encrypt a bid");
  const text = JSON.stringify(bidData);
  const key = deriveXorKey(financierPublicKey);
  const encryptedPayload = ENC_PREFIX + xorCipher(text, key);
  return { encryptedPayload, encryptionMethod: "simulated-nacl" };
}

/**
 * Decrypt a bid payload with the financier's private key.
 *
 * SIMULATION ONLY. In production, only the financier's private key can
 * decrypt a bid sealed with their public key (crypto_box_seal_open). Here
 * the same XOR key derived from the public key reverses the cipher.
 *
 * @param encryptedPayload the encrypted bid payload (simnacl:v1:<base64>)
 * @param financierPrivateKey the financier's private key (in the demo, this
 *   is the same value as the public key — the simulation is symmetric)
 */
export function decryptBid(encryptedPayload: string, financierPrivateKey: string): BidData {
  if (!encryptedPayload) throw new Error("encrypted_payload is required");
  if (!encryptedPayload.startsWith(ENC_PREFIX)) {
    // Legacy format — assume plaintext JSON
    try {
      return JSON.parse(encryptedPayload) as BidData;
    } catch {
      throw new Error("Invalid encrypted payload format");
    }
  }
  if (!financierPrivateKey) throw new Error("financier_private_key is required to decrypt");
  const b64 = encryptedPayload.slice(ENC_PREFIX.length);
  const key = deriveXorKey(financierPrivateKey);
  const text = xorDecipher(b64, key);
  return JSON.parse(text) as BidData;
}

// ── Blended APR (weighted average) ─────────────────────────────────────────────

/**
 * Calculate the blended APR as the weighted average of accepted bids.
 *
 *   blendedApr = Σ(amount_i × apr_i) / Σ(amount_i)
 *
 * Returns 0 when the bid list is empty or the total amount is 0.
 */
export function calculateBlendedApr(acceptedBids: { amount: number; apr: number }[]): BlendedAprResult {
  if (!acceptedBids || acceptedBids.length === 0) {
    return { blendedApr: 0, totalAmount: 0, weightedSum: 0 };
  }
  const totalAmount = acceptedBids.reduce((s, b) => s + (b.amount || 0), 0);
  if (totalAmount === 0) return { blendedApr: 0, totalAmount: 0, weightedSum: 0 };
  const weightedSum = acceptedBids.reduce((s, b) => s + (b.amount || 0) * (b.apr || 0), 0);
  const blendedApr = +(weightedSum / totalAmount).toFixed(4);
  return { blendedApr, totalAmount, weightedSum: +weightedSum.toFixed(4) };
}

// ── Co-financing validation ───────────────────────────────────────────────────

/**
 * Validate a co-financing acceptance:
 *   • Sum of accepted bid amounts ≤ total requested amount P
 *   • All bids must be SUBMITTED status
 *   • All bids must have been submitted within the bidding window
 *
 * Note: the bidding window does NOT need to be closed for acceptance — the
 * borrower can pre-select bids while the window is still open. Decryption,
 * however, requires the window to have closed (see decryptBid route).
 *
 * @param acceptedBids the bids the borrower wants to accept (with amount, status, submittedAt)
 * @param totalRequested the financing request's amountUsd (P)
 * @param biddingWindowEndsAt when the bidding window closes (optional)
 */
export function validateCoFinancing(
  acceptedBids: { bidId: string; amount: number; status: string; submittedAt?: Date | string }[],
  totalRequested: number,
  biddingWindowEndsAt?: Date | string | null,
): CoFinancingValidationResult {
  const errors: string[] = [];

  if (!acceptedBids || acceptedBids.length === 0) {
    return { valid: false, errors: ["At least one bid must be accepted for co-financing."] };
  }

  const totalAccepted = acceptedBids.reduce((s, b) => s + (b.amount || 0), 0);
  if (totalAccepted > totalRequested) {
    errors.push(
      `Sum of accepted bids ($${totalAccepted.toFixed(2)}) exceeds requested amount P ($${totalRequested.toFixed(2)}).`,
    );
  }

  for (const bid of acceptedBids) {
    if (bid.status !== "SUBMITTED") {
      errors.push(`Bid ${bid.bidId} is not in SUBMITTED state (current: ${bid.status}).`);
    }
  }

  // Bids must be submitted within the bidding window
  if (biddingWindowEndsAt) {
    const windowEnd = new Date(biddingWindowEndsAt);
    for (const bid of acceptedBids) {
      if (bid.submittedAt && new Date(bid.submittedAt) > windowEnd) {
        errors.push(`Bid ${bid.bidId} was submitted after the bidding window closed.`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── Co-financing agreement assembly (master + annexes) ─────────────────────────

/**
 * Assemble the co-financing agreement: one master financing agreement
 * (blended APR + total amount + non-removable SGTX Witness Clause) plus
 * one annex per accepted financier tranche. Returns the SHA-256 hash
 * of the master + all annexes (concatenated).
 *
 * Does NOT persist — the API route is responsible for the DB writes.
 *
 * @param acceptedBids the accepted bids (bidId, financierGtid, amount, apr)
 * @param financingRequest the FinancingRequest row (requestId, tenorDays, preferredCurrency)
 */
export function assembleCoFinancingAgreement(
  acceptedBids: AcceptedBid[],
  financingRequest: { requestId: string; tenorDays: number; preferredCurrency?: string },
): CoFinancingAgreement {
  if (!acceptedBids || acceptedBids.length === 0) {
    throw new Error("Cannot assemble co-financing agreement with zero accepted bids");
  }

  const blended = calculateBlendedApr(
    acceptedBids.map((b) => ({ amount: b.amount, apr: b.apr })),
  );

  const agreementId = `COFA-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 9000 + 1000)}`;
  const feeOnTotal = +(blended.totalAmount * FINANCING_FEE_RATE).toFixed(2);
  const witnessClause = WITNESS_CLAUSE.replace("[amount]", `$${feeOnTotal.toFixed(2)}`);

  const masterBody = {
    agreementId,
    requestId: financingRequest.requestId,
    blendedApr: blended.blendedApr,
    totalAmount: blended.totalAmount,
    acceptedBids: acceptedBids.map((b) => ({
      bidId: b.bidId,
      financierGtid: b.financierGtid,
      amount: b.amount,
      apr: b.apr,
    })),
    witnessClause,
    createdAt: new Date().toISOString(),
  };
  const masterText = JSON.stringify(masterBody);
  const masterHash = "sha256:" + crypto.createHash("sha256").update(masterText).digest("hex");

  const annexes: CoFinancingAnnex[] = acceptedBids.map((b, idx) => {
    const fee = computeFinancingFee(b.amount);
    const annexBody = {
      annexId: `${agreementId}-A${idx + 1}`,
      bidId: b.bidId,
      financierGtid: b.financierGtid,
      amount: b.amount,
      apr: b.apr,
      tenorDays: financingRequest.tenorDays,
      fee: fee.fee,
      borrowerNet: fee.borrowerNet,
      witnessClause,
    };
    const annexText = JSON.stringify(annexBody);
    const annexHash = "sha256:" + crypto.createHash("sha256").update(annexText).digest("hex");
    return { ...annexBody, annexHash };
  });

  const combinedText = masterText + "|" + annexes.map((a) => a.annexHash).join("|");
  const sha256Hash = "sha256:" + crypto.createHash("sha256").update(combinedText).digest("hex");

  return {
    masterAgreement: { ...masterBody, masterHash },
    annexes,
    blendedApr: blended.blendedApr,
    totalAmount: blended.totalAmount,
    sha256Hash,
  };
}

// ── PSP split instruction ─────────────────────────────────────────────────────

/**
 * Generate the PSP split instruction: one leg per financier tranche, with
 * 0.25% fee per leg (deducted from the disbursed principal and routed to
 * SGTX). Currency defaults to USD; the financing request's preferred
 * currency (USD/EGP/EURO) can be passed to switch currency.
 */
export function generatePspSplitInstruction(
  acceptedBids: AcceptedBid[],
  currency: string = "USD",
): PspSplitInstruction {
  if (!acceptedBids || acceptedBids.length === 0) {
    throw new Error("Cannot generate PSP split instruction with zero accepted bids");
  }

  const splitId = `PSP-SPLIT-COFA-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
  const legs: PspSplitLeg[] = acceptedBids.map((b, i) => {
    const fee = computeFinancingFee(b.amount);
    return {
      legId: `${splitId}-L${i + 1}`,
      financierGtid: b.financierGtid,
      amount: b.amount,
      currency,
      feeUsd: fee.fee,
      borrowerNet: fee.borrowerNet,
    };
  });
  const totalFeeUsd = +legs.reduce((s, l) => s + l.feeUsd, 0).toFixed(2);
  const totalBorrowerNet = +legs.reduce((s, l) => s + l.borrowerNet, 0).toFixed(2);

  return {
    splitId,
    legs,
    totalFeeUsd,
    totalBorrowerNet,
    currency,
    feeRatePct: FINANCING_FEE_RATE * 100,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Derive the simulated "public key" for a financier GTID.
 * In production this would be a real X25519 public key fetched from the
 * financier's tenant profile.
 */
export function deriveFinancierPublicKey(financierGtid: string): string {
  return `${financierGtid}:public-key-v1`;
}

/**
 * Derive the simulated "private key" for a financier GTID.
 * In production the financier would hold this offline (never on SGTX).
 * Here we derive it deterministically from the GTID so the decrypt
 * route can simulate "the financier chose to decrypt after the window closed".
 */
export function deriveFinancierPrivateKey(financierGtid: string): string {
  return `${financierGtid}:private-key-v1`;
}

/**
 * Generate a co-financing display ID. The persistent ID is the
 * FinancingAgreement.id (cuid). This helper returns a human-readable
 * display ID (COFA-YYYYMMDD-NNNN) used as the FinancingAgreement.agreementId
 * field.
 */
export function generateCoFinancingId(): string {
  return `COFA-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

// SGTX Part 11.5 — Zero-Knowledge Proof stub
// Blueprint Part 11.5 requires ZK proofs for two use-cases:
//   1. Reserve proof — a financier proves "reserves ≥ 1.1× liabilities" WITHOUT revealing
//      the exact reserve or liability numbers (Part 6 financing solvency checks).
//   2. Confidential pricing — a seller commits to a price without revealing it until the
//      quote is accepted (Part 3 quote packing).
// The production implementation uses zk-SNARKs (groth16/plonk) via a Rust prover service.
//
// This stub simulates the API contract with SHA-256 commitments and structural verification.

import { createHash } from "crypto";

const PROOF_PREFIX = "zk:";

export interface ReserveProof {
  proof: string;
  verified: boolean;
  reserveRatio: number;
}

export interface PriceProof {
  proof: string;
  commitment: string;
}

/**
 * Generate a simulated ZK proof that `reserveAmount / liabilities >= 1.1`
 * without revealing either number.
 *
 * The proof string is `zk:<sha256(reserve|liabilities|ratio)>`.
 * `verified` is true iff the reserve ratio meets the 1.1× minimum required by Part 6.
 */
export function generateReserveProof(
  reserveAmount: number,
  liabilities: number,
): ReserveProof {
  const safeLiabilities = liabilities > 0 ? liabilities : 1;
  const reserveRatio = reserveAmount / safeLiabilities;
  const verified = reserveRatio >= 1.1;

  const payload = `${reserveAmount}|${liabilities}|${reserveRatio.toFixed(4)}`;
  const proof = `${PROOF_PREFIX}${createHash("sha256").update(payload, "utf8").digest("hex")}`;

  return { proof, verified, reserveRatio: Number(reserveRatio.toFixed(4)) };
}

/**
 * Generate a simulated ZK commitment for a confidential price.
 * The commitment hides the price but lets the seller open it later when the quote is accepted.
 * Returns a proof (for the buyer) and a commitment (kept by the seller until reveal).
 */
export function generatePriceProof(price: number): PriceProof {
  const salt = createHash("sha256").update(`${price}|${Date.now()}`, "utf8").digest("hex").slice(0, 16);
  const commitment = `commit:${createHash("sha256").update(`${price}|${salt}`, "utf8").digest("hex")}`;
  const proof = `${PROOF_PREFIX}${createHash("sha256").update(commitment, "utf8").digest("hex")}`;
  return { proof, commitment };
}

/**
 * Verify a ZK proof string.
 * This stub accepts any string that has the documented `zk:` prefix and a 64-char hex body.
 * In production this calls the verifier microservice.
 */
export function verifyZkProof(proof: string): boolean {
  if (!proof || !proof.startsWith(PROOF_PREFIX)) return false;
  const body = proof.slice(PROOF_PREFIX.length);
  return /^[0-9a-f]{64}$/i.test(body);
}

// ZK proof system stats (for /api/sgtx/zk/status endpoint)
let _zkProofCount = 0;
let _zkReserveProofs = 0;
let _zkPriceProofs = 0;
let _zkLastProofAt: string | null = null;
let _zkLastProofType: string | null = null;

export function getZkStats() {
  return {
    activated: true,
    algorithm: "zk-SNARK (simulated · SHA-256 commitments)",
    reserveProofs: _zkReserveProofs,
    priceProofs: _zkPriceProofs,
    verifications: 0,
    totalProofs: _zkProofCount,
    lastProofAt: _zkLastProofAt,
    lastProofType: _zkLastProofType,
    endpoints: {
      reserveProof: "/api/sgtx/zk/reserve-proof",
      priceProof: "/api/sgtx/zk/price-proof",
      verify: "/api/sgtx/zk/verify",
      status: "/api/sgtx/zk/status",
    },
  };
}

export function _trackZkProof(type: "reserve" | "price") {
  _zkProofCount++;
  if (type === "reserve") _zkReserveProofs++; else _zkPriceProofs++;
  _zkLastProofAt = new Date().toISOString();
  _zkLastProofType = type;
}

// SGTX Part 11.5 — Post-Quantum Cryptography (PQC) stub
// Blueprint Part 11.5 requires Dilithium3 signatures for long-lived sovereign trade records
// (contracts, eBL, settlement proofs) so they remain verifiable after quantum computers
// break RSA/ECDSA. The production implementation uses liboqs via a Rust microservice.
//
// This stub simulates the API contract using SHA-256 hashes prefixed with "dilithium3:".
// It is NOT cryptographically secure — it only preserves the documented call shape so the
// rest of the platform can integrate PQC now and swap in the real signer later.

import { createHash } from "crypto";

const SIGNATURE_PREFIX = "dilithium3:";

// Static simulated keypair — in production this is generated per tenant and rotated yearly.
const STATIC_PUBLIC_KEY =
  "dilithium3-pk:7f3a9c1e4b8d2a5f6e0c3b9a1d4e7f2c8b5a0d3e6f1c4b7a2e9d0c3b6a1f4e7";
const KEY_VALID_UNTIL = "2035-12-31T23:59:59Z";

/**
 * Sign arbitrary data with the simulated Dilithium3 key.
 * Returns `<prefix><sha256(data)>` — a deterministic, verifiable signature string.
 */
export function signWithDilithium3(data: string): string {
  const hash = createHash("sha256").update(data, "utf8").digest("hex");
  return `${SIGNATURE_PREFIX}${hash}`;
}

/**
 * Verify a simulated Dilithium3 signature.
 * Re-derives the SHA-256 of the data and compares against the signature payload.
 */
export function verifyDilithium3(data: string, signature: string): boolean {
  if (!signature || !signature.startsWith(SIGNATURE_PREFIX)) return false;
  const expected = signWithDilithium3(data).slice(SIGNATURE_PREFIX.length);
  const provided = signature.slice(SIGNATURE_PREFIX.length);
  return expected === provided;
}

/**
 * Return the static simulated Dilithium3 public key + validity window.
 * In production, this is fetched from the tenant's key registry (rotated annually).
 */
export function getPqcPublicKey(): {
  algorithm: string;
  publicKey: string;
  validUntil: string;
} {
  return {
    algorithm: "CRYSTAL-Dilithium3",
    publicKey: STATIC_PUBLIC_KEY,
    validUntil: KEY_VALID_UNTIL,
  };
}

export async function ensurePqcKey(): Promise<{ keyId: string; algorithm: string; publicKey: string; validUntil: Date }> {
  return {
    keyId: "sgtx-pqc-key-001",
    algorithm: "CRYSTAL-Dilithium3",
    publicKey: STATIC_PUBLIC_KEY,
    validUntil: new Date(KEY_VALID_UNTIL),
  };
}

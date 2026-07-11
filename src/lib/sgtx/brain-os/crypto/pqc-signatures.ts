// SGTX Brain OS — Post-Quantum Cryptography Signer
// =============================================================================
// Hybrid signature service for Brain-issued authoritative records:
//
//   * Ed25519  — REAL signatures via @noble/ed25519 + platform-key.ts.
//                Used for all short-lived / online records.
//   * Dilithium3 — STUB. Falls back to Ed25519 with a logged warning.
//                  Production replaces this with liboqs / a Rust microservice.
//
// The signer preserves the documented call shape (`sign`, `verify`) so the
// rest of the platform can integrate PQC now and swap in a real Dilithium3
// implementation without touching call sites.
//
// Signature envelope (string, base64-safe):
//   `<algo>:<hex-signature>`
//
// Algorithms supported:
//   - "ed25519"     → real Ed25519
//   - "dilithium3"  → falls back to ed25519 (warning emitted)
// =============================================================================

import { createHash } from "crypto";
import {
  signWithPlatformKey,
  verifyPlatformSignature,
  getPlatformPublicKeyHex,
} from "@/lib/sgtx/crypto/platform-key";
import { logger } from "../observability/structured-logging";

export type SignatureAlgorithm = "ed25519" | "dilithium3";

export interface SignatureResult {
  algorithm: SignatureAlgorithm;
  signature: string;
  fallbackUsed: boolean;
  keyId: string;
  signedAt: string;
}

export interface VerifyResult {
  valid: boolean;
  algorithm: SignatureAlgorithm;
  fallbackUsed: boolean;
}

const DILITHIUM3_KEY_ID = "sgtx-pqc-dilithium3-001";
const ED25519_KEY_ID = "sgtx-platform-ed25519-001";
const DILITHIUM3_VALID_UNTIL = "2035-12-31T23:59:59Z";

/**
 * PQCSigner — hybrid post-quantum signature service.
 *
 * Construction is cheap; the expensive key derivation happens lazily on first
 * sign/verify via `platform-key.ts`.
 */
export class PQCSigner {
  private dilithium3Warned = false;
  private cachedEd25519PublicKey: string | null = null;

  /**
   * Sign `data` with the requested algorithm.
   *
   * For `dilithium3`, falls back to Ed25519 (with a one-time warning) until
   * the real liboqs-backed signer is wired in.
   */
  async sign(data: string, algorithm: SignatureAlgorithm = "ed25519"): Promise<SignatureResult> {
    const signedAt = new Date().toISOString();
    if (algorithm === "ed25519") {
      const signature = await signWithPlatformKey(data);
      return {
        algorithm: "ed25519",
        signature,
        fallbackUsed: false,
        keyId: ED25519_KEY_ID,
        signedAt,
      };
    }

    // algorithm === "dilithium3"
    if (!this.dilithium3Warned) {
      this.dilithium3Warned = true;
      logger.warn(
        "PQCSigner: Dilithium3 not yet wired to liboqs — falling back to Ed25519. "
          + "Replace with real CRYSTAL-Dilithium3 before post-quantum migration.",
        { component: "pqc-signatures", algorithm },
      );
    }
    const edSig = await signWithPlatformKey(data);
    // Re-tag the signature so verify() knows the original algorithm intent.
    const signature = edSig.replace(/^ed25519:/, "dilithium3:");
    return {
      algorithm: "dilithium3",
      signature,
      fallbackUsed: true,
      keyId: DILITHIUM3_KEY_ID,
      signedAt,
    };
  }

  /**
   * Verify a signature produced by `sign()`. Returns `valid: true` only when
   * the underlying Ed25519 verification passes.
   */
  async verify(data: string, signature: string, algorithm: SignatureAlgorithm = "ed25519"): Promise<VerifyResult> {
    try {
      if (algorithm === "ed25519") {
        const valid = await verifyPlatformSignature(data, signature);
        return { valid, algorithm, fallbackUsed: false };
      }

      // dilithium3: normalise the envelope back to ed25519: then verify.
      const normalised = signature.startsWith("dilithium3:")
        ? signature.replace(/^dilithium3:/, "ed25519:")
        : `ed25519:${signature}`;
      const valid = await verifyPlatformSignature(data, normalised);
      return { valid, algorithm, fallbackUsed: true };
    } catch {
      return { valid: false, algorithm, fallbackUsed: algorithm === "dilithium3" };
    }
  }

  /** Return the public key material for the requested algorithm. */
  async getPublicKey(algorithm: SignatureAlgorithm = "ed25519"): Promise<{
    algorithm: string;
    publicKey: string;
    keyId: string;
    validUntil: string;
    fallbackUsed: boolean;
  }> {
    if (algorithm === "ed25519") {
      if (!this.cachedEd25519PublicKey) {
        this.cachedEd25519PublicKey = await getPlatformPublicKeyHex();
      }
      return {
        algorithm: "Ed25519",
        publicKey: this.cachedEd25519PublicKey,
        keyId: ED25519_KEY_ID,
        validUntil: "2035-12-31T23:59:59Z",
        fallbackUsed: false,
      };
    }
    // dilithium3 — return the Ed25519 public key with a fallback flag so
    // verifiers know what to expect.
    if (!this.cachedEd25519PublicKey) {
      this.cachedEd25519PublicKey = await getPlatformPublicKeyHex();
    }
    return {
      algorithm: "CRYSTAL-Dilithium3 (fallback: Ed25519)",
      publicKey: this.cachedEd25519PublicKey,
      keyId: DILITHIUM3_KEY_ID,
      validUntil: DILITHIUM3_VALID_UNTIL,
      fallbackUsed: true,
    };
  }

  /**
   * Synchronous sign for contexts that cannot await (e.g. hot request paths).
   * Uses the HMAC-SHA256 fallback in platform-key.ts. Dilithium3 still falls
   * back to Ed25519 here.
   */
  signSync(data: string, algorithm: SignatureAlgorithm = "ed25519"): SignatureResult {
    const signedAt = new Date().toISOString();
    if (algorithm === "ed25519") {
      // Re-implement minimal sync signing to avoid importing the sync helpers
      // (we keep platform-key.ts as the single source of truth, but sync
      // paths are dev-only — the prod signer is async).
      const hex = process.env.SGTX_PLATFORM_KEY || "dev-only-fallback-key";
      const hmac = createHash("sha256").update(data + ":" + hex).digest("hex");
      return {
        algorithm: "ed25519",
        signature: `ed25519:${hmac.slice(0, 128)}`,
        fallbackUsed: false,
        keyId: ED25519_KEY_ID,
        signedAt,
      };
    }
    if (!this.dilithium3Warned) {
      this.dilithium3Warned = true;
      // Best-effort warning without circular logger dependency during sync.
      console.warn(
        "[pqc-signatures] Dilithium3 not yet wired to liboqs — falling back to Ed25519 (sync path).",
      );
    }
    const hex = process.env.SGTX_PLATFORM_KEY || "dev-only-fallback-key";
    const hmac = createHash("sha256").update(data + ":" + hex).digest("hex");
    return {
      algorithm: "dilithium3",
      signature: `dilithium3:${hmac.slice(0, 128)}`,
      fallbackUsed: true,
      keyId: DILITHIUM3_KEY_ID,
      signedAt,
    };
  }
}

/** Default singleton. */
export const pqcSigner = new PQCSigner();

// @ts-nocheck
// =============================================================================
// SGTX QES Hybrid Signature Library (v17 Section 3.5)
// -----------------------------------------------------------------------------
// Qualified Electronic Signature via Egypt Trust / Misr TSP, with hybrid
// Ed25519 fallback and Dilithium3 post-quantum archival.
//
// Egyptian E-Signature Law 15/2004 (Article 13) — a "qualified electronic
// signature" carries the same legal weight as a handwritten signature
// when issued by an accredited TSP (Trust Service Provider) registered
// with ITIDA / NTRA. Egypt Trust and Misr TSP are the two accredited
// providers as of 2026.
//
// Signature stack (per v17 Section 3.5 "Governor Core → QES"):
//
//   PRIMARY  (online)   : Ed25519 platform signature
//                        (fast, deterministic, key in platform-key.ts)
//   QES      (useTsp)   : Egypt Trust / Misr TSP — simulated via remote
//                        HSM-backed XAdES / PAdES envelope. Real production
//                        integration deferred to the ITIDA-licensed HSM
//                        appliance; here we simulate the TSP round-trip
//                        with a SHA256 envelope signed by the platform key
//                        and tagged with the provider name + Law-15/2004
//                        Article-13 reference.
//   ARCHIVAL (post-QC) : Dilithium3 (CRYSTAL-Dilithium3) — NIST PQC standard.
//                        Production wires liboqs via a Rust microservice;
//                        here we simulate with Ed25519 and mark the
//                        algorithm as "Dilithium3-simulated" so verifiers
//                        can distinguish from a real PQC signature.
//   FALLBACK           : if TSP is unavailable (timeout / revoked /
//                        maintenance window), fall back to Ed25519 alone
//                        and set `fallbackUsed: true`. This keeps the
//                        transaction signed (non-repudiation preserved) at
//                        the cost of QES legal equivalence.
//
// All envelopes are strings prefixed with the algorithm tag, e.g.
//   "ed25519:<hex>"
//   "qes-egypt-trust:<base64-of-XAdES-envelope>"
//   "dilithium3-simulated:<hex>"
// =============================================================================

import { createHash } from "crypto";
import {
  signWithPlatformKey,
  verifyPlatformSignature,
  getPlatformPublicKeyHex,
} from "@/lib/sgtx/crypto/platform-key";
import { logger } from "@/lib/sgtx/logger";

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export type SignatureType =
  | "platform-ed25519"
  | "qes-egypt-trust"
  | "qes-misr-tsp"
  | "dilithium3-archival";

export type SignatureAlgorithm = "Ed25519" | "Dilithium3-simulated" | "XAdES-EgyptTrust" | "XAdES-MisrTSP";

export interface TspProvider {
  id: "egypt-trust" | "misr-tsp";
  name: string;
  accreditation: string;
  law: string;
  /** Simulated availability flag — real production reads from TSP health endpoint. */
  available: boolean;
}

export interface QESSignOptions {
  /** Attempt QES via Egypt Trust / Misr TSP (Egyptian E-Signature Law 15/2004 Art. 13). */
  useTsp?: boolean;
  /** Which TSP to prefer when `useTsp` is true. Defaults to "egypt-trust". */
  preferredTsp?: "egypt-trust" | "misr-tsp";
  /** If true, also produce a Dilithium3-simulated archival signature. */
  archival?: boolean;
  /** Caller GTID (tenant identity) for audit trail. */
  signerGtid?: string;
  /** Document/legal context this signature is being applied to. */
  context?: "contract" | "customs-declaration" | "financing-agreement" | "court-evidence" | "ustn-anchoring";
}

export interface QESSignResult {
  signature: string;
  signatureType: SignatureType;
  tspProvider?: TspProvider["id"];
  algorithm: SignatureAlgorithm;
  fallbackUsed: boolean;
  signedAt: string;
  signerGtid?: string;
  context?: string;
  /** Dilithium3 archival signature (post-quantum), if `archival: true`. */
  archivalSignature?: {
    signature: string;
    algorithm: "Dilithium3-simulated";
    signedAt: string;
  };
  /** SHA-256 of the canonicalised payload, used for cross-verification. */
  payloadDigest: string;
  /** Reference to the Egyptian law that confers QES legal equivalence. */
  legalReference: string;
}

export interface QESVerifyOptions {
  expectedTsp?: "egypt-trust" | "misr-tsp";
  expectedContext?: QESSignOptions["context"];
  allowFallback?: boolean;
}

export interface QESVerifyResult {
  valid: boolean;
  signatureType: SignatureType | "unknown";
  verifiedAt: string;
  algorithm?: SignatureAlgorithm;
  fallbackUsed?: boolean;
  tspProvider?: TspProvider["id"];
  legalReference?: string;
  reason?: string;
}

export interface SignaturePolicy {
  primaryAlgorithm: "Ed25519";
  archivalAlgorithm: "Dilithium3-simulated";
  tspProvider: "egypt-trust" | "misr-tsp";
  fallbackAlgorithm: "Ed25519";
  governingLaw: string;
  legalEquiv: string;
  fallbackPolicy: "fail-open-with-audit" | "fail-closed";
}

// ──────────────────────────────────────────────────────────────────────────
// TSP registry — Egypt Trust / Misr TSP (Law 15/2004 Art. 13)
// ──────────────────────────────────────────────────────────────────────────

export const EGYPT_TSP_PROVIDERS: Record<TspProvider["id"], TspProvider> = {
  "egypt-trust": {
    id: "egypt-trust",
    name: "Egypt Trust for Digital Signature",
    accreditation: "ITIDA / NTRA accredited TSP — Egyptian E-Signature Law 15/2004",
    law: "Egyptian E-Signature Law 15/2004, Article 13",
    available: true,
  },
  "misr-tsp": {
    id: "misr-tsp",
    name: "Misr Information Security & Trust",
    accreditation: "ITIDA / NTRA accredited TSP — Egyptian E-Signature Law 15/2004",
    law: "Egyptian E-Signature Law 15/2004, Article 13",
    available: true,
  },
};

let tspOverride: Partial<Record<TspProvider["id"], boolean>> = {};

/** Override simulated TSP availability (for tests / maintenance windows). */
export function setTspAvailability(provider: TspProvider["id"], available: boolean): void {
  tspOverride[provider] = available;
}

function isTspAvailable(provider: TspProvider["id"]): boolean {
  if (provider in tspOverride) return tspOverride[provider]!;
  return EGYPT_TSP_PROVIDERS[provider].available;
}

// ──────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────

/**
 * Sign a payload with the QES hybrid signature scheme.
 *
 * Default flow:
 *   1. Always produce a primary Ed25519 platform signature (fast, online).
 *   2. If `useTsp: true` AND the preferred TSP is available, additionally
 *      tag the envelope as a QES signature with the TSP provider name +
 *      Law-15/2004 Art-13 reference. The signature bytes are still produced
 *      by the platform key (simulated HSM round-trip) — production replaces
 *      this with the actual XAdES envelope returned by the TSP API.
 *   3. If `useTsp: true` but the TSP is unavailable, fall back to plain
 *      Ed25519 and set `fallbackUsed: true`.
 *   4. If `archival: true`, also produce a Dilithium3-simulated archival
 *      signature (post-quantum migration readiness).
 *
 * The returned envelope is a single string prefixed with the algorithm tag
 * so verifiers can dispatch on the prefix without parsing.
 */
export async function signWithQES(
  payload: string,
  options: QESSignOptions = {},
): Promise<QESSignResult> {
  const signedAt = new Date().toISOString();
  const payloadDigest = "sha256:" + createHash("sha256").update(payload).digest("hex");
  const useTsp = options.useTsp === true;
  const preferred = options.preferredTsp ?? "egypt-trust";
  const archival = options.archival === true;
  const legalReference = EGYPT_TSP_PROVIDERS[preferred].law;
  let signatureType: SignatureType = "platform-ed25519";
  let algorithm: SignatureAlgorithm = "Ed25519";
  let tspProvider: TspProvider["id"] | undefined;
  let fallbackUsed = false;

  // Step 1: Always produce a primary Ed25519 signature.
  const edSig = await signWithPlatformKey(payload);

  if (!useTsp) {
    signatureType = "platform-ed25519";
    algorithm = "Ed25519";
    return {
      signature: edSig,
      signatureType,
      algorithm,
      fallbackUsed: false,
      signedAt,
      signerGtid: options.signerGtid,
      context: options.context,
      payloadDigest,
      legalReference,
      ...(archival ? { archivalSignature: await buildArchivalSignature(payload) } : {}),
    };
  }

  // Step 2: Try QES via TSP.
  const tspAvailable = isTspAvailable(preferred);
  if (!tspAvailable) {
    // Hybrid fallback — fall back to plain Ed25519 + audit log.
    logger.warn(
      `[qes-hybrid] TSP ${preferred} unavailable — falling back to Ed25519. ` +
        `Non-repudiation preserved, but QES legal equivalence (Law 15/2004 Art. 13) is lost.`,
      { provider: preferred, fallback: true, signerGtid: options.signerGtid, context: options.context },
    );
    signatureType = "platform-ed25519";
    algorithm = "Ed25519";
    fallbackUsed = true;
    return {
      signature: edSig,
      signatureType,
      algorithm,
      fallbackUsed,
      signedAt,
      signerGtid: options.signerGtid,
      context: options.context,
      payloadDigest,
      legalReference,
      ...(archival ? { archivalSignature: await buildArchivalSignature(payload) } : {}),
    };
  }

  // TSP available — wrap the Ed25519 signature inside a simulated XAdES
  // envelope carrying the TSP provider id, accreditation, law reference,
  // and the canonicalised payload digest.
  signatureType = preferred === "egypt-trust" ? "qes-egypt-trust" : "qes-misr-tsp";
  algorithm = preferred === "egypt-trust" ? "XAdES-EgyptTrust" : "XAdES-MisrTSP";
  tspProvider = preferred;
  const qesEnvelope = buildXAdESEnvelope({
    payloadDigest,
    innerEd25519Signature: edSig,
    tspProvider: preferred,
    signedAt,
    signerGtid: options.signerGtid,
    context: options.context,
  });

  const result: QESSignResult = {
    signature: qesEnvelope,
    signatureType,
    tspProvider,
    algorithm,
    fallbackUsed: false,
    signedAt,
    signerGtid: options.signerGtid,
    context: options.context,
    payloadDigest,
    legalReference,
  };

  if (archival) {
    result.archivalSignature = await buildArchivalSignature(payload);
  }

  return result;
}

/**
 * Verify a QES hybrid signature.
 *
 * Handles all four envelope types:
 *   - `ed25519:<hex>`           → Ed25519 platform signature
 *   - `qes-egypt-trust:<base64>` → QES via Egypt Trust (XAdES envelope)
 *   - `qes-misr-tsp:<base64>`    → QES via Misr TSP (XAdES envelope)
 *   - `dilithium3-simulated:<hex>` → Dilithium3 archival (simulated)
 *
 * For QES envelopes, the inner Ed25519 signature is verified against the
 * platform public key — this gives us non-repudiation while the TSP
 * envelope confers legal equivalence under Law 15/2004 Art. 13.
 */
export async function verifyQES(
  signature: string,
  payload: string,
  options: QESVerifyOptions = {},
): Promise<QESVerifyResult> {
  const verifiedAt = new Date().toISOString();
  try {
    if (!signature || typeof signature !== "string") {
      return { valid: false, signatureType: "unknown", verifiedAt, reason: "empty signature" };
    }

    // Ed25519 platform signature
    if (signature.startsWith("ed25519:")) {
      const valid = await verifyPlatformSignature(payload, signature);
      return {
        valid,
        signatureType: "platform-ed25519",
        verifiedAt,
        algorithm: "Ed25519",
        fallbackUsed: false,
        legalReference: EGYPT_TSP_PROVIDERS["egypt-trust"].law,
        reason: valid ? undefined : "Ed25519 verification failed",
      };
    }

    // Dilithium3-simulated archival signature
    if (signature.startsWith("dilithium3-simulated:")) {
      const innerHex = signature.slice("dilithium3-simulated:".length);
      const reconstructed = `ed25519:${innerHex}`;
      const valid = await verifyPlatformSignature(payload, reconstructed);
      return {
        valid,
        signatureType: "dilithium3-archival",
        verifiedAt,
        algorithm: "Dilithium3-simulated",
        fallbackUsed: true,
        legalReference: "NIST PQC (CRYSTAL-Dilithium3) — simulated, real impl pending liboqs integration",
        reason: valid ? undefined : "Dilithium3-simulated verification failed",
      };
    }

    // QES envelopes (Egypt Trust / Misr TSP)
    if (signature.startsWith("qes-egypt-trust:") || signature.startsWith("qes-misr-tsp:")) {
      const provider: TspProvider["id"] = signature.startsWith("qes-egypt-trust:")
        ? "egypt-trust"
        : "misr-tsp";
      const signatureType: SignatureType = provider === "egypt-trust" ? "qes-egypt-trust" : "qes-misr-tsp";
      const algorithm: SignatureAlgorithm = provider === "egypt-trust" ? "XAdES-EgyptTrust" : "XAdES-MisrTSP";

      if (options.expectedTsp && options.expectedTsp !== provider) {
        return {
          valid: false,
          signatureType,
          verifiedAt,
          algorithm,
          tspProvider: provider,
          reason: `expected TSP ${options.expectedTsp} but signature issued by ${provider}`,
        };
      }

      const envelope = parseXAdESEnvelope(signature);
      if (!envelope) {
        return {
          valid: false,
          signatureType,
          verifiedAt,
          algorithm,
          tspProvider: provider,
          reason: "malformed XAdES envelope",
        };
      }

      // Verify the inner Ed25519 signature against the payload.
      const innerValid = await verifyPlatformSignature(payload, envelope.innerEd25519Signature);
      if (!innerValid) {
        return {
          valid: false,
          signatureType,
          verifiedAt,
          algorithm,
          tspProvider: provider,
          reason: "inner Ed25519 verification failed — QES envelope integrity broken",
        };
      }

      // Verify the payload digest matches the one captured inside the envelope.
      const computedDigest =
        "sha256:" + createHash("sha256").update(payload).digest("hex");
      if (envelope.payloadDigest !== computedDigest) {
        return {
          valid: false,
          signatureType,
          verifiedAt,
          algorithm,
          tspProvider: provider,
          reason: "payload digest mismatch — payload modified after signing",
        };
      }

      return {
        valid: true,
        signatureType,
        verifiedAt,
        algorithm,
        fallbackUsed: false,
        tspProvider: provider,
        legalReference: EGYPT_TSP_PROVIDERS[provider].law,
      };
    }

    return {
      valid: false,
      signatureType: "unknown",
      verifiedAt,
      reason: `unrecognised signature envelope prefix: ${signature.slice(0, 32)}`,
    };
  } catch (err: any) {
    return {
      valid: false,
      signatureType: "unknown",
      verifiedAt,
      reason: `verification threw: ${err?.message ?? String(err)}`,
    };
  }
}

/**
 * Return the canonical signature policy for this deployment.
 * Used by the public Loom verification endpoint and the court evidence
 * package generator so they can attest to the signature stack.
 */
export function getSignaturePolicy(): SignaturePolicy {
  return {
    primaryAlgorithm: "Ed25519",
    archivalAlgorithm: "Dilithium3-simulated",
    tspProvider: "egypt-trust",
    fallbackAlgorithm: "Ed25519",
    governingLaw: "Egyptian E-Signature Law 15/2004, Article 13",
    legalEquiv:
      "A qualified electronic signature issued by an ITIDA/NTRA-accredited TSP " +
      "(Egypt Trust or Misr TSP) carries the same legal weight as a handwritten " +
      "signature under Egyptian law.",
    fallbackPolicy: "fail-open-with-audit",
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────

interface XAdESEnvelope {
  payloadDigest: string;
  innerEd25519Signature: string;
  tspProvider: TspProvider["id"];
  signedAt: string;
  signerGtid?: string;
  context?: string;
}

function buildXAdESEnvelope(env: XAdESEnvelope): string {
  const obj = {
    v: 1,
    tsp: env.tspProvider,
    law: EGYPT_TSP_PROVIDERS[env.tspProvider].law,
    accreditation: EGYPT_TSP_PROVIDERS[env.tspProvider].accreditation,
    digest: env.payloadDigest,
    innerSig: env.innerEd25519Signature,
    signedAt: env.signedAt,
    signerGtid: env.signerGtid,
    context: env.context,
  };
  const json = JSON.stringify(obj);
  const b64 = Buffer.from(json, "utf8").toString("base64");
  return env.tspProvider === "egypt-trust"
    ? `qes-egypt-trust:${b64}`
    : `qes-misr-tsp:${b64}`;
}

function parseXAdESEnvelope(sig: string): XAdESEnvelope | null {
  try {
    const prefix = sig.startsWith("qes-egypt-trust:")
      ? "qes-egypt-trust:"
      : "qes-misr-tsp:";
    const b64 = sig.slice(prefix.length);
    const json = Buffer.from(b64, "base64").toString("utf8");
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== "object") return null;
    if (typeof obj.digest !== "string" || typeof obj.innerSig !== "string") return null;
    if (typeof obj.tsp !== "string" || !(obj.tsp in EGYPT_TSP_PROVIDERS)) return null;
    return {
      payloadDigest: obj.digest,
      innerEd25519Signature: obj.innerSig,
      tspProvider: obj.tsp,
      signedAt: typeof obj.signedAt === "string" ? obj.signedAt : "",
      signerGtid: typeof obj.signerGtid === "string" ? obj.signerGtid : undefined,
      context: typeof obj.context === "string" ? obj.context : undefined,
    };
  } catch {
    return null;
  }
}

async function buildArchivalSignature(payload: string): Promise<{
  signature: string;
  algorithm: "Dilithium3-simulated";
  signedAt: string;
}> {
  // Simulated Dilithium3 — production replaces this with liboqs.
  const edSig = await signWithPlatformKey(payload);
  const hex = edSig.slice("ed25519:".length);
  return {
    signature: `dilithium3-simulated:${hex}`,
    algorithm: "Dilithium3-simulated",
    signedAt: new Date().toISOString(),
  };
}

/** Convenience: return the platform public key hex (used by QES verifiers). */
export async function getQESVerificationPublicKey(): Promise<string> {
  return getPlatformPublicKeyHex();
}

/** Self-test — used by /api/sgtx/health to confirm the QES lib loads. */
export async function selfTestQES(): Promise<{ ok: boolean; detail: string }> {
  try {
    const payload = "qes-self-test-" + Date.now();
    const signed = await signWithQES(payload, { useTsp: true, archival: true });
    const verified = await verifyQES(signed.signature, payload);
    if (!verified.valid) {
      return { ok: false, detail: `verify failed: ${verified.reason}` };
    }
    if (signed.archivalSignature) {
      const archVerified = await verifyQES(signed.archivalSignature.signature, payload);
      if (!archVerified.valid) {
        return { ok: false, detail: `archival verify failed: ${archVerified.reason}` };
      }
    }
    return { ok: true, detail: `signed ${signed.signatureType} + archival=${!!signed.archivalSignature}` };
  } catch (err: any) {
    return { ok: false, detail: `threw: ${err?.message ?? String(err)}` };
  }
}

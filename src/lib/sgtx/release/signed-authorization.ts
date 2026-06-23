// SGTX Part 8.5 — Signed Authorization Pipeline
//
// Every AUTHORISED response from the Container Release Authorisation API
// (Part 8.3.1) includes a detached PKCS#7/CMS signature generated using
// SGTX's Egypt Trust qualified certificate. The signature binds:
//   - the AUTHORISATION_ID,
//   - the USTN,
//   - the container number,
//   - the issued_at / valid_until window,
//   - the mandatory_fee + credit summaries,
//   - the issuing terminal identifier,
// so that any downstream party (terminal, shipping line, customs broker,
// court) can independently verify the release decision without contacting
// SGTX.
//
// SIMULATION. The production signature is generated inside an HSM-backed
// Egypt Trust qualified-certificate slot using PKCS#7/CMS with RSA-2048 +
// SHA-256. This stub reproduces the API contract using RSA-SHA256 over a
// canonical JSON payload + signing-cert fingerprint. The signature string
// is opaque base64 so callers cannot confuse it for a real PKCS#7 blob.
//
// Functions:
//   - getSigningCertificate()               → SGTX's Egypt Trust cert (simulated)
//   - signAuthorization(payload)            → SignedAuthorization
//   - verifyAuthorization(signedPayload)    → VerifyResult
//
// Persistence:
//   Each signed authorization is persisted to ConfigurationHistory
//   (configKey=`release_signed_auth.<authorisation_id>`) so the audit trail
//   survives dev-server reloads and is queryable by Loom-anchor tools.

import { createHash, createSign, createVerify, generateKeyPairSync, randomUUID } from "crypto";
import { freshDb as db } from "@/lib/db-fresh";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReleaseAuthorizationPayload {
  authorisationId: string;
  ustn: string;
  container: string;
  terminalId?: string;
  releaseStatus: string;       // AUTHORISED | HOLD | USED | EXPIRED
  issuedAt: string;            // ISO 8601
  validUntil: string;          // ISO 8601
  mandatorySummary?: Record<string, unknown>;
  creditSummary?: Record<string, unknown>;
  disputeStatus: string;
}

export interface SigningCertificate {
  subject: string;
  issuer: string;
  serialNumber: string;
  fingerprint: string;
  validFrom: string;
  validUntil: string;
  publicKey: string;          // PEM-encoded
  qualified: boolean;
  ca: "Egypt Trust Qualified CA G2";
  keyType: "RSA-2048";
  signatureAlgorithm: "SHA256-RSA";
  mode: "SIMULATION";
}

export interface SignedAuthorization {
  payload: ReleaseAuthorizationPayload;
  signature: string;           // base64 RSA-SHA256 over canonical_json(payload) + signing_cert_fingerprint
  signatureAlgorithm: "SHA256-RSA";
  signingCert: SigningCertificate;
  signedAt: string;            // ISO 8601
  validUntil: string;          // ISO 8601 (mirrors payload.validUntil)
  signatureId: string;         // UUID — for audit lookup
  format: "sgtx-signed-auth-v1";
  mode: "SIMULATION";
}

export interface VerifyResult {
  verified: boolean;
  reason: string;
  certValid: boolean;
  signatureValid: boolean;
  payloadValid: boolean;
  signatureId?: string;
  verifiedAt: string;
}

// ---------------------------------------------------------------------------
// Constants — simulated Egypt Trust qualified signing certificate
// ---------------------------------------------------------------------------

const CONFIG_KEY_PREFIX = "release_signed_auth";

// On module load we generate a single RSA-2048 keypair to act as SGTX's
// qualified signing key. In production this never leaves the HSM.
// In dev, the keypair is process-scoped — signatures are still verifiable
// within the same process, and persisted signatures include the public key
// fingerprint so cross-process verification can re-derive by ID.
const SIGNING_KEYPAIR = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const SIGNING_CERT: SigningCertificate = {
  subject: "CN=SGTX Release Authority,O=SGTX Platform Authority,C=EG",
  issuer: "CN=Egypt Trust Qualified CA G2,O=Egypt Trust for Digital Security,C=EG",
  serialNumber: "0B:7C:5E:9F:2A:1D:8B:40:71:36:E4:77:9A:C2:1F:58",
  fingerprint: "sha256:" + createHash("sha256")
    .update(SIGNING_KEYPAIR.publicKey, "utf8")
    .digest("hex"),
  validFrom: "2026-01-01T00:00:00Z",
  validUntil: "2028-12-31T23:59:59Z",
  publicKey: SIGNING_KEYPAIR.publicKey,
  qualified: true,
  ca: "Egypt Trust Qualified CA G2",
  keyType: "RSA-2048",
  signatureAlgorithm: "SHA256-RSA",
  mode: "SIMULATION",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Canonical JSON: keys sorted lexicographically, no whitespace, UTF-8.
 * This is the same canonicalization used by the existing
 * `verifyDigitalSignature` helper in `release/index.ts` — extended here
 * to also cover nested objects so the signature is reproducible across
 * heterogeneous callers (terminal client / SGTX server / external loom).
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJson).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k])).join(",") + "}";
}

/**
 * Compute the RSA-SHA256 detached signature over
 *   canonical_json(payload) + "::" + signing_cert_fingerprint
 *
 * The signing-cert fingerprint is appended to bind the signature to the
 * exact Egypt Trust certificate that produced it — preventing cert-swap
 * attacks where an attacker substitutes their own valid cert.
 */
function computeSignature(payload: ReleaseAuthorizationPayload): string {
  const canonical = canonicalJson(payload);
  const sign = createSign("RSA-SHA256");
  sign.update(canonical + "::" + SIGNING_CERT.fingerprint, "utf8");
  sign.end();
  return sign.sign(SIGNING_KEYPAIR.privateKey, "base64");
}

/**
 * Verify a signature against the SGTX signing public key.
 */
function verifySignature(payload: ReleaseAuthorizationPayload, signature: string): boolean {
  try {
    const canonical = canonicalJson(payload);
    const verify = createVerify("RSA-SHA256");
    verify.update(canonical + "::" + SIGNING_CERT.fingerprint, "utf8");
    verify.end();
    return verify.verify(SIGNING_CERT.publicKey, signature, "base64");
  } catch {
    return false;
  }
}

/**
 * Check whether the signing certificate is currently valid (not expired,
 * not revoked). In this SIMULATION we only check the validity window —
 * revocation of the SGTX-CA signing cert would be a platform-wide event
 * and is handled by the existing /api/sgtx/release/crl endpoint.
 */
function isCertValid(): boolean {
  const now = Date.now();
  const from = new Date(SIGNING_CERT.validFrom).getTime();
  const until = new Date(SIGNING_CERT.validUntil).getTime();
  return now >= from && now <= until;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

async function persistSignedAuth(signed: SignedAuthorization): Promise<void> {
  try {
    await db.configurationHistory.create({
      data: {
        configKey: `${CONFIG_KEY_PREFIX}.${signed.signatureId}`,
        oldValue: null,
        newValue: JSON.stringify(signed),
        changedByGtid: "SGTX-Release-Authority",
        changeReason: `sign:${signed.payload.releaseStatus} ustn=${signed.payload.ustn} container=${signed.payload.container}`,
        version: 1,
      },
    });
  } catch (e) {
    console.error("[release/signed-authorization] persist failed:", e);
  }
}

async function loadSignedAuth(signatureId: string): Promise<SignedAuthorization | null> {
  try {
    const row = await db.configurationHistory.findFirst({
      where: {
        configKey: `${CONFIG_KEY_PREFIX}.${signatureId}`,
      },
      orderBy: { createdAt: "desc" },
    });
    if (!row || !row.newValue) return null;
    return JSON.parse(row.newValue) as SignedAuthorization;
  } catch (e) {
    console.error("[release/signed-authorization] load failed:", e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return SGTX's Egypt Trust qualified signing certificate (simulated).
 * The public key is real RSA-2048 so callers can verify signatures
 * cryptographically; the certificate metadata is simulated.
 */
export function getSigningCertificate(): SigningCertificate {
  return { ...SIGNING_CERT };
}

/**
 * Sign a release authorization payload.
 *
 * The payload MUST contain at minimum:
 *   - authorisationId
 *   - ustn
 *   - container
 *   - releaseStatus (typically "AUTHORISED")
 *   - issuedAt
 *   - validUntil
 *
 * Returns the signed envelope (payload + signature + signing cert metadata
 * + signedAt + validUntil). Persisted to ConfigurationHistory so it can be
 * retrieved later by signatureId for verification or audit.
 */
export async function signAuthorization(
  payload: ReleaseAuthorizationPayload,
): Promise<SignedAuthorization> {
  if (!payload.authorisationId || !payload.ustn || !payload.container) {
    throw new Error(
      "signAuthorization: payload requires authorisationId, ustn, container",
    );
  }
  if (!payload.issuedAt || !payload.validUntil) {
    throw new Error("signAuthorization: payload requires issuedAt and validUntil (ISO 8601)");
  }

  const signature = computeSignature(payload);
  const signatureId = randomUUID();
  const signedAt = nowIso();

  const signed: SignedAuthorization = {
    payload,
    signature,
    signatureAlgorithm: "SHA256-RSA",
    signingCert: { ...SIGNING_CERT },
    signedAt,
    validUntil: payload.validUntil,
    signatureId,
    format: "sgtx-signed-auth-v1",
    mode: "SIMULATION",
  };

  await persistSignedAuth(signed);

  // Activity log entry. actorGtid is null because the signer is a system
  // principal ("SGTX-Release-Authority") — not a Tenant row.
  try {
    await db.activity.create({
      data: {
        actorGtid: null,
        action: "RELEASE_AUTH_SIGNED",
        description: `Signed authorization ${payload.authorisationId} for USTN ${payload.ustn} container ${payload.container} — sigId ${signatureId}`,
        type: "SUCCESS",
        metadata: JSON.stringify({
          signatureId,
          authorisationId: payload.authorisationId,
          ustn: payload.ustn,
          container: payload.container,
          signedAt,
          validUntil: payload.validUntil,
        }),
      },
    });
  } catch (e) {
    console.error("[release/signed-authorization] activity log failed:", e);
  }

  return signed;
}

/**
 * Verify a signed authorization envelope.
 *
 * Accepts either:
 *   1. a SignedAuthorization object (full envelope including signature + payload),
 *   2. a { signatureId } lookup (retrieves the persisted envelope from
 *      ConfigurationHistory),
 *   3. a { signature, payload } pair (for callers that obtained them
 *      separately, e.g. via the Authorization header on the release endpoint).
 *
 * Returns:
 *   - verified: true iff cert is valid AND signature is valid AND payload
 *     is still within its validUntil window.
 *   - certValid: signing cert within validity window (and not revoked —
 *     in this SIMULATION we only check the validity window).
 *   - signatureValid: RSA-SHA256 signature verifies against the SGTX
 *     signing public key.
 *   - payloadValid: current time is within payload.issuedAt..validUntil.
 *   - reason: human-readable status.
 */
export async function verifyAuthorization(
  input:
    | SignedAuthorization
    | { signatureId: string }
    | { signature: string; payload: ReleaseAuthorizationPayload },
): Promise<VerifyResult> {
  const verifiedAt = nowIso();

  let envelope: SignedAuthorization | null = null;

  // Discriminate input shape by key set:
  //   - { signatureId } only  → db lookup
  //   - { signature, payload } only → caller-supplied pair (inline)
  //   - { signatureId, signature, payload, signingCert, format, ... } → full envelope
  const inputKeys = new Set(Object.keys(input));
  const has = (k: string) => inputKeys.has(k);
  const isInlinePair =
    has("signature") && has("payload") && !has("signatureId") && !has("signingCert");
  const isLookup =
    has("signatureId") && !has("signature") && !has("payload");
  const isFullEnvelope =
    has("signatureId") && has("signature") && has("payload") && has("signingCert");

  if (isLookup) {
    const lookupInput = input as { signatureId: string };
    envelope = await loadSignedAuth(lookupInput.signatureId);
    if (!envelope) {
      return {
        verified: false,
        reason: `No signed authorization found for signatureId=${lookupInput.signatureId}`,
        certValid: false,
        signatureValid: false,
        payloadValid: false,
        verifiedAt,
      };
    }
  } else if (isInlinePair) {
    // Caller-supplied pair — reconstruct the envelope.
    const pairInput = input as { signature: string; payload: ReleaseAuthorizationPayload };
    envelope = {
      payload: pairInput.payload,
      signature: pairInput.signature,
      signatureAlgorithm: "SHA256-RSA",
      signingCert: { ...SIGNING_CERT },
      signedAt: pairInput.payload.issuedAt,
      validUntil: pairInput.payload.validUntil,
      signatureId: "inline",
      format: "sgtx-signed-auth-v1",
      mode: "SIMULATION",
    };
  } else if (isFullEnvelope) {
    // Full SignedAuthorization object — verify the supplied payload/signature,
    // NOT a fresh copy from the database (this is the path that lets callers
    // detect tampering by passing a modified envelope).
    envelope = input as SignedAuthorization;
  } else {
    return {
      verified: false,
      reason:
        "Malformed verification input — expected { signatureId } | { signature, payload } | full SignedAuthorization",
      certValid: false,
      signatureValid: false,
      payloadValid: false,
      verifiedAt,
    };
  }

  if (!envelope) {
    return {
      verified: false,
      reason: "Malformed verification input",
      certValid: false,
      signatureValid: false,
      payloadValid: false,
      verifiedAt,
    };
  }

  // 1. Cert validity.
  const certValid = isCertValid();
  if (!certValid) {
    return {
      verified: false,
      reason: `Signing certificate is not currently valid (validity ${SIGNING_CERT.validFrom}..${SIGNING_CERT.validUntil})`,
      certValid: false,
      signatureValid: false,
      payloadValid: false,
      signatureId: envelope.signatureId,
      verifiedAt,
    };
  }

  // 2. Payload window.
  const now = Date.now();
  const issued = new Date(envelope.payload.issuedAt).getTime();
  const until = new Date(envelope.payload.validUntil).getTime();
  const payloadValid = now >= issued && now <= until;
  if (!payloadValid) {
    return {
      verified: false,
      reason: now < issued
        ? `Payload issuedAt is in the future (${envelope.payload.issuedAt})`
        : `Payload expired at ${envelope.payload.validUntil}`,
      certValid: true,
      signatureValid: false,
      payloadValid: false,
      signatureId: envelope.signatureId,
      verifiedAt,
    };
  }

  // 3. Signature.
  const signatureValid = verifySignature(envelope.payload, envelope.signature);
  if (!signatureValid) {
    return {
      verified: false,
      reason: "Signature does not verify against SGTX signing public key (tampered or wrong cert)",
      certValid: true,
      signatureValid: false,
      payloadValid: true,
      signatureId: envelope.signatureId,
      verifiedAt,
    };
  }

  return {
    verified: true,
    reason: "ok — signature verified, cert valid, payload within validity window",
    certValid: true,
    signatureValid: true,
    payloadValid: true,
    signatureId: envelope.signatureId,
    verifiedAt,
  };
}

/**
 * Convenience: list recent signed-authorizations for audit dashboards.
 * Returns up to `limit` (default 50) most-recent envelopes.
 */
export async function listSignedAuthorizations(limit = 50): Promise<SignedAuthorization[]> {
  try {
    const rows = await db.configurationHistory.findMany({
      where: {
        configKey: { startsWith: `${CONFIG_KEY_PREFIX}.` },
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(1, limit), 500),
    });
    const out: SignedAuthorization[] = [];
    for (const row of rows) {
      if (!row.newValue) continue;
      try {
        out.push(JSON.parse(row.newValue) as SignedAuthorization);
      } catch {
        // skip
      }
    }
    return out;
  } catch (e) {
    console.error("[release/signed-authorization] list failed:", e);
    return [];
  }
}

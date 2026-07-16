// SGTX Passkey / WebAuthn Assertion Verification (FIX-AUTH-COUNTRIES-KYC / Fix 4)
//
// Real WebAuthn assertion verification using @noble/ed25519 (the platform's
// existing Ed25519 library, also used by `src/lib/sgtx/crypto/platform-key.ts`).
//
// Flow:
//   1. Client calls POST /api/v1/auth/passkey/challenge → gets a 32-byte
//      random challenge (base64url) bound to a session ID (anonymous cookie
//      or IP fallback). Challenge TTL: 5 minutes.
//   2. Client asks the authenticator to sign
//      `authenticator_data || SHA-256(client_data_json)` where
//      `client_data_json` contains `{ type: "webauthn.get", challenge, origin }`.
//   3. Client POSTs to /api/v1/auth/passkey with:
//        credential_id, challenge, signature, authenticator_data,
//        client_data_json, optional public_key (first-time enrollment).
//   4. Server validates:
//        - challenge was issued by us in the last 5 min AND not consumed
//        - signature is valid base64
//        - client_data_json.challenge matches the issued challenge
//        - client_data_json.origin matches an allowed origin
//        - if a public key is registered for credential_id: verify the
//          Ed25519 signature against `authenticator_data || SHA-256(client_data_json)`
//   5. On success: issue access + refresh JWTs (with CSRF claim).
//
// In-memory storage (Map) — per-process. Production should use Redis (the
// SGTX_ALLOWED_ORIGINS env var is already referenced by middleware) so that
// challenge state survives cold restarts and is shared across instances.

import { randomBytes, createHash, timingSafeEqual } from "crypto";
import * as ed from "@noble/ed25519";

// ============================================================
// Challenge store (5-min TTL, in-memory)
// ============================================================

interface ChallengeEntry { challenge: string; expiresAt: number; consumed: boolean; }
const passkeyChallenges: Map<string, ChallengeEntry> = new Map();
const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let challengeSweepCounter = 0;
const CHALLENGE_SWEEP_INTERVAL = 25; // sweep every ~25 challenge issues

/**
 * Issue a fresh WebAuthn challenge for a session. The challenge is 32 random
 * bytes (base64url-encoded, 43 chars). The same session ID may have at most
 * one outstanding challenge — issuing a new one invalidates the prior.
 *
 * @param sessionId - stable identifier for the pre-auth session (anonymous
 *                    cookie, IP, or session-token sub). MUST be non-empty.
 * @returns base64url-encoded challenge string.
 */
export function issueChallenge(sessionId: string): string {
  if (!sessionId) throw new Error("sessionId required for passkey challenge");
  const challenge = randomBytes(32).toString("base64url");
  passkeyChallenges.set(sessionId, {
    challenge,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
    consumed: false,
  });
  // Opportunistic sweep — keep the Map bounded under challenge-storm attacks.
  if (++challengeSweepCounter >= CHALLENGE_SWEEP_INTERVAL) {
    challengeSweepCounter = 0;
    cleanupExpiredChallenges();
  }
  return challenge;
}

/**
 * Consume (single-use) a previously-issued challenge. The challenge MUST:
 *   - exist for the given session ID,
 *   - not be past its TTL,
 *   - not have been consumed already (replay protection),
 *   - byte-match the supplied challenge (timing-safe compare).
 *
 * On success the challenge is marked consumed (cannot be reused). On any
 * failure the challenge is left intact (so a legitimate retry with the right
 * value still works) — except for consumed/expired entries which are pruned.
 *
 * @param sessionId - the session ID used at issue time.
 * @param challenge - the base64url challenge presented by the client.
 * @returns true iff the challenge is valid and was successfully consumed.
 */
export function consumeChallenge(sessionId: string, challenge: string): boolean {
  if (!sessionId || !challenge) return false;
  const entry = passkeyChallenges.get(sessionId);
  if (!entry) return false;
  // Expired — prune and reject.
  if (Date.now() > entry.expiresAt) {
    passkeyChallenges.delete(sessionId);
    return false;
  }
  // Already consumed — reject (do not delete; client may be retrying).
  if (entry.consumed) return false;
  // Timing-safe equality on the base64url strings.
  try {
    const a = Buffer.from(challenge);
    const b = Buffer.from(entry.challenge);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  } catch { return false; }
  // Mark consumed — single-use.
  entry.consumed = true;
  // Schedule deletion at TTL (lazy: the next consume call or sweep will
  // drop it; we don't need a timer).
  return true;
}

/**
 * Sweep expired challenge entries. Called internally on issue; safe to call
 * from a cron for bounded memory in long-running processes.
 * @returns number of entries pruned.
 */
export function cleanupExpiredChallenges(): number {
  const now = Date.now();
  let pruned = 0;
  for (const [k, v] of passkeyChallenges) {
    if (now > v.expiresAt || v.consumed) {
      passkeyChallenges.delete(k);
      pruned++;
    }
  }
  return pruned;
}

// ============================================================
// Registered passkey store (in-memory; production → DB/Redis)
// ============================================================

interface RegisteredPasskey {
  credentialId: string;     // base64url
  publicKey: string;        // hex Ed25519 public key (32 bytes → 64 hex chars)
  counter: number;          // monotonic signature counter (replay protection)
  enrolledAt: number;       // Unix ms
}
const registeredPasskeys: Map<string, RegisteredPasskey> = new Map();

/**
 * Register (or replace) a passkey's public key for a given credential ID.
 * Used during first-time passkey enrollment — the client provides a public
 * key derived from the authenticator's attestation. In production this should
 * persist to a `Passkey` Prisma model (TODO); for now we keep an in-memory
 * Map keyed by credential_id (base64url).
 *
 * @param credentialId - base64url credential ID from the authenticator.
 * @param publicKeyHex - hex-encoded Ed25519 public key (32 bytes).
 */
export function registerPasskey(credentialId: string, publicKeyHex: string): void {
  if (!credentialId || !publicKeyHex) return;
  registeredPasskeys.set(credentialId, {
    credentialId,
    publicKey: publicKeyHex.toLowerCase(),
    counter: 0,
    enrolledAt: Date.now(),
  });
}

/**
 * Look up a registered passkey by credential ID.
 * @param credentialId - base64url credential ID.
 * @returns the RegisteredPasskey (with current counter + public key) or undefined.
 */
export function getPasskey(credentialId: string): RegisteredPasskey | undefined {
  if (!credentialId) return undefined;
  return registeredPasskeys.get(credentialId);
}

/**
 * Update the signature counter for a registered passkey after a successful
 * assertion. WebAuthn spec requires the stored counter to strictly increase
 * on each assertion — a stale counter indicates a cloned authenticator.
 *
 * @param credentialId - base64url credential ID.
 * @param newCounter   - the counter reported by the authenticator in this assertion.
 * @returns true if the counter was advanced (i.e. newCounter > stored).
 */
export function advanceCounter(credentialId: string, newCounter: number): boolean {
  const pk = registeredPasskeys.get(credentialId);
  if (!pk) return false;
  if (newCounter <= pk.counter) return false;
  pk.counter = newCounter;
  return true;
}

// ============================================================
// Assertion verification (Ed25519 via @noble/ed25519)
// ============================================================

/**
 * Verify a WebAuthn assertion signature against a registered Ed25519 public key.
 *
 * WebAuthn assertion signature is computed over:
 *   `authenticator_data || SHA-256(client_data_json)`
 *
 * The signature algorithm for Ed25519 WebAuthn credentials is `EdDSA` (alg -8).
 *
 * @param publicKeyHex   - hex-encoded Ed25519 public key (32 bytes / 64 chars).
 * @param signatureB64   - base64url-encoded signature (64 bytes for Ed25519).
 * @param authenticatorDataB64 - base64url-encoded authenticator data from the authenticator.
 * @param clientDataJsonB64    - base64url-encoded client data JSON.
 * @returns true if the signature is valid.
 */
export async function verifyAssertion(
  publicKeyHex: string,
  signatureB64: string,
  authenticatorDataB64: string,
  clientDataJsonB64: string,
): Promise<boolean> {
  try {
    if (!publicKeyHex || !signatureB64 || !authenticatorDataB64 || !clientDataJsonB64) return false;
    const pubKey = new Uint8Array(Buffer.from(publicKeyHex, "hex"));
    if (pubKey.length !== 32) return false;
    const sig = base64UrlToBytes(signatureB64);
    if (sig.length !== 64) return false; // Ed25519 signatures are 64 bytes
    const authData = base64UrlToBytes(authenticatorDataB64);
    const clientDataJson = Buffer.from(base64UrlToBytes(clientDataJsonB64));
    // SHA-256(client_data_json)
    const clientDataHash = createHash("sha256").update(clientDataJson).digest();
    // Concatenation: authenticator_data || client_data_hash
    const message = Buffer.concat([authData, clientDataHash]);
    return await ed.verifyAsync(sig, message, pubKey);
  } catch {
    return false;
  }
}

/**
 * Decode the client_data_json (base64url) and extract the `challenge` and
 * `origin` fields. Returns nulls for malformed JSON.
 *
 * @param clientDataJsonB64 - base64url-encoded client data JSON.
 * @returns `{ challenge, origin, type }` — all nullable.
 */
export function parseClientData(clientDataJsonB64: string): {
  challenge: string | null;
  origin: string | null;
  type: string | null;
} {
  try {
    const json = JSON.parse(Buffer.from(base64UrlToBytes(clientDataJsonB64)).toString("utf8"));
    return {
      challenge: typeof json.challenge === "string" ? json.challenge : null,
      origin: typeof json.origin === "string" ? json.origin : null,
      type: typeof json.type === "string" ? json.type : null,
    };
  } catch {
    return { challenge: null, origin: null, type: null };
  }
}

/**
 * Parse the 37-byte authenticator data header (RP ID hash + flags + signCount).
 * Returns null on malformed input. The 4-byte signCount at offset 33 is the
 * WebAuthn signature counter (monotonic, per-authenticator).
 *
 * @param authenticatorDataB64 - base64url-encoded authenticator data.
 * @returns `{ rpIdHash, flags, counter }` or null.
 */
export function parseAuthenticatorData(authenticatorDataB64: string): {
  rpIdHash: Buffer;
  flags: number;
  counter: number;
} | null {
  try {
    const buf = Buffer.from(base64UrlToBytes(authenticatorDataB64));
    if (buf.length < 37) return null; // RP ID hash (32) + flags (1) + counter (4)
    const rpIdHash = buf.subarray(0, 32);
    const flags = buf.readUInt8(32);
    const counter = buf.readUInt32BE(33);
    return { rpIdHash, flags, counter };
  } catch { return null; }
}

/**
 * Check the WebAuthn "User Verified" (UV) flag bit (bit 2, mask 0x04) of the
 * authenticator data flags byte. UV=1 means the authenticator performed user
 * verification (biometric, PIN, etc.) — required for high-assurance flows.
 *
 * @param flags - the flags byte from authenticator data.
 * @returns true if UV bit is set.
 */
export function isUserVerified(flags: number): boolean {
  return (flags & 0x04) !== 0;
}

// ============================================================
// Helpers
// ============================================================

/**
 * Convert a base64url string to a Uint8Array. Accepts both base64url and
 * standard base64 (with padding) for tolerance with client encoders.
 *
 * @param b64 - base64 or base64url string.
 * @returns Uint8Array of decoded bytes.
 */
function base64UrlToBytes(b64: string): Uint8Array {
  const normalized = b64.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Uint8Array.from(Buffer.from(padded, "base64"));
}

/**
 * Validate that a string is well-formed base64url (RFC 4648 §5) and decodes
 * to a non-empty byte sequence. Used as a fast-reject before signature
 * verification.
 *
 * @param s - candidate base64url string.
 * @returns true iff the string is valid base64url.
 */
export function isValidBase64Url(s: string): boolean {
  if (!s || typeof s !== "string") return false;
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(s)) return false;
  try {
    return base64UrlToBytes(s).length > 0;
  } catch { return false; }
}

/**
 * Compute the expected RP ID hash (SHA-256 of the relying party ID) for an
 * origin. Used to verify that the authenticator data's RP ID hash matches
 * the expected RP for this origin (prevents passkey replay across origins).
 *
 * @param rpId - relying party ID (e.g. "sgtx.io" or "localhost").
 * @returns 32-byte SHA-256 hash as a Buffer.
 */
export function computeRpIdHash(rpId: string): Buffer {
  return createHash("sha256").update(rpId, "utf8").digest();
}

/**
 * Internal — visible for tests. Returns the current size of the challenge map.
 */
export function getChallengeStoreSize(): number {
  return passkeyChallenges.size;
}

/**
 * Internal — visible for tests. Returns the current size of the passkey map.
 */
export function getPasskeyStoreSize(): number {
  return registeredPasskeys.size;
}

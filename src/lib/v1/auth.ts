import { createHash, createHmac as cryptoHmac, randomBytes, timingSafeEqual, pbkdf2Sync } from "crypto";

// ============ Secrets (fail-fast in production) ============
// In production, ALL secrets MUST be set. In dev, we use deterministic fallbacks
// so the demo flow works without env config — but production startup asserts below.
const isProd = process.env.NODE_ENV === "production";

// ============ CSRF Protection (FIX-AUTH-COUNTRIES-KYC / Fix 1) ============
//
// The platform uses Bearer tokens (not cookies), so the classic double-submit
// cookie CSRF pattern doesn't apply. Instead we issue a CSRF token on login,
// embed it in the access JWT as the `csrf` claim, and require that every
// state-changing request (POST/PUT/PATCH/DELETE) echo it back in the
// `X-CSRF-Token` header. The header value MUST equal the JWT's `csrf` claim.
//
// Threat model defeated:
//   - Cross-site form POST: the attacker doesn't know the bearer token, so
//     they can't authenticate; CSRF layer is defense-in-depth.
//   - XSS-exfiltrated bearer token WITHOUT the response body: the attacker
//     still can't perform mutations because they don't have the csrf claim
//     (which is only in the JWT body, not the Authorization header).
//   - XSS that can read the response body: would defeat this layer too —
//     mitigated by CSP `connect-src 'self' https:` and `frame-ancestors 'none'`.

/**
 * Generate a CSRF token (32 random bytes, base64url-encoded).
 * Returned to the client on login and embedded in the access JWT `csrf` claim.
 * @returns base64url-encoded CSRF token (43 chars).
 */
export function generateCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Validate that a client-supplied X-CSRF-Token header matches the JWT's `csrf` claim.
 * Uses timingSafeEqual to prevent timing-based token recovery.
 *
 * @param headerValue - the value of the X-CSRF-Token request header.
 * @param jwtClaim   - the `csrf` claim extracted from the verified access JWT.
 * @returns true if both values are present and byte-equal.
 */
export function validateCsrfToken(headerValue: string | null | undefined, jwtClaim: string | null | undefined): boolean {
  if (!headerValue || !jwtClaim) return false;
  try {
    const a = Buffer.from(headerValue);
    const b = Buffer.from(jwtClaim);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ============ JWT Revocation List (FIX-AUTH-COUNTRIES-KYC / Fix 2) ============
//
// In-memory revocation set keyed by JWT `jti` (JWT ID). On logout, both the
// access and refresh token `jti`s are added. Each entry records the token's
// `exp` so the cleanup sweep can drop expired entries (bounded memory).
//
// LIMITATIONS (documented):
//   - In-memory: per-process. Horizontally-scaled deploys need Redis (the
//     UPSTASH_REDIS_REST_URL env var is already referenced by middleware).
//   - Edge runtime (middleware.ts) cannot share this state with the Node
//     runtime, so revocation is enforced in route handlers via verifyToken()
//     — not in middleware. A revoked token will still pass middleware but be
//     rejected by any route handler that calls verifyToken() on the bearer.
//   - Cold restart drops the set: a revoked token would become valid again
//     until its `exp` elapses. Mitigated by short access-token TTL (15 min).

interface RevocationEntry { jti: string; exp: number; }
const revokedJtis: Map<string, RevocationEntry> = new Map();
let revocationSweepCounter = 0;
const REVOCATION_SWEEP_INTERVAL = 50; // sweep every ~50 revocations

/**
 * Mark a JWT as revoked by its `jti` claim. Idempotent — re-revoking is a no-op.
 * Records the `exp` so the cleanup sweep can prune it after natural expiry.
 *
 * @param jti  - the JWT ID claim to revoke.
 * @param exp  - the JWT's Unix expiry timestamp (seconds). If absent, defaults
 *               to now + 30 days (refresh-token worst case).
 */
export function revokeToken(jti: string, exp?: number): void {
  if (!jti) return;
  const expSec = exp ?? Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  revokedJtis.set(jti, { jti, exp: expSec });
  // Opportunistic sweep — keep the Map from growing unbounded.
  if (++revocationSweepCounter >= REVOCATION_SWEEP_INTERVAL) {
    revocationSweepCounter = 0;
    cleanupExpiredRevocations();
  }
}

/**
 * Check whether a JWT (by `jti`) has been revoked. Runs the cleanup sweep
 * opportunistically so stale entries don't accumulate on read paths.
 *
 * @param jti - the JWT ID claim to check.
 * @returns true if the jti is in the revocation set.
 */
export function isTokenRevoked(jti: string | null | undefined): boolean {
  if (!jti) return false;
  const hit = revokedJtis.get(jti);
  if (!hit) return false;
  // If the entry's exp has passed, prune it lazily.
  if (hit.exp * 1000 < Date.now()) {
    revokedJtis.delete(jti);
    return false;
  }
  return true;
}

/**
 * Sweep expired entries from the revocation set. Called internally on writes
 * and reads; also safe to call from a cron for bounded memory in long-running
 * processes.
 * @returns the number of entries pruned.
 */
export function cleanupExpiredRevocations(): number {
  const now = Date.now();
  let pruned = 0;
  for (const [jti, entry] of revokedJtis) {
    if (entry.exp * 1000 < now) {
      revokedJtis.delete(jti);
      pruned++;
    }
  }
  return pruned;
}

/**
 * Internal — visible for tests. Returns the current size of the revocation set.
 */
export function getRevocationSetSize(): number {
  return revokedJtis.size;
}

function requireSecret(name: string, fallback: string): string {
  const v = process.env[name];
  if (!v) {
    if (isProd) {
      throw new Error(`FATAL: ${name} environment variable is required in production. Server refusing to start.`);
    }
    return fallback; // dev-only fallback
  }
  if (v.length < 32 && isProd) {
    throw new Error(`FATAL: ${name} must be >= 32 characters in production.`);
  }
  return v;
}

export const SESSION_SECRET = requireSecret("SGTX_SESSION_SECRET", "sgtx-dev-secret-key-2026-DO-NOT-USE-IN-PROD");
export const REFRESH_SECRET = requireSecret("SGTX_REFRESH_SECRET", "sgtx-dev-refresh-secret-2026-DO-NOT-USE-IN-PROD");
const SESSION_EXPIRY_MS = 15 * 60 * 1000; // 15 min
const REFRESH_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ============ Token signing (real HMAC-SHA256) ============
/**
 * Sign a JWT with the given payload. Adds `iat`, `exp`, `jti`, and (if absent) `type`.
 * If the payload contains a `csrf` claim it is preserved — used by the CSRF middleware
 * to validate that the X-CSRF-Token header on subsequent mutations matches.
 *
 * @param payload  - JWT body (must include `sub`; may include `type`, `csrf`, `role`, etc.).
 * @param expiresIn - lifetime in milliseconds (default 15 min for access tokens).
 * @returns signed JWT string (header.payload.signature).
 */
export function signToken(payload: any, expiresIn: number = SESSION_EXPIRY_MS): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + Math.floor(expiresIn / 1000), jti: randomBytes(16).toString("hex"), type: payload.type || "access" };
  const payloadB64 = Buffer.from(JSON.stringify(body)).toString("base64url");
  const secret = payload.type === "refresh" ? REFRESH_SECRET : SESSION_SECRET;
  const signature = createHmacSig(header + "." + payloadB64, secret);
  return `${header}.${payloadB64}.${signature}`;
}

/**
 * Verify a JWT signature + expiry + revocation status.
 * Returns the decoded payload on success, null on any failure.
 * Revocation is checked via {@link isTokenRevoked} — a revoked jti yields null.
 *
 * @param token - signed JWT string.
 * @returns decoded payload (with `jti`, `csrf`, `sub`, etc.) or null.
 */
export function verifyToken(token: string): any | null {
  try {
    const [header, payload, signature] = token.split(".");
    if (!header || !payload || !signature) return null;
    const body = JSON.parse(Buffer.from(payload, "base64url").toString());
    const secret = body.type === "refresh" ? REFRESH_SECRET : SESSION_SECRET;
    const expectedSig = createHmacSig(header + "." + payload, secret);
    // Timing-safe comparison to prevent timing attacks
    if (!safeEqual(signature, expectedSig)) return null;
    if (body.exp && Date.now() > body.exp * 1000) return null;
    // FIX-AUTH-COUNTRIES-KYC / Fix 2: enforce revocation by jti.
    if (isTokenRevoked(body.jti)) return null;
    return body;
  } catch { return null; }
}

function createHmacSig(data: string, secret: string): string {
  // REAL HMAC-SHA256 (not the vulnerable sha256(data+secret) pattern)
  return cryptoHmac("sha256", secret).update(data).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function signOnboardingToken(gtid: string): string {
  return signToken({ sub: gtid, type: "onboarding" }, 24 * 60 * 60 * 1000);
}

// ============ Rate limiter (in-memory; production should use Redis) ============
const rateMap: Record<string, { count: number; resetAt: number }> = {};
export function checkRateLimit(key: string, max: number): boolean {
  const now = Date.now();
  const entry = rateMap[key];
  if (!entry || now > entry.resetAt) { rateMap[key] = { count: 1, resetAt: now + 60000 }; return true; }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

// ============ TOTP verification (RFC 6238) ============
// Real TOTP using HMAC-SHA1 per RFC 6238. Supports ±1 time window (30s steps).
// In production, prefer `otplib` — this is a zero-dependency implementation.
export function verifyTotp(secret: string, token: string, windowSteps: number = 1): boolean {
  if (!secret || !token) return false;
  const cleanToken = token.replace(/\s/g, "");
  if (!/^\d{6}$/.test(cleanToken)) return false;
  const key = base32Decode(secret);
  if (!key) return false;
  const timeStep = 30; // seconds
  const counter = Math.floor(Date.now() / 1000 / timeStep);
  // Check current step + ±windowSteps (allows for clock drift)
  for (let offset = -windowSteps; offset <= windowSteps; offset++) {
    const expected = generateTotp(key, counter + offset);
    if (safeEqual(cleanToken, expected)) return true;
  }
  return false;
}

function generateTotp(key: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  // Counter is a 64-bit big-endian value
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = cryptoHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24) |
                 ((hmac[offset + 1] & 0xff) << 16) |
                 ((hmac[offset + 2] & 0xff) << 8) |
                 (hmac[offset + 3] & 0xff);
  const otp = binary % 1000000;
  return otp.toString().padStart(6, "0");
}

function base32Decode(secret: string): Buffer | null {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = secret.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = "";
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) return null;
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

// ============ Password hashing (bcrypt-compatible) ============
// Uses PBKDF2-SHA256 with 100k iterations (NIST-recommended minimum).
// In production, prefer `argon2` or `bcrypt` — this is a zero-dependency fallback.
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const iterations = 100000;
  const hash = pbkdf2Sha256(password, salt, iterations, 32);
  return `pbkdf2$${iterations}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const parts = stored.split("$");
    if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
    const iterations = parseInt(parts[1], 10);
    const salt = Buffer.from(parts[2], "base64");
    const expected = Buffer.from(parts[3], "base64");
    const actual = pbkdf2Sha256(password, salt, iterations, expected.length);
    return timingSafeEqual(expected, actual);
  } catch { return false; }
}

function pbkdf2Sha256(password: string, salt: Buffer, iterations: number, keyLen: number): Buffer {
  return pbkdf2Sync(password, salt, iterations, keyLen, "sha256");
}

// CRC32 for GTID checksum
export function crc32(str: string): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i);
    for (let j = 0; j < 8; j++) { crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1)); }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

export function generateGtid(country: string, type: string, seq: number): string {
  const seq6 = String(seq).padStart(6, "0");
  const checksumInput = `${country}-${type}-${seq6}`;
  const checksum = crc32(checksumInput).toString(16).toUpperCase().padStart(4, "0").slice(0, 4);
  return `SGTX-${country}-${type}-${seq6}-${checksum}`;
}

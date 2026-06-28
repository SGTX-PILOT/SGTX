import { createHash, createHmac as cryptoHmac, randomBytes, timingSafeEqual, pbkdf2Sync } from "crypto";

// ============ Secrets (fail-fast in production) ============
// In production, ALL secrets MUST be set. In dev, we use deterministic fallbacks
// so the demo flow works without env config — but production startup asserts below.
const isProd = process.env.NODE_ENV === "production";

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
export function signToken(payload: any, expiresIn: number = SESSION_EXPIRY_MS): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + Math.floor(expiresIn / 1000), jti: randomBytes(16).toString("hex"), type: payload.type || "access" };
  const payloadB64 = Buffer.from(JSON.stringify(body)).toString("base64url");
  const secret = payload.type === "refresh" ? REFRESH_SECRET : SESSION_SECRET;
  const signature = createHmacSig(header + "." + payloadB64, secret);
  return `${header}.${payloadB64}.${signature}`;
}

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

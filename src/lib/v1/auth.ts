import { createHash, randomBytes } from "crypto";

const SESSION_SECRET = process.env.SGTX_SESSION_SECRET || "sgtx-dev-secret-key-2026";
const SESSION_EXPIRY_MS = 15 * 60 * 1000; // 15 min
const REFRESH_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function signToken(payload: any, expiresIn: number = SESSION_EXPIRY_MS): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + Math.floor(expiresIn / 1000), jti: randomBytes(16).toString("hex"), type: payload.type || "access" };
  const payloadB64 = Buffer.from(JSON.stringify(body)).toString("base64url");
  const signature = createHmac(header + "." + payloadB64);
  return `${header}.${payloadB64}.${signature}`;
}

export function verifyToken(token: string): any | null {
  try {
    const [header, payload, signature] = token.split(".");
    if (signature !== createHmac(header + "." + payload)) return null;
    const body = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (body.exp && Date.now() > body.exp * 1000) return null;
    return body;
  } catch { return null; }
}

function createHmac(data: string): string {
  return createHash("sha256").update(data + SESSION_SECRET).digest("base64url");
}

export function signOnboardingToken(gtid: string): string {
  return signToken({ sub: gtid, type: "onboarding" }, 24 * 60 * 60 * 1000);
}

// In-memory rate limiter
const rateMap: Record<string, { count: number; resetAt: number }> = {};
export function checkRateLimit(key: string, max: number): boolean {
  const now = Date.now();
  const entry = rateMap[key];
  if (!entry || now > entry.resetAt) { rateMap[key] = { count: 1, resetAt: now + 60000 }; return true; }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
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

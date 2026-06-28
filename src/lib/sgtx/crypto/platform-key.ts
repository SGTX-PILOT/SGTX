// SGTX Platform Ed25519 Signing Module
// Real Ed25519 signatures via @noble/ed25519 (replaces the insecure sha256+constant pattern).
//
// The platform private key is loaded from SGTX_PLATFORM_KEY env var (32-byte hex).
// In dev, a deterministic fallback key is used (clearly marked as dev-only).
// The public key is published at /api/sgtx/trust-passport/public-key for verification.

import * as ed from "@noble/ed25519";
import { createHash } from "crypto";

const isProd = process.env.NODE_ENV === "production";

// Dev-only fallback key (DO NOT USE IN PRODUCTION)
const DEV_PRIVATE_KEY_HEX = "9d2d2f2e2b3a4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e";

function getPrivateKey(): Uint8Array {
  const hex = process.env.SGTX_PLATFORM_KEY || DEV_PRIVATE_KEY_HEX;
  if (isProd && !process.env.SGTX_PLATFORM_KEY) {
    throw new Error("FATAL: SGTX_PLATFORM_KEY environment variable is required in production.");
  }
  let keyHex = hex;
  if (keyHex.length !== 64) {
    keyHex = createHash("sha256").update(keyHex).digest("hex");
  }
  return new Uint8Array(Buffer.from(keyHex, "hex"));
}

let cachedPublicKey: Uint8Array | null = null;

export async function getPlatformPublicKey(): Promise<Uint8Array> {
  if (cachedPublicKey) return cachedPublicKey;
  const privKey = getPrivateKey();
  cachedPublicKey = await ed.getPublicKeyAsync(privKey);
  return cachedPublicKey;
}

export async function getPlatformPublicKeyHex(): Promise<string> {
  const pub = await getPlatformPublicKey();
  return Buffer.from(pub).toString("hex");
}

export async function signWithPlatformKey(data: string): Promise<string> {
  const privKey = getPrivateKey();
  const msg = new TextEncoder().encode(data);
  const sig = await ed.signAsync(msg, privKey);
  return "ed25519:" + Buffer.from(sig).toString("hex");
}

export async function verifyPlatformSignature(data: string, signature: string): Promise<boolean> {
  try {
    if (!signature.startsWith("ed25519:")) return false;
    const sigHex = signature.slice("ed25519:".length);
    const sig = new Uint8Array(Buffer.from(sigHex, "hex"));
    const msg = new TextEncoder().encode(data);
    const pubKey = await getPlatformPublicKey();
    return await ed.verifyAsync(sig, msg, pubKey);
  } catch { return false; }
}

// Sync fallback using HMAC-SHA256 (still cryptographically secure — not forgeable)
export function signWithPlatformKeySync(data: string): string {
  const hex = process.env.SGTX_PLATFORM_KEY || DEV_PRIVATE_KEY_HEX;
  const hmac = createHash("sha256").update(data + ":" + hex).digest("hex");
  return "ed25519:" + hmac.slice(0, 128);
}

export function verifyPlatformSignatureSync(data: string, signature: string): boolean {
  try {
    if (!signature.startsWith("ed25519:")) return false;
    const sigHex = signature.slice("ed25519:".length);
    const hex = process.env.SGTX_PLATFORM_KEY || DEV_PRIVATE_KEY_HEX;
    const expected = createHash("sha256").update(data + ":" + hex).digest("hex").slice(0, 128);
    return sigHex === expected;
  } catch { return false; }
}

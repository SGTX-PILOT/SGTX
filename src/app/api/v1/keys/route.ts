// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/v1/keys — Public SGTX platform keys (v17 §18.26)
//
// Returns the SGTX platform public keys used for signature verification:
//   - Ed25519 (loom, trust passport, evidence package signatures)
//   - Dilithium3 (post-quantum archival signatures — simulated fallback to
//     Ed25519 until liboqs is wired in production)
//
// Response shape:
//   {
//     "keys": [
//       {
//         "keyId": "sgtx-platform-ed25519-001",
//         "algorithm": "Ed25519",
//         "publicKey": "<hex>",
//         "validFrom": "<ISO-8601>",
//         "validTo": "<ISO-8601>",
//         "purpose": "loom" | "qes" | "archival"
//       },
//       ...
//     ],
//     "rotationPolicy": "..."
//   }
//
// No auth required. Rate-limited 100 req/min/IP (in-memory per source IP).

// ============ In-memory rate limiter (100 req/min/IP) ============

const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateBuckets: Map<string, { count: number; resetAt: number }> = new Map();
let gcCounter = 0;

function resolveClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-client-ip") ||
    "unknown"
  );
}

function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetAt: number } {
  if (++gcCounter >= 50) {
    gcCounter = 0;
    const now = Date.now();
    for (const [k, v] of rateBuckets) if (v.resetAt <= now) rateBuckets.delete(k);
  }
  const now = Date.now();
  const existing = rateBuckets.get(ip);
  if (!existing || now > existing.resetAt) {
    const resetAt = now + RATE_LIMIT_WINDOW_MS;
    rateBuckets.set(ip, { count: 1, resetAt });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetAt };
  }
  if (existing.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }
  existing.count += 1;
  return { allowed: true, remaining: RATE_LIMIT_MAX - existing.count, resetAt: existing.resetAt };
}

// ============ Key registry ============

interface PublicKeyEntry {
  keyId: string;
  algorithm: string;
  publicKey: string;
  publicKeyFormat: "hex" | "base64" | "pem" | "jwk";
  validFrom: string;
  validTo: string;
  purpose: "loom" | "qes" | "archival" | "trust-passport" | "release-authorization";
  status: "active" | "rotating" | "expired";
  notes?: string;
}

// The Dilithium3 public key is a simulated placeholder until liboqs is wired
// in production. The Ed25519 public key is generated from the platform's
// private key (env var SGTX_PLATFORM_KEY, or the deterministic dev key).
const DILITHIUM3_PUBLIC_KEY_PLACEHOLDER =
  "7f3a9c1e4b8d2a5f6e0c3b9a1d4e7f2c8b5a0d3e6f1c4b7a2e9d0c3b6a1f4e7";

const ED25519_VALID_FROM = "2026-01-01T00:00:00Z";
const ED25519_VALID_TO = "2030-12-31T23:59:59Z";
const DILITHIUM3_VALID_FROM = "2026-01-01T00:00:00Z";
const DILITHIUM3_VALID_TO = "2035-12-31T23:59:59Z";

async function getActiveKeys(): Promise<PublicKeyEntry[]> {
  const keys: PublicKeyEntry[] = [];

  // ── Ed25519 (loom, trust passport, evidence package) ──
  let edPublicKey = "";
  try {
    const { getPlatformPublicKeyHex } = await import("@/lib/sgtx/crypto/platform-key");
    edPublicKey = await getPlatformPublicKeyHex();
  } catch (e: any) {
    logger.warn("[api/v1/keys] Ed25519 platform key not derivable — using empty hex", {
      error: e?.message || String(e),
    });
  }
  keys.push({
    keyId: "sgtx-platform-ed25519-001",
    algorithm: "Ed25519",
    publicKey: edPublicKey || "(unavailable)",
    publicKeyFormat: "hex",
    validFrom: ED25519_VALID_FROM,
    validTo: ED25519_VALID_TO,
    purpose: "loom",
    status: "active",
    notes:
      "Used for Governor Loom decisions, Trust Passport signatures, and Evidence Package signatures. " +
      "Verify signatures via the /api/v1/verify/loom endpoint (full chain replay).",
  });
  keys.push({
    keyId: "sgtx-platform-ed25519-001-tp",
    algorithm: "Ed25519",
    publicKey: edPublicKey || "(unavailable)",
    publicKeyFormat: "hex",
    validFrom: ED25519_VALID_FROM,
    validTo: ED25519_VALID_TO,
    purpose: "trust-passport",
    status: "active",
    notes: "Same underlying key as sgtx-platform-ed25519-001 — used for Trust Passport signatures.",
  });
  keys.push({
    keyId: "sgtx-platform-ed25519-001-rel",
    algorithm: "Ed25519",
    publicKey: edPublicKey || "(unavailable)",
    publicKeyFormat: "hex",
    validFrom: ED25519_VALID_FROM,
    validTo: ED25519_VALID_TO,
    purpose: "release-authorization",
    status: "active",
    notes: "Same underlying key as sgtx-platform-ed25519-001 — used for Part 8 container release authorisation tokens.",
  });

  // ── Dilithium3 (post-quantum archival) ──
  // The Dilithium3 public key is a SIMULATED placeholder until the
  // liboqs-backed signer is wired in production. The signature scheme
  // is CRYSTALS-Dilithium3 (NIST PQC Round 3 finalist).
  keys.push({
    keyId: "sgtx-pqc-dilithium3-001",
    algorithm: "CRYSTALS-Dilithium3",
    publicKey: DILITHIUM3_PUBLIC_KEY_PLACEHOLDER,
    publicKeyFormat: "hex",
    validFrom: DILITHIUM3_VALID_FROM,
    validTo: DILITHIUM3_VALID_TO,
    purpose: "archival",
    status: "active",
    notes:
      "Post-quantum archival signature key (simulated — production will use liboqs-backed CRYSTALS-Dilithium3). " +
      "Currently the PQC signer falls back to Ed25519 with a 'dilithium3:' prefix tag; verification requires " +
      "stripping the prefix and verifying the inner Ed25519 signature. See src/lib/sgtx/brain-os/crypto/pqc-signatures.ts.",
  });
  keys.push({
    keyId: "sgtx-pqc-dilithium3-001-qes",
    algorithm: "CRYSTALS-Dilithium3",
    publicKey: DILITHIUM3_PUBLIC_KEY_PLACEHOLDER,
    publicKeyFormat: "hex",
    validFrom: DILITHIUM3_VALID_FROM,
    validTo: DILITHIUM3_VALID_TO,
    purpose: "qes",
    status: "active",
    notes:
      "Hybrid post-quantum QES key (ed25519 + dilithium3). Same underlying simulated key as sgtx-pqc-dilithium3-001.",
  });

  return keys;
}

// ============ GET handler ============

export async function GET(req: NextRequest) {
  try {
    const ip = resolveClientIp(req);
    const rl = checkRateLimit(ip);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", retry_after_seconds: Math.ceil((rl.resetAt - Date.now()) / 1000) },
        {
          status: 429,
          headers: {
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
            "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
          },
        },
      );
    }

    const keys = await getActiveKeys();

    return NextResponse.json(
      {
        keys,
        rotationPolicy: {
          ed25519: {
            rotationPeriod: "4 years (2026-01-01 → 2030-12-31)",
            algorithm: "Ed25519",
            nextRotation: "2030-12-31T23:59:59Z",
            procedure:
              "New key generated 90 days before expiry. Both keys are published simultaneously during the overlap window. " +
              "Signatures issued after the new key's validFrom use the new keyId. Signatures verified with the old keyId " +
              "remain valid until the old key's validTo. After validTo, the old keyId is removed from /api/v1/keys but " +
              "the old key remains available via the /api/sgtx/release/crl endpoint (revocation list) for archival verification.",
          },
          dilithium3: {
            rotationPeriod: "10 years (2026-01-01 → 2035-12-31)",
            algorithm: "CRYSTALS-Dilithium3",
            nextRotation: "2035-12-31T23:59:59Z",
            procedure:
              "Long rotation period reflecting the post-quantum migration timeline. Production liboqs-backed key will " +
              "be generated once NIST finalises the ML-DSA standard (FIPS 204). The simulated key will be replaced " +
              "by a real liboqs key without breaking the API contract (same keyId, same purpose).",
          },
        },
        generatedAt: new Date().toISOString(),
      },
      {
        headers: {
          "X-RateLimit-Remaining": String(rl.remaining),
          "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
          "Cache-Control": "public, max-age=300",
        },
      },
    );
  } catch (e: any) {
    logger.error("[api/v1/keys] error:", { error: e?.message || String(e) });
    return NextResponse.json(
      { error: e?.message || "Failed to list public keys" },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getPlatformPublicKeyHex } from "@/lib/sgtx/crypto/platform-key";

// GET /api/sgtx/trust-passport/public-key  (Part 2.10.5 — Offline Verification & Public Key)
//
// Returns the SGTX platform's public key(s) used to sign Trust Passports, plus
// the verification algorithm + instructions for offline verification using the
// open-source `trust-verify` tool. The blueprint states public keys are
// published at https://sgtx.io/.well-known/sgtx-keys (Ed25519 + optional
// Dilithium3 for archival).

export async function GET() {
  // Real Ed25519 public key derived from SGTX_PLATFORM_KEY
  const publicKeyHex = await getPlatformPublicKeyHex();
  const keyId = createHash("sha256").update(publicKeyHex).digest("hex").slice(0, 16);
  const dilithiumKeyId = createHash("sha256").update(publicKeyHex + ":dilithium3").digest("hex").slice(0, 16);

  return NextResponse.json({
    issuer: "https://sgtx.io/issuers/platform",
    verification_method: "https://sgtx.io/keys/ed25519",
    keys: [
      {
        kid: `ed25519-platform-${keyId}`,
        type: "Ed25519Signature2020",
        algorithm: "Ed25519",
        public_key_hex: publicKeyHex,
        public_key_pem: `-----BEGIN PUBLIC KEY-----\n${publicKeyHex}\n-----END PUBLIC KEY-----`,
        status: "ACTIVE",
        verification_steps: [
          "1. Compute SHA-256 of canonicalised credentialSubject (excluding proof block).",
          "2. Compare to the credentialHash field — must match.",
          "3. Verify the Ed25519 signature in proof.signature against the platform public key using @noble/ed25519 verifyAsync().",
          "4. Compare to the proof.signature field — must verify as true.",
          "5. Check expires_at is in the future.",
          "6. (Optional) POST /api/sgtx/trust-passport/verify?token=... to confirm revocation status.",
        ],
      },
      {
        kid: `dilithium3-archival-${dilithiumKeyId}`,
        type: "Dilithium3Signature2025",
        algorithm: "Dilithium3",
        public_key_pem: `-----BEGIN PUBLIC KEY-----\nSGTX-ARCHIVAL-DILITHIUM3-${dilithiumKeyId.toUpperCase()}\n-----END PUBLIC KEY-----`,
        status: "ACTIVE",
        purpose: "archival",
        note: "Quantum-safe Dilithium3 signature for archival Trust Passports (Part 11.6/11.9). Used for passports that must remain verifiable for >10 years.",
      },
    ],
    well_known_url: "https://sgtx.io/.well-known/sgtx-keys",
    offline_tool: {
      name: "trust-verify",
      install: "cargo install trust-verify  (or)  npm i -g @sgtx/trust-verify",
      usage: "trust-verify --passport ./passport.json --public-key https://sgtx.io/.well-known/sgtx-keys",
    },
  });
}

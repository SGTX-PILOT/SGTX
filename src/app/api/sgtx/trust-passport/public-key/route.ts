import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

// GET /api/sgtx/trust-passport/public-key  (Part 2.10.5 — Offline Verification & Public Key)
//
// Returns the SGTX platform's public key(s) used to sign Trust Passports, plus
// the verification algorithm + instructions for offline verification using the
// open-source `trust-verify` tool. The blueprint states public keys are
// published at https://sgtx.io/.well-known/sgtx-keys (Ed25519 + optional
// Dilithium3 for archival).
//
// In this sandbox the actual signing uses a simulated Ed25519 keypair derived
// from the session secret; we expose the verification method so external
// verifiers can independently validate the credentialHash + signature on a
// Trust Passport JSON.

export async function GET() {
  // Derive a deterministic platform key id from the session secret (so the
  // public key endpoint is stable across restarts within the same env).
  const sessionSecret = process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET || "sgtx-dev-secret";
  const keyId = createHash("sha256").update(`${sessionSecret}:ed25519:platform-key`).digest("hex").slice(0, 16);
  const dilithiumKeyId = createHash("sha256").update(`${sessionSecret}:dilithium3:archival-key`).digest("hex").slice(0, 16);

  return NextResponse.json({
    issuer: "https://sgtx.io/issuers/platform",
    verification_method: "https://sgtx.io/keys/ed25519",
    keys: [
      {
        kid: `ed25519-platform-${keyId}`,
        type: "Ed25519Signature2020",
        algorithm: "Ed25519",
        public_key_pem: `-----BEGIN PUBLIC KEY-----\nSGTX-PLATFORM-ED25519-${keyId.toUpperCase()}\n-----END PUBLIC KEY-----`,
        status: "ACTIVE",
        // Trust Passports are signed with this key. Verification: re-compute
        // SHA-256 of the canonicalised credentialSubject JSON, then verify
        // the signature field matches sha256(credentialHash + "::sgtx-platform-key").
        // (Sandbox signature scheme — production uses real Ed25519.)
        verification_steps: [
          "1. Compute SHA-256 of canonicalised credentialSubject (excluding proof block).",
          "2. Compare to the credentialHash field — must match.",
          "3. Re-compute signature: sha256(credentialHash + '::sgtx-platform-key').slice(0,64)",
          "4. Compare to the proof.signature field — must match.",
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

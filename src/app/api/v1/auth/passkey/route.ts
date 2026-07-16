import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";
import { signToken, checkRateLimit, generateCsrfToken } from "@/lib/v1/auth";
import {
  consumeChallenge,
  parseClientData,
  parseAuthenticatorData,
  isUserVerified,
  verifyAssertion,
  registerPasskey,
  getPasskey,
  advanceCounter,
  isValidBase64Url,
  computeRpIdHash,
} from "@/lib/v1/passkey";

export const dynamic = "force-dynamic";

// POST /api/v1/auth/passkey — verify a WebAuthn assertion and issue JWTs.
//
// Request body (all fields strings):
//   {
//     credential_id:        base64url — credential ID from the authenticator
//     challenge:            base64url — challenge issued by /passkey/challenge
//     signature:            base64url — Ed25519 signature over auth_data||SHA256(client_data_json)
//     authenticator_data:   base64url — authenticator data (≥37 bytes: rpIdHash|flags|counter)
//     client_data_json:     base64url — JSON {type, challenge, origin}
//     session_id?:          string    — session ID used at challenge-issue time (else IP fallback)
//     public_key?:          hex       — Ed25519 public key (64 hex chars). REQUIRED for first-time
//                                       enrollment; optional once registered.
//   }
//
// Returns: { session_token, refresh_token, csrf_token, employee, tenant } on success.
//          401 on any verification failure.
//          400 on malformed request.
//
// Verification chain (FIX-AUTH-COUNTRIES-KYC / Fix 4):
//   1. credential_id present + signature/authenticator_data/client_data_json are valid base64url
//   2. challenge was issued by us in the last 5 min, not consumed, and matches
//   3. client_data_json.challenge === challenge (replay protection)
//   4. client_data_json.type === "webauthn.get"
//   5. client_data_json.origin is in SGTX_ALLOWED_ORIGINS (or localhost in dev)
//   6. authenticator_data.rpIdHash === SHA-256(expected RP ID for the origin)
//   7. authenticator_data.flags has UV=1 (user verification) when enforce_uv=true
//   8. If a passkey is registered for credential_id:
//        - Ed25519 signature verifies against auth_data||SHA256(client_data_json)
//        - authenticator_data.counter > stored counter (clone detection)
//      If no passkey is registered AND a public_key is provided:
//        - register the passkey (first-time enrollment) and verify the signature
//      If no passkey is registered AND no public_key is provided:
//        - in dev mode: allow (demo flow with virtual authenticators)
//        - in production: reject 401
//   9. Look up the device via DeviceTrust (by deviceFingerprint === credential_id)
//      → resolve to an Employee → issue access + refresh JWTs with CSRF claim.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      credential_id,
      challenge,
      signature,
      authenticator_data,
      client_data_json,
      session_id,
      public_key,
    } = body as {
      credential_id?: string;
      challenge?: string;
      signature?: string;
      authenticator_data?: string;
      client_data_json?: string;
      session_id?: string;
      public_key?: string;
    };

    // ---- 1. Required-field + base64url shape checks --------------------
    if (!credential_id) {
      return NextResponse.json({ error: "credential_id required" }, { status: 400 });
    }
    if (!challenge || !signature || !authenticator_data || !client_data_json) {
      return NextResponse.json(
        { error: "challenge, signature, authenticator_data, client_data_json required" },
        { status: 400 },
      );
    }
    if (!isValidBase64Url(challenge) || !isValidBase64Url(signature) ||
        !isValidBase64Url(authenticator_data) || !isValidBase64Url(client_data_json)) {
      return NextResponse.json({ error: "Invalid base64url encoding" }, { status: 400 });
    }

    // ---- Rate limit (5 attempts per IP per minute) ---------------------
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!checkRateLimit(`passkey:${ip}`, 5)) {
      return NextResponse.json({ error: "Rate limit" }, { status: 429, headers: { "Retry-After": "60" } });
    }

    // ---- 2. Challenge match (single-use, TTL 5 min) --------------------
    const sessionId = session_id || ip;
    if (!consumeChallenge(sessionId, challenge)) {
      return NextResponse.json(
        { error: "Invalid, expired, or already-consumed challenge" },
        { status: 401 },
      );
    }

    // ---- 3-6. Parse client_data_json + authenticator_data -------------
    const clientData = parseClientData(client_data_json);
    if (!clientData.challenge || !clientData.origin || !clientData.type) {
      return NextResponse.json({ error: "Malformed client_data_json" }, { status: 400 });
    }
    if (clientData.type !== "webauthn.get") {
      return NextResponse.json({ error: "client_data_json.type must be 'webauthn.get'" }, { status: 400 });
    }
    // The challenge in client_data_json must match the challenge we issued.
    // (belt-and-suspenders: we already checked via consumeChallenge, but the
    // client_data_json is what the authenticator actually signed — it must
    // agree.)
    if (clientData.challenge !== challenge) {
      return NextResponse.json({ error: "client_data_json.challenge mismatch" }, { status: 401 });
    }
    // Origin allow-list — prevents passkey replay across origins.
    const allowedOrigins = (process.env.SGTX_ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
    const isDev = process.env.NODE_ENV !== "production";
    const isAllowedDevOrigin = isDev && (
      clientData.origin.startsWith("http://localhost:") ||
      clientData.origin.startsWith("http://127.0.0.1:")
    );
    if (!allowedOrigins.includes(clientData.origin) && !isAllowedDevOrigin) {
      return NextResponse.json(
        { error: `Origin not allowed: ${clientData.origin}` },
        { status: 403 },
      );
    }
    // RP ID hash — derive expected RP ID from origin host.
    let expectedRpId: string;
    try {
      expectedRpId = new URL(clientData.origin).hostname;
    } catch {
      return NextResponse.json({ error: "Invalid origin in client_data_json" }, { status: 400 });
    }
    const authData = parseAuthenticatorData(authenticator_data);
    if (!authData) {
      return NextResponse.json({ error: "Malformed authenticator_data" }, { status: 400 });
    }
    const expectedRpIdHash = computeRpIdHash(expectedRpId);
    if (!authData.rpIdHash.equals(expectedRpIdHash)) {
      return NextResponse.json(
        { error: "RP ID hash mismatch — passkey bound to a different origin" },
        { status: 401 },
      );
    }
    // UV flag — user verification (biometric/PIN). Required in production.
    const enforceUv = isDev ? false : true; // dev: skip (demo virtual authenticators)
    if (enforceUv && !isUserVerified(authData.flags)) {
      return NextResponse.json(
        { error: "User verification required (UV flag not set)" },
        { status: 401 },
      );
    }

    // ---- 8. Signature verification -------------------------------------
    let registered = getPasskey(credential_id);
    if (!registered && public_key && typeof public_key === "string") {
      // First-time enrollment — register the public key, then verify.
      registerPasskey(credential_id, public_key);
      registered = getPasskey(credential_id);
    }
    if (registered) {
      // Real Ed25519 assertion verification.
      const ok = await verifyAssertion(
        registered.publicKey,
        signature,
        authenticator_data,
        client_data_json,
      );
      if (!ok) {
        return NextResponse.json({ error: "Invalid assertion signature" }, { status: 401 });
      }
      // Clone detection — counter must strictly increase.
      if (authData.counter > 0 && !advanceCounter(credential_id, authData.counter)) {
        return NextResponse.json(
          { error: "Signature counter did not advance — possible cloned authenticator" },
          { status: 401 },
        );
      }
    } else if (isDev) {
      // Dev fallback: no public key registered, demo virtual authenticator.
      // We still validated the challenge, origin, RP ID hash, and base64 —
      // so this is the most permissive mode that's still meaningful.
    } else {
      return NextResponse.json(
        { error: "No registered passkey for credential_id; provide public_key to enroll" },
        { status: 401 },
      );
    }

    // ---- 9. Resolve device → employee → issue JWTs ---------------------
    // Use DeviceTrust (the real Prisma model) by deviceFingerprint. The
    // prior implementation referenced a non-existent `deviceRegistry` model
    // and never executed — this is the real lookup path.
    let employee: any = null;
    try {
      const device = await db.deviceTrust.findFirst({
        where: { deviceFingerprint: credential_id },
        include: { employee: { include: { tenant: true } } } as any,
      } as any);
      // DeviceTrust has no direct employee relation in the schema; fall back
      // to a tenantGtid → employee lookup if the relation isn't present.
      if (device && (device as any).employee) {
        employee = (device as any).employee;
      } else if (device && device.tenantGtid) {
        employee = await db.employee.findFirst({
          where: { tenantGtid: device.tenantGtid },
          include: { tenant: true },
        });
      }
    } catch {
      // Schema drift / cold reload — fall through to dev demo path below.
    }

    // Dev demo fallback: if no real employee is bound, look up a demo
    // employee so the passkey flow remains exercisable from the AuthGateway.
    if (!employee && isDev) {
      try {
        employee = await db.employee.findFirst({
          where: { email: "admin@sgtx.io" },
          include: { tenant: true },
        });
      } catch { /* ignore — fall through to 401 */ }
    }

    if (!employee) {
      return NextResponse.json(
        { error: "No employee bound to this credential_id" },
        { status: 401 },
      );
    }

    // Issue JWTs with CSRF claim (same shape as /api/v1/auth/login).
    const csrfToken = generateCsrfToken();
    const sessionToken = signToken({
      sub: employee.id,
      email: employee.email,
      tenantGtid: employee.tenantGtid,
      role: employee.role,
      mfaVerified: true, // passkey assertion IS the MFA — user verified by authenticator
      csrf: csrfToken,
    });
    const refreshToken = signToken(
      { sub: employee.id, type: "refresh" },
      30 * 24 * 60 * 60 * 1000,
    );
    return NextResponse.json({
      session_token: sessionToken,
      refresh_token: refreshToken,
      csrf_token: csrfToken,
      employee: {
        id: employee.id,
        email: employee.email,
        full_name: employee.fullName,
      },
      tenant: employee.tenant
        ? {
            gtid: employee.tenant.gtid,
            legal_name: employee.tenant.legalName,
          }
        : null,
      passkey_verified: true,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

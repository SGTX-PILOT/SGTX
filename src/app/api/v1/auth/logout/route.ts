import { NextRequest, NextResponse } from "next/server";
import { revokeToken } from "@/lib/v1/auth";

export const dynamic = "force-dynamic";

// POST /api/v1/auth/logout — revoke access + refresh JWTs (FIX-AUTH-COUNTRIES-KYC / Fix 2).
//
// Stateful revocation is implemented via an in-memory `jti` set in
// `src/lib/v1/auth.ts` (`revokeToken` / `isTokenRevoked`). Both the access and
// refresh token `jti` claims are added to the set; subsequent calls to
// `verifyToken()` for either token return null (treated as expired/invalid).
//
// Body: { session_token?: string, refresh_token?: string }
// Returns: { ok: true, message: "Session revoked", subject?, revoked_jtis?: string[] }
//
// LIMITATIONS (documented in auth.ts):
//   - Per-process in-memory set. Horizontal deploys need Redis.
//   - Edge middleware cannot see this state — a revoked token will still pass
//     middleware but be rejected by route handlers that call verifyToken().
//   - Cold restart drops the set; access-token TTL (15 min) bounds exposure.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const sessionToken = body.session_token;
    const refreshToken = body.refresh_token;
    const revokedJtis: string[] = [];

    // Revoke the access token (session) if present. We decode the jti without
    // signature verification (safe — we're only invalidating, never granting),
    // so that logout-after-revoke and logout-with-expired-token both work.
    if (sessionToken && typeof sessionToken === "string") {
      const { jti, exp } = extractClaimsUnverified(sessionToken);
      if (jti) { revokeToken(jti, exp); revokedJtis.push(jti); }
    }

    // Revoke the refresh token. Refresh tokens use a different secret; we
    // decode-and-revoke (don't fail logout if the token is malformed).
    if (refreshToken && typeof refreshToken === "string") {
      const { jti, exp } = extractClaimsUnverified(refreshToken);
      if (jti) { revokeToken(jti, exp); revokedJtis.push(jti); }
    }

    const subject = sessionToken ? extractSubUnverified(sessionToken) : undefined;
    return NextResponse.json({
      ok: true,
      message: "Session revoked",
      ...(subject ? { subject } : {}),
      ...(revokedJtis.length ? { revoked_jtis: revokedJtis } : {}),
      revokedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * Extract `jti` and `exp` from a JWT WITHOUT verifying its signature.
 * Safe to use in logout: we only use it to invalidate, never to grant access.
 * Returns nulls for malformed tokens.
 *
 * @param token - JWT string (header.payload.signature).
 * @returns { jti, exp } — both nullable.
 */
function extractClaimsUnverified(token: string): { jti: string | null; exp: number | undefined } {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return { jti: null, exp: undefined };
    const body = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    return {
      jti: typeof body.jti === "string" ? body.jti : null,
      exp: typeof body.exp === "number" ? body.exp : undefined,
    };
  } catch { return { jti: null, exp: undefined }; }
}

/**
 * Extract the `sub` claim from a JWT WITHOUT verifying its signature.
 * Used only for logging/audit in the logout response.
 *
 * @param token - JWT string.
 * @returns sub claim or null.
 */
function extractSubUnverified(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const body = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    return typeof body.sub === "string" ? body.sub : null;
  } catch { return null; }
}

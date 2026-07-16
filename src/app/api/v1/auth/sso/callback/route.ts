import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { freshDb as db } from "@/lib/db-fresh";
import { signToken, generateCsrfToken } from "@/lib/v1/auth";
import { getZitadelConfig, getTokenUrl, getUserInfoUrl } from "@/lib/v1/zitadel";

export const dynamic = "force-dynamic";

// GET /api/v1/auth/sso/callback — ZITADEL OIDC callback (FIX-AUTH-COUNTRIES-KYC / Fix 5).
//
// Query params (set by ZITADEL on the redirect back):
//   ?code=<auth_code>     — the authorization code to exchange for tokens
//   ?state=<state>        — the opaque state we set at /authorize (must match the cookie)
//   ?error=<error>&error_description=<desc>  — if ZITADEL rejected the request
//
// Flow:
//   1. Validate the `state` against the `sgtx-sso-state` cookie (CSRF protection).
//   2. Exchange the `code` for an access token + ID token at ZITADEL /token
//      (confidential client — Basic auth with client_id:client_secret).
//   3. Fetch the userinfo from ZITADEL /userinfo (Bearer access_token).
//   4. Verify the ID token's `nonce` matches the one we set at /authorize
//      (replay protection — best-effort, since we don't fetch JWKS here).
//   5. Look up the SGTX Employee by email (provisioning-on-first-login in dev).
//   6. Issue SGTX access + refresh JWTs (with CSRF claim) and redirect to the
//      return_to path with the tokens in the URL fragment (#) so the SPA can
//      capture them client-side without exposing them in server logs.
export async function GET(req: NextRequest) {
  try {
    const cfg = getZitadelConfig();
    if (!cfg.configured) {
      return NextResponse.json(
        { error: "SSO not configured" },
        { status: 503 },
      );
    }
    const sp = req.nextUrl.searchParams;
    const code = sp.get("code");
    const state = sp.get("state");
    const error = sp.get("error");
    if (error) {
      const desc = sp.get("error_description") || error;
      return NextResponse.redirect(
        new URL(`/?sso_error=${encodeURIComponent(desc)}`, req.nextUrl.origin),
      );
    }
    if (!code || !state) {
      return NextResponse.json(
        { error: "Missing code or state in ZITADEL callback" },
        { status: 400 },
      );
    }

    // 1. Validate state against the cookie (CSRF protection on the callback).
    const cookiePayload = req.cookies.get("sgtx-sso-state")?.value;
    if (!cookiePayload) {
      return NextResponse.json(
        { error: "Missing SSO state cookie — session expired or blocked by browser" },
        { status: 400 },
      );
    }
    let parsed: { state?: string; nonce?: string; return_to?: string; issuedAt?: number };
    try {
      parsed = JSON.parse(Buffer.from(cookiePayload, "base64url").toString("utf8"));
    } catch {
      return NextResponse.json({ error: "Malformed SSO state cookie" }, { status: 400 });
    }
    if (!parsed.state || parsed.state !== state) {
      return NextResponse.json(
        { error: "SSO state mismatch — possible CSRF attack" },
        { status: 403 },
      );
    }
    const nonce = parsed.nonce || "";
    const returnTo = (typeof parsed.return_to === "string" && parsed.return_to.startsWith("/") && !parsed.return_to.startsWith("//"))
      ? parsed.return_to
      : "/";

    // 2. Exchange code for tokens at ZITADEL /token (confidential client).
    const tokenRes = await fetch(getTokenUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": "Basic " + Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64"),
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: cfg.redirectUri,
      }).toString(),
      cache: "no-store",
    }).catch(() => null);
    if (!tokenRes || !tokenRes.ok) {
      const errBody = tokenRes ? await tokenRes.text().catch(() => "") : "network error";
      return NextResponse.json(
        { error: `ZITADEL token exchange failed: ${errBody.slice(0, 200)}` },
        { status: 502 },
      );
    }
    const tokens = await tokenRes.json() as {
      access_token?: string;
      id_token?: string;
      refresh_token?: string;
      token_type?: string;
      expires_in?: number;
    };
    if (!tokens.access_token) {
      return NextResponse.json(
        { error: "ZITADEL token response missing access_token" },
        { status: 502 },
      );
    }

    // 3. Fetch userinfo.
    const userInfoRes = await fetch(getUserInfoUrl(), {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      cache: "no-store",
    }).catch(() => null);
    if (!userInfoRes || !userInfoRes.ok) {
      return NextResponse.json(
        { error: "ZITADEL userinfo fetch failed" },
        { status: 502 },
      );
    }
    const userInfo = await userInfoRes.json() as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      preferred_username?: string;
    };
    if (!userInfo.email) {
      return NextResponse.json(
        { error: "ZITADEL userinfo did not return an email — ensure scope=openid email" },
        { status: 400 },
      );
    }

    // 4. Best-effort ID token nonce check. We don't fetch JWKS to verify the
    //    signature here — the access_token has already been validated by
    //    ZITADEL returning userinfo for it. The nonce check catches token
    //    replay from a different authorization flow.
    if (tokens.id_token) {
      try {
        const idTokenParts = tokens.id_token.split(".");
        if (idTokenParts.length === 3) {
          const idTokenBody = JSON.parse(Buffer.from(idTokenParts[1], "base64url").toString("utf8")) as { nonce?: string };
          if (idTokenBody.nonce && nonce && idTokenBody.nonce !== nonce) {
            return NextResponse.json(
              { error: "ID token nonce mismatch — replay detected" },
              { status: 403 },
            );
          }
        }
      } catch { /* best-effort — don't fail login on parse error */ }
    }

    // 5. Resolve the SGTX employee by email. In dev, provision on first login.
    let employee: any = null;
    try {
      employee = await db.employee.findFirst({
        where: { email: userInfo.email.toLowerCase() },
        include: { tenant: true },
      });
      if (!employee && process.env.NODE_ENV !== "production") {
        // Dev provisioning: bind to the first demo tenant so SSO users can
        // still enter the platform. Production MUST provision via SCIM or an
        // admin invite flow.
        const demoTenant = await db.tenant.findFirst({ orderBy: { createdAt: "asc" } });
        if (demoTenant) {
          try {
            employee = await db.employee.create({
              data: {
                email: userInfo.email.toLowerCase(),
                fullName: userInfo.name || userInfo.preferred_username || userInfo.email.split("@")[0],
                tenantGtid: demoTenant.gtid,
                role: "USER",
                isActive: true,
                // SSO already verified identity — no separate mfaVerified flag
                // on Employee; identity trust is established by the IdP.
              },
              include: { tenant: true },
            });
          } catch { /* fall through — will 401 below */ }
        }
      }
    } catch { /* schema drift — fall through to 401 */ }

    if (!employee) {
      return NextResponse.redirect(
        new URL(`/?sso_error=${encodeURIComponent("No SGTX account for " + userInfo.email)}`, req.nextUrl.origin),
      );
    }

    // 6. Issue SGTX JWTs (with CSRF claim — same shape as /api/v1/auth/login).
    const csrfToken = generateCsrfToken();
    const sessionToken = signToken({
      sub: employee.id,
      email: employee.email,
      tenantGtid: employee.tenantGtid,
      role: employee.role,
      mfaVerified: true, // SSO is treated as MFA-verified (identity provider did UV)
      csrf: csrfToken,
      sso: "zitadel",
    });
    const refreshToken = signToken(
      { sub: employee.id, type: "refresh", sso: "zitadel" },
      30 * 24 * 60 * 60 * 1000,
    );

    // Clear the SSO state cookie.
    const res = NextResponse.redirect(
      new URL(`${returnTo}#session_token=${encodeURIComponent(sessionToken)}&refresh_token=${encodeURIComponent(refreshToken)}&csrf_token=${encodeURIComponent(csrfToken)}`, req.nextUrl.origin),
    );
    res.cookies.delete("sgtx-sso-state");
    // Stable hash of the access_token for audit logging (don't log the raw token).
    const tokenHash = createHash("sha256").update(tokens.access_token).digest("hex").slice(0, 16);
    res.headers.set("X-SGTX-SSO-Provider", "zitadel");
    res.headers.set("X-SGTX-SSO-Token-Hash", tokenHash);
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

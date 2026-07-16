import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getZitadelConfig, buildAuthorizeUrl } from "@/lib/v1/zitadel";

export const dynamic = "force-dynamic";

// GET /api/v1/auth/sso/authorize — redirect to ZITADEL /authorize (FIX-AUTH-COUNTRIES-KYC / Fix 5).
//
// Query params:
//   ?return_to=<path>  — optional path to redirect to after successful SSO
//                        (validated against the same-origin allow-list on callback).
//
// Sets a `sgtx-sso-state` HttpOnly cookie with the OAuth `state` + `nonce` +
// `return_to` for CSRF protection on the callback. The cookie is short-lived
// (10 minutes) and SameSite=Lax so it survives the cross-origin redirect.
//
// If ZITADEL is not configured (missing env vars), returns 503 with a clear
// error so the AuthGateway can show a "SSO not configured" tooltip.
export async function GET(req: NextRequest) {
  try {
    const cfg = getZitadelConfig();
    if (!cfg.configured) {
      return NextResponse.json(
        { error: "SSO not configured — set ZITADEL_CLIENT_ID and ZITADEL_CLIENT_SECRET" },
        { status: 503 },
      );
    }
    const returnTo = req.nextUrl.searchParams.get("return_to") || "/";
    // Validate return_to — must be a relative path (no protocol, no // prefix).
    const safeReturnTo = (() => {
      if (typeof returnTo !== "string" || !returnTo.startsWith("/") || returnTo.startsWith("//")) {
        return "/";
      }
      return returnTo;
    })();
    const state = randomBytes(24).toString("base64url");
    const nonce = randomBytes(24).toString("base64url");
    const authorizeUrl = buildAuthorizeUrl(state, nonce);

    // Pack state + nonce + return_to into a single cookie (base64url JSON).
    const cookiePayload = Buffer.from(JSON.stringify({
      state,
      nonce,
      return_to: safeReturnTo,
      issuedAt: Date.now(),
    })).toString("base64url");

    const res = NextResponse.redirect(authorizeUrl, 302);
    res.cookies.set("sgtx-sso-state", cookiePayload, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 10 * 60, // 10 minutes
    });
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

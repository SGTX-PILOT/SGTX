// SGTX ZITADEL SSO Configuration (FIX-AUTH-COUNTRIES-KYC / Fix 5)
//
// Reads ZITADEL OIDC configuration from environment variables. If any of the
// three required vars are missing, SSO is "not configured" — the AuthGateway
// shows a tooltip and does not redirect.
//
// Env vars:
//   ZITADEL_CLIENT_ID     — OAuth/OIDC client ID (required)
//   ZITADEL_CLIENT_SECRET — OAuth/OIDC client secret (required for confidential clients)
//   ZITADEL_ISSUER        — ZITADEL issuer URL, e.g. "https://zitadel.com" (default)
//
// The redirect URI is constructed from the public app URL:
//   SGTX_PUBLIC_URL (env, required in prod) or http://localhost:3000 in dev.
//   → `${publicUrl}/api/v1/auth/sso/callback`

export interface ZitadelConfig {
  clientId: string | null;
  clientSecret: string | null;
  issuer: string;
  redirectUri: string;
  scope: string[];
  /** True iff clientId AND clientSecret are both configured. */
  configured: boolean;
}

/**
 * Read ZITADEL SSO config from env. Returns a ZitadelConfig with `configured`
 * set based on presence of client_id + client_secret. The issuer defaults to
 * "https://zitadel.com" (ZITADEL Cloud).
 *
 * @returns the resolved ZitadelConfig.
 */
export function getZitadelConfig(): ZitadelConfig {
  const clientId = process.env.ZITADEL_CLIENT_ID || null;
  const clientSecret = process.env.ZITADEL_CLIENT_SECRET || null;
  const issuer = (process.env.ZITADEL_ISSUER || "https://zitadel.com").replace(/\/+$/, "");
  const publicUrl = process.env.SGTX_PUBLIC_URL || "http://localhost:3000";
  const redirectUri = `${publicUrl.replace(/\/+$/, "")}/api/v1/auth/sso/callback`;
  return {
    clientId,
    clientSecret,
    issuer,
    redirectUri,
    scope: ["openid", "profile", "email"],
    configured: !!(clientId && clientSecret),
  };
}

/**
 * Build the ZITADEL /authorize redirect URL with PKCE-style state + nonce.
 *
 * @param state - opaque state string (validated on callback for CSRF).
 * @param nonce - opaque nonce (echoed in the ID token for replay protection).
 * @returns the full authorize URL string.
 */
export function buildAuthorizeUrl(state: string, nonce: string): string {
  const cfg = getZitadelConfig();
  const params = new URLSearchParams({
    client_id: cfg.clientId || "",
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: cfg.scope.join(" "),
    state,
    nonce,
  });
  return `${cfg.issuer}/oauth/v2/authorize?${params.toString()}`;
}

/**
 * Build the ZITADEL /token endpoint URL (for code → token exchange).
 * @returns the full token URL string.
 */
export function getTokenUrl(): string {
  return `${getZitadelConfig().issuer}/oauth/v2/token`;
}

/**
 * Build the ZITADEL /userinfo endpoint URL.
 * @returns the full userinfo URL string.
 */
export function getUserInfoUrl(): string {
  return `${getZitadelConfig().issuer}/oidc/v1/userinfo`;
}

/**
 * Build the ZITADEL JWKS URL (for ID token signature verification).
 * @returns the full JWKS URL string.
 */
export function getJwksUrl(): string {
  return `${getZitadelConfig().issuer}/oauth/v2/keys`;
}

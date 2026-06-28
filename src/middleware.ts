import { NextRequest, NextResponse } from "next/server";

// ============ Edge-compatible JWT verification (Web Crypto API) ============
// The middleware runs in the Edge Runtime which doesn't support Node's `crypto` module.
// We use the Web Crypto API (SubtleCrypto) for HMAC-SHA256 verification.

const isProd = process.env.NODE_ENV === "production";

// Cache the imported key (Web Crypto key needs async import)
let cachedKey: CryptoKey | null = null;
let cachedSecret: string | null = null;

async function getHmacKey(secret: string): Promise<CryptoKey> {
  if (cachedKey && cachedSecret === secret) return cachedKey;
  const enc = new TextEncoder();
  cachedKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  cachedSecret = secret;
  return cachedKey;
}

async function verifyTokenEdge(token: string): Promise<any | null> {
  try {
    const [header, payload, signature] = token.split(".");
    if (!header || !payload || !signature) return null;
    const body = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    // Use refresh secret for refresh tokens, session secret otherwise
    const secret = body.type === "refresh"
      ? (process.env.SGTX_REFRESH_SECRET || "sgtx-dev-refresh-secret-2026-DO-NOT-USE-IN-PROD")
      : (process.env.SGTX_SESSION_SECRET || "sgtx-dev-secret-key-2026-DO-NOT-USE-IN-PROD");
    const key = await getHmacKey(secret);
    const enc = new TextEncoder();
    const data = enc.encode(header + "." + payload);
    // Decode base64url signature to ArrayBuffer
    const sigBuf = Uint8Array.from(atob(signature.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify("HMAC", key, sigBuf, data);
    if (!valid) return null;
    if (body.exp && Date.now() > body.exp * 1000) return null;
    return body;
  } catch { return null; }
}

// ============ Public routes ============
const PUBLIC_ROUTES = new Set([
  "/api/sgtx/health",
  "/api/sgtx/health/ready",
  "/api/sgtx/openapi",
  "/api/sgtx/status",
  "/api/sgtx/ustn/verify",
  "/api/sgtx/ustn/lifecycle",
  "/api/sgtx/governor/verify-loom",
  "/api/sgtx/trust-passport/verify",
  "/api/sgtx/trust-passport/public-key",
  "/api/sgtx/release/authorization",
  "/api/sgtx/release/crl",
  "/api/sgtx/release/webhook",
  "/api/sgtx/onboarding/search-registry",
  "/api/sgtx/onboarding/verify-registry",
  "/api/sgtx/shipping-lines",
  "/api/sgtx/tenants",
  "/api/sgtx/banks",
  "/api/sgtx/address/autocomplete",
  "/api/sgtx/gtid/resolve",
  "/api/sgtx/gtid/autocomplete",
  "/api/sgtx/gtid/sanctions-badge",
  "/api/sgtx/gtid/trust-explanation",
  "/api/sgtx/ustn/autocomplete",
  "/api/sgtx/ustn/resolve",
  "/api/sgtx/ustn/generate",
  "/api/sgtx/port",
  "/api/sgtx/corridor",
  "/api/sgtx/tcn/corridor/list",
  "/api/sgtx/tcn/corridor/[code]",
  "/api/sgtx/tcn/port",
  "/api/sgtx/ai/hs-code",
  "/api/v1/auth/login",
  "/api/v1/auth/refresh",
  "/api/v1/auth/mfa",
  "/api/v1/auth/logout",
  "/api/v1/auth/passkey",
  "/api/v1/auth/recovery",
  "/api/v1/onboarding",
]);

// ============ Cron routes (require CRON_SECRET — fail-closed) ============
const CRON_ROUTES = new Set([
  "/api/sgtx/payment/late-fees/cron",
  "/api/sgtx/payment/deferred-expiry/cron",
  "/api/sgtx/payment/deferred/cron",
  "/api/sgtx/governor/audit-cron",
  "/api/sgtx/sandbox/reset",
  "/api/sgtx/tri/cron",
  "/api/sgtx/readiness/cron",
  "/api/sgtx/trade-memory/cron",
  "/api/sgtx/documents/expiry-check",
  "/api/sgtx/gov/certificates/expiry-check",
]);

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // 1. CORS preflight
  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
  }

  // 2. Security headers on all responses
  const response = NextResponse.next();
  applySecurityHeaders(response, req);

  // 3. Cron routes — fail-closed CRON_SECRET verification
  const isCron = CRON_ROUTES.has(path) || (path.startsWith("/api/sgtx/") && path.endsWith("/cron"));
  if (isCron) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret && isProd) {
      return NextResponse.json({ error: "Cron secret not configured" }, { status: 503 });
    }
    if (cronSecret) {
      const authHeader = req.headers.get("authorization") || "";
      const providedSecret = authHeader.replace("Bearer ", "");
      if (providedSecret !== cronSecret) {
        return NextResponse.json({ error: "Unauthorized: invalid cron secret" }, { status: 401 });
      }
    }
    if (!cronSecret) {
      response.headers.set("X-Auth-Warning", "cron-secret-not-set-dev");
    }
    return response;
  }

  // 4. Public routes — no auth required
  if (PUBLIC_ROUTES.has(path) || isPublicPattern(path)) {
    return response;
  }

  // 5. Non-API routes (static assets, pages) — no auth
  if (!path.startsWith("/api/")) {
    return response;
  }

  // 6. Protected API routes — VERIFY JWT
  const authHeader = req.headers.get("authorization");
  const sessionCookie = req.cookies.get("sgtx-session")?.value;
  const token = authHeader?.replace("Bearer ", "") || sessionCookie;

  if (!token) {
    if (isProd) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    // Dev mode: allow with warning header (for demo flow compatibility)
    response.headers.set("X-Auth-Warning", "no-auth-token-dev");
    return response;
  }

  const payload = await verifyTokenEdge(token);
  if (!payload) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  // 7. Inject verified identity into request headers for downstream handlers
  const tenantGtid = payload.tenantGtid || payload.sub;
  const employeeId = payload.sub;
  const role = payload.role || "USER";
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-tenant-gtid", String(tenantGtid));
  requestHeaders.set("x-employee-id", String(employeeId));
  requestHeaders.set("x-role", String(role));
  requestHeaders.set("x-mfa-verified", String(payload.mfaVerified || false));

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

// ============ Helpers ============

function isPublicPattern(path: string): boolean {
  if (path.startsWith("/api/sgtx/corridor/") && !path.includes("/analytics")) return true;
  if (path.startsWith("/api/sgtx/port/")) return true;
  if (path.startsWith("/api/sgtx/jurisdictions")) return true;
  if (path.startsWith("/api/sgtx/tcn/corridor/")) return true;
  return false;
}

function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allowedOrigins = (process.env.SGTX_ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  const isAllowedDevOrigin = !isProd && (
    origin.startsWith("http://localhost:") ||
    origin.startsWith("http://127.0.0.1:")
  );
  const allowOrigin = allowedOrigins.includes(origin)
    ? origin
    : isAllowedDevOrigin
      ? origin
      : "";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-tenant-gtid",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

function applySecurityHeaders(response: NextResponse, req: NextRequest) {
  const cors = corsHeaders(req);
  for (const [k, v] of Object.entries(cors)) {
    if (v) response.headers.set(k, v);
  }
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), accelerometer=(), gyroscope=(), usb=(), bluetooth=(), payment=()");
  if (isProd) {
    response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
  response.headers.set("Content-Security-Policy", csp);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sgtx-logos|.*\\.png$|.*\\.jpg$|.*\\.jpeg$|.*\\.gif$|.*\\.svg$|.*\\.ico$|.*\\.webp$).*)",
  ],
};

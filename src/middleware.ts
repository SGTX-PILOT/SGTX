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
  "/api/sgtx/ai/hs-code",
  // Part 32 — Add-On 9: Demurrage & Detention Management (CCL-006)
  // Public read endpoints + calculation engine. POST routes (track, calculate,
  // dispute) are also public for demo-portal compatibility — they remain
  // rate-limited by the anonymous API bucket (50 req/min) above.
  "/api/sgtx/demurrage",
  "/api/sgtx/demurrage/forecast",
  "/api/sgtx/demurrage/track",
  "/api/sgtx/demurrage/calculate",
  "/api/sgtx/demurrage/alerts",
  "/api/sgtx/demurrage/dispute",
  "/api/sgtx/demurrage/port-free-time",
  // Add-Ons 14–18 (CCL-008) — tenant-scoped by query param / body. Same
  // pattern as demurrage: demo portal has no session cookie, so these must
  // be public. Rate-limited by the anonymous API bucket (50 req/min) above.
  // Add-On 14: Currency Risk Management
  "/api/sgtx/currency-risk/exposure",
  "/api/sgtx/currency-risk/recommendations",
  "/api/sgtx/currency-risk/hedge",
  // Add-On 15: Government API Sandbox
  "/api/sgtx/gov-sandbox/apis",
  "/api/sgtx/gov-sandbox/test",
  "/api/sgtx/gov-sandbox/results",
  // Add-On 16: FTA Preference Management
  "/api/sgtx/fta/preferences",
  "/api/sgtx/fta/claim",
  "/api/sgtx/fta/claims",
  // Add-On 17: Piracy & Security Risk Engine (maritime scope)
  "/api/sgtx/security/incidents",
  "/api/sgtx/security/corridor-score",
  "/api/sgtx/security/incident",
  // Add-On 18: Trade Compliance Calendar
  "/api/sgtx/compliance-calendar/events",
  "/api/sgtx/compliance-calendar/event",
  "/api/sgtx/compliance-calendar/complete",
  // CCL-008: Add-Ons 19-26 routes
  "/api/sgtx/cargo-insurance/providers",
  "/api/sgtx/cargo-insurance/policy",
  "/api/sgtx/cargo-insurance/policies",
  "/api/sgtx/trade-finance/document",
  "/api/sgtx/trade-finance/documents",
  "/api/sgtx/trade-finance/verify",
  "/api/sgtx/back-to-back-lc/create",
  "/api/sgtx/back-to-back-lc/list",
  "/api/sgtx/back-to-back-lc/confirm",
  "/api/sgtx/force-majeure/events",
  "/api/sgtx/force-majeure/claim",
  "/api/sgtx/force-majeure/claims",
  "/api/sgtx/shippers-declaration/create",
  "/api/sgtx/shippers-declaration/list",
  "/api/sgtx/shippers-declaration/sign",
  "/api/sgtx/terminal/integrations",
  "/api/sgtx/terminal/event",
  "/api/sgtx/terminal/events",
  "/api/sgtx/payment-guarantee/create",
  "/api/sgtx/payment-guarantee/confirm",
  "/api/sgtx/payment-guarantee/status",
  "/api/sgtx/demurrage-dispute/create",
  "/api/sgtx/demurrage-dispute/list",
  "/api/sgtx/bonds/sufficiency-check",
  // Part 32 — Add-On 10: Broker Liability & Insurance
  "/api/sgtx/broker-liability/list",
  "/api/sgtx/broker-liability/create",
  "/api/sgtx/broker-liability/verify",
  "/api/sgtx/broker-liability/performance",
  // Part 32 — Add-On 11: Customs Valuation Intelligence
  "/api/sgtx/valuation/calculate",
  "/api/sgtx/valuation/market-price",
  "/api/sgtx/valuation/dispute",
  "/api/sgtx/valuation/disputes",
  // Part 32 — Add-On 12: Cold Chain Quality Management
  "/api/sgtx/cold-chain/pti",
  "/api/sgtx/cold-chain/reading",
  "/api/sgtx/cold-chain/anomalies",
  "/api/sgtx/cold-chain/compliance",
  // Part 32 — Add-On 13: Inspection Agency Accreditation
  "/api/sgtx/inspection/accreditations",
  "/api/sgtx/inspection/accredit",
  "/api/sgtx/inspection/performance",
  // CCL-004: Portal rendering routes — needed for the demo portal to load
  // (dashboard, readiness, integrations, inbox are read-only tenant data
  // scoped by query param; the demo login has no session cookie so these
  // must be public for the portal shell to render)
  "/api/sgtx/dashboard",
  "/api/sgtx/readiness",
  "/api/sgtx/integrations",
  "/api/sgtx/inbox",
  "/api/sgtx/inbox/summary",
  "/api/sgtx/trade-readiness",
  "/api/sgtx/trade-request/readiness",
  "/api/sgtx/trade-request/completeness-map",
  "/api/sgtx/trade-request/why-asking",
  "/api/sgtx/trade-request/priority-profile",
  "/api/sgtx/trade-request/express-parse",
  "/api/sgtx/trade-request/documentation-requirements",
  "/api/sgtx/trade-request/compliance-check",
  "/api/sgtx/trade-request/special-instructions",
  "/api/sgtx/seller/quote-viability",
  "/api/sgtx/seller/change-impact",
  "/api/sgtx/seller/contract-readiness",
  "/api/sgtx/seller/control-tower",
  // CCL-007: GRiRE routes
  "/api/sgtx/grire/country-profile",
  "/api/sgtx/grire/tariff",
  "/api/sgtx/grire/required-docs",
  "/api/sgtx/grire/cold-chain",
  "/api/sgtx/grire/fta-preference",
  "/api/sgtx/grire/full-report",
  "/api/sgtx/grire/discover",
  // CCL-006 / Part 31: Bond Management — tenant-scoped by query param (same
  // pattern as seller routes; the demo login has no session cookie so these
  // must be public for the portal shell to render). See PUBLIC_ROUTES note above.
  "/api/sgtx/bonds/create",
  "/api/sgtx/bonds/list",
  "/api/sgtx/bonds/verify",
  "/api/sgtx/bonds/allocate",
  "/api/sgtx/bonds/release",
  "/api/sgtx/bonds/calculate",
  "/api/sgtx/bonds/status",
  "/api/sgtx/bonds/renew",
  "/api/sgtx/bonds/[id]",
  // CCL-009: Trade Cost Engine + Payment Evidence + Reefer Power + Trade Events
  // (Parts XI-XVI) — tenant-scoped by query param/body (same pattern as the
  // demurrage + bond routes above; demo portal has no session cookie so these
  // must be public). Rate-limited by the anonymous API bucket (50 req/min).
  "/api/sgtx/trade-cost/calculate",
  "/api/sgtx/trade-cost/obligations",
  "/api/sgtx/payment-evidence/submit",
  "/api/sgtx/payment-evidence/validate",
  "/api/sgtx/payment-evidence/match",
  "/api/sgtx/reefer-power/track",
  "/api/sgtx/reefer-power/calculate",
  "/api/sgtx/trade-events/record",
  "/api/sgtx/trade-events/list",
  "/api/sgtx/debug-env",
  "/api/v1/auth/login",
  "/api/v1/auth/refresh",
  "/api/v1/auth/mfa",
  "/api/v1/auth/logout",
  "/api/v1/auth/passkey",
  "/api/v1/auth/recovery",
  "/api/v1/onboarding",
  "/api/v1/onboarding/start",
  "/api/v1/onboarding/step",
  "/api/v1/onboarding/complete",
  // ============ International Road Corridor Engine (Task CREATE-ROAD-LIB-APIS) ============
  // Public so the demo portal can call without a session cookie. Tenant
  // scoping is by body / query param (`ustn`, `corridorId`). Rate-limited
  // by the anonymous API bucket (50 req/min) above.
  "/api/sgtx/road/corridors",
  "/api/sgtx/road/corridors/[id]",
  "/api/sgtx/road/corridors/[id]/validate",
  "/api/sgtx/road/corridors/[id]/lock",
  "/api/sgtx/road/vehicles/validate",
  "/api/sgtx/road/drivers/validate",
  "/api/sgtx/road/dispatch/authorize",
  "/api/sgtx/road/borders/[id]/arrive",
  "/api/sgtx/road/borders/[id]/gate-in",
  "/api/sgtx/road/borders/[id]/customs",
  "/api/sgtx/road/borders/[id]/release",
  "/api/sgtx/road/borders/[id]/gate-out",
  "/api/sgtx/road/seals",
  "/api/sgtx/road/seals/[id]/verify",
  "/api/sgtx/road/seals/[id]/broken",
  "/api/sgtx/road/incidents",
  "/api/sgtx/road/pod",
  "/api/sgtx/road/documents/validate",
  "/api/sgtx/road/reconciliation/run",
  "/api/sgtx/road/customs/operations",
  "/api/sgtx/road/customs/operations/[id]",
  "/api/sgtx/road/customs/operations/[id]/submit",
  "/api/sgtx/road/tir/apply",
  "/api/sgtx/road/tir/[id]",
  "/api/sgtx/road/tir/[id]/discharge",
  "/api/sgtx/road/adapters",

  // ===== Air Cargo (§13-§37) — 30 routes =====
  "/api/sgtx/air/shipments",
  "/api/sgtx/air/shipments/[ustn]",
  "/api/sgtx/air/bookings",
  "/api/sgtx/air/bookings/[id]",
  "/api/sgtx/air/bookings/[id]/confirm",
  "/api/sgtx/air/bookings/[id]/cancel",
  "/api/sgtx/air/mawb",
  "/api/sgtx/air/hawb",
  "/api/sgtx/air/awb/validate",
  "/api/sgtx/air/flights",
  "/api/sgtx/air/flights/[id]/status",
  "/api/sgtx/air/acceptance",
  "/api/sgtx/air/security/screen",
  "/api/sgtx/air/security/verify",
  "/api/sgtx/air/uld",
  "/api/sgtx/air/uld/build",
  "/api/sgtx/air/uld/breakdown",
  "/api/sgtx/air/dg/validate",
  "/api/sgtx/air/dg/declaration",
  "/api/sgtx/air/customs",
  "/api/sgtx/air/customs/[id]/submit",
  "/api/sgtx/air/customs/[id]/status",
  "/api/sgtx/air/cutoff/check",
  "/api/sgtx/air/incident",
  "/api/sgtx/air/pod",
  "/api/sgtx/air/reconciliation/run",
  "/api/sgtx/air/cargo-xml/send",
  "/api/sgtx/air/cargo-xml/receive",
  "/api/sgtx/air/one-record/share",
  "/api/sgtx/air/one-record/[ustn]",

  // ===== Jurisdiction Fabric (CCL-014 §2, §4, §5) — Task CREATE-JURISDICTION-LIB-APIS =====
  // Public so the demo portal can call without a session cookie. Tenant
  // scoping is by body / query param (`ustn`, `code`, `jurisdictionCode`).
  // Rate-limited by the anonymous API bucket (50 req/min) above.
  "/api/sgtx/jurisdiction/list",
  "/api/sgtx/jurisdiction/[code]",
  "/api/sgtx/jurisdiction/[code]/hierarchy",
  "/api/sgtx/jurisdiction/[code]/children",
  "/api/sgtx/jurisdiction/[code]/sources",
  "/api/sgtx/jurisdiction/snapshot",
  "/api/sgtx/jurisdiction/snapshot/[ustn]",
  "/api/sgtx/jurisdiction/snapshot/[ustn]/validate",
  "/api/sgtx/jurisdiction/sources",
  "/api/sgtx/jurisdiction/sources/[id]",
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

// ============ Page-route rate limiter (IMPL-10a / M-022) ============
//
// The prior audit (M-022) flagged that only /api/ routes had rate limiting
// (per-route, in-route). Page requests (DDoS via page load) were unmitigated.
// This in-memory Map rate limiter is a defense-in-depth backstop for the
// Edge Runtime — it applies to non-API HTML route requests only.
//
// Limits (per client IP, 60-second sliding window):
//   - Authenticated (valid session JWT present):  600 req/min
//   - Anonymous:                                   200 req/min
//
// Production follow-up: replace the in-memory Map with Redis (UPSTASH_REDIS_REST_URL)
// so limits are shared across edge instances. The in-memory Map is per-instance
// and resets on cold start — fine for single-instance deploys and dev, not for
// horizontally-scaled production edge.

interface RateBucket { count: number; resetAt: number; }
const pageRateMap = new Map<string, RateBucket>();

// Page-route limits (per minute). Authenticated users get a higher budget
// because the SPA performs several legitimate navigations per session.
const PAGE_RATE_LIMIT_ANON = 200;   // req / 60s
const PAGE_RATE_LIMIT_AUTH = 600;   // req / 60s
const PAGE_RATE_WINDOW_MS = 60_000; // 1 minute

// ============ API rate limiter (FIX-12-FINAL / Fix 3) ============
//
// Audit section S43 flagged that the existing page-rate limiter did NOT cover
// /api/sgtx/* routes — only HTML pages. An attacker could DDoS API endpoints
// unthrottled. This in-memory Map rate limiter applies a separate, tighter
// budget to /api/sgtx/* requests:
//   - Authenticated (valid session JWT):  200 req/min
//   - Anonymous:                            50 req/min
// Public routes (PUBLIC_ROUTES + isPublicPattern) are EXEMPT — they need to
// be reachable for unauthenticated clients (health checks, USTN verify,
// onboarding search, etc.).
//
// Production follow-up: same as page-rate limiter — replace with Redis
// (UPSTASH_REDIS_REST_URL) so limits are shared across edge instances.
const apiRateMap = new Map<string, RateBucket>();
const API_RATE_LIMIT_ANON = 50;    // req / 60s
const API_RATE_LIMIT_AUTH = 200;   // req / 60s
const API_RATE_WINDOW_MS = 60_000; // 1 minute

let apiRateInsertsSinceSweep = 0;
function sweepExpiredApiBuckets() {
  const now = Date.now();
  for (const [k, v] of apiRateMap) {
    if (now > v.resetAt) apiRateMap.delete(k);
  }
}

function checkApiRateLimit(ip: string, authenticated: boolean): { allowed: true } | { allowed: false; retryAfter: number } {
  const now = Date.now();
  const limit = authenticated ? API_RATE_LIMIT_AUTH : API_RATE_LIMIT_ANON;
  const key = `api:${authenticated ? "auth" : "anon"}:${ip}`;
  const entry = apiRateMap.get(key);
  if (!entry || now > entry.resetAt) {
    if (++apiRateInsertsSinceSweep >= 1000) {
      apiRateInsertsSinceSweep = 0;
      sweepExpiredApiBuckets();
    }
    apiRateMap.set(key, { count: 1, resetAt: now + API_RATE_WINDOW_MS });
    return { allowed: true };
  }
  if (entry.count >= limit) {
    const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return { allowed: false, retryAfter: retryAfterSec };
  }
  entry.count++;
  return { allowed: true };
}

// Opportunistic sweep — keep the Map from growing unbounded under attack.
// Triggered every ~1000 inserts (cheap counter check, expensive sweep rare).
let pageRateInsertsSinceSweep = 0;
function sweepExpiredPageBuckets() {
  const now = Date.now();
  for (const [k, v] of pageRateMap) {
    if (now > v.resetAt) pageRateMap.delete(k);
  }
}

/**
 * Returns the remaining-budget info or null if the request is allowed.
 * Side-effect: increments the bucket counter.
 */
function checkPageRateLimit(ip: string, authenticated: boolean): { allowed: true } | { allowed: false; retryAfter: number } {
  const now = Date.now();
  const limit = authenticated ? PAGE_RATE_LIMIT_AUTH : PAGE_RATE_LIMIT_ANON;
  const key = `page:${authenticated ? "auth" : "anon"}:${ip}`;
  const entry = pageRateMap.get(key);
  if (!entry || now > entry.resetAt) {
    // New window — opportunistic sweep before insert to bound growth.
    if (++pageRateInsertsSinceSweep >= 1000) {
      pageRateInsertsSinceSweep = 0;
      sweepExpiredPageBuckets();
    }
    pageRateMap.set(key, { count: 1, resetAt: now + PAGE_RATE_WINDOW_MS });
    return { allowed: true };
  }
  if (entry.count >= limit) {
    const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return { allowed: false, retryAfter: retryAfterSec };
  }
  entry.count++;
  return { allowed: true };
}

/** Extracts client IP from NextRequest (X-Forwarded-For first hop).
 *
 *  NOTE: `NextRequest.ip` was removed from the public type in Next 13+. The
 *  portable approach is to read `X-Forwarded-For` (set by Cloudflare / Vercel
 *  ingress / any reverse proxy in front of the runtime). When SGTX runs behind
 *  Vercel, the Vercel proxy already sets X-Forwarded-For to the client IP, so
 *  this is reliable in all production deployments. */
function getClientIp(req: NextRequest): string | null {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) {
    const first = xf.split(",")[0]?.trim();
    if (first) return first;
  }
  // Fallback: true-client-ip (Cloudflare Enterprise) or x-real-ip (nginx).
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return null;
}

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
    // FIX-12-FINAL / Fix 3 — even public /api/sgtx/* routes get the anonymous
    // API rate-limit budget so an unauthenticated client cannot DDoS them.
    if (path.startsWith("/api/sgtx/")) {
      const ip = getClientIp(req);
      if (ip) {
        const decision = checkApiRateLimit(ip, false);
        if (!decision.allowed) {
          return NextResponse.json(
            { error: "Too many requests", retryAfter: decision.retryAfter },
            { status: 429, headers: { "Retry-After": String(decision.retryAfter) } },
          );
        }
      }
    }
    return response;
  }

  // 5. Non-API routes (static assets, pages) — apply page-rate-limit then pass through
  if (!path.startsWith("/api/")) {
    const ip = getClientIp(req);
    if (ip) {
      // Determine if this page request carries a valid session — authenticated
      // sessions get a higher rate budget (they are real users navigating the SPA).
      const authHeader = req.headers.get("authorization");
      const sessionCookie = req.cookies.get("sgtx-session")?.value;
      const token = authHeader?.replace("Bearer ", "") || sessionCookie;
      let isAuthenticated = false;
      if (token) {
        // Soft check: a verified JWT grants the higher limit. An invalid token
        // falls back to the anonymous limit (don't reward token-forging actors).
        const payload = await verifyTokenEdge(token);
        isAuthenticated = !!payload;
      }
      const decision = checkPageRateLimit(ip, isAuthenticated);
      if (!decision.allowed) {
        // Branded 429 HTML response — the user is in a browser, give them
        // something readable rather than a JSON envelope.
        const body = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>SGTX — Too many requests</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
         background: oklch(0.14 0.005 240); color: oklch(0.92 0.004 60); padding: 1rem; }
  .card { max-width: 28rem; text-align:center; }
  .wm { font-weight:700; letter-spacing:.22em; font-size:1.25rem;
        background: linear-gradient(135deg, oklch(0.92 0.10 90) 0%, oklch(0.80 0.15 80) 38%, oklch(0.66 0.13 70) 68%, oklch(0.88 0.09 92) 100%);
        -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; }
  h1 { font-size:1.875rem; margin:1.25rem 0 .5rem; }
  p { color: oklch(0.60 0.008 60); font-size:.875rem; line-height:1.6; margin:.5rem 0; }
  code { font-family: ui-monospace, "SF Mono", Menlo, monospace; color: oklch(0.75 0.13 75); }
</style>
</head>
<body>
  <div class="card">
    <div class="wm">SGTX</div>
    <h1>Too many requests</h1>
    <p>You have exceeded the rate limit. Please wait and try again.</p>
    <p>Retry in <code>${decision.retryAfter}</code> seconds.</p>
    <p style="margin-top:1.5rem; font-size:.75rem; opacity:.7;">Sovereign Governed Trade Execution</p>
  </div>
</body>
</html>`;
        return new NextResponse(body, {
          status: 429,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Retry-After": String(decision.retryAfter),
            "Cache-Control": "no-store",
          },
        });
      }
    }
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

  // FIX-12-FINAL / Fix 3 — API rate limit on /api/sgtx/* (authenticated bucket).
  // Applied AFTER JWT verification so a valid session gets the higher 200/min
  // budget; an invalid token has already returned 401 above (so it never
  // reaches here). A missing token in dev mode bypasses (above) without
  // consuming an authenticated bucket; in prod it returns 401 (also above).
  if (path.startsWith("/api/sgtx/")) {
    const ip = getClientIp(req);
    if (ip) {
      const decision = checkApiRateLimit(ip, true);
      if (!decision.allowed) {
        return NextResponse.json(
          { error: "Too many requests", retryAfter: decision.retryAfter },
          { status: 429, headers: { "Retry-After": String(decision.retryAfter) } },
        );
      }
    }
  }

  // 7. CSRF check (FIX-AUTH-COUNTRIES-KYC / Fix 1)
  //
  // For all state-changing methods on PROTECTED (non-public) API routes, the
  // client MUST echo the access JWT's `csrf` claim in the `X-CSRF-Token`
  // header. The token is issued on login (see /api/v1/auth/login) and embedded
  // in the JWT body — only a holder of the decoded JWT can produce it.
  //
  // Public + auth-bootstrap routes (login, refresh, mfa, logout, passkey,
  // recovery, sso) are EXEMPT — they issue tokens rather than consume them.
  // The middleware edge runtime cannot import the Node-side
  // `validateCsrfToken()` (which uses Buffer + timingSafeEqual); we inline an
  // equivalent comparison using Web Crypto primitives.
  const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
  const CSRF_EXEMPT_PREFIXES = [
    "/api/v1/auth/login",
    "/api/v1/auth/refresh",
    "/api/v1/auth/mfa",
    "/api/v1/auth/logout",
    "/api/v1/auth/passkey",
    "/api/v1/auth/recovery",
    "/api/v1/auth/sso/",
    "/api/v1/onboarding", // onboarding-start uses its own one-shot token
  ];
  const isMutation = MUTATION_METHODS.has(req.method);
  const isCsrfExempt = CSRF_EXEMPT_PREFIXES.some((p) => path === p || path.startsWith(p));
  if (isMutation && !isCsrfExempt && payload.csrf) {
    const headerToken = req.headers.get("x-csrf-token");
    if (!headerToken || !(await safeEqualEdge(headerToken, payload.csrf))) {
      return NextResponse.json(
        { error: "CSRF token missing or invalid" },
        { status: 403, headers: { "Vary": "Origin" } },
      );
    }
  }

  // 8. Inject verified identity into request headers for downstream handlers
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

/**
 * Timing-safe string comparison using Web Crypto (edge-compatible).
 * Returns false early if lengths differ — same behavior as Node's timingSafeEqual.
 *
 * @param a - client-supplied header value.
 * @param b - JWT `csrf` claim.
 * @returns true if equal (constant-time on equal-length inputs).
 */
async function safeEqualEdge(a: string, b: string): Promise<boolean> {
  if (a.length !== b.length) return false;
  const enc = new TextEncoder();
  const bufA = enc.encode(a);
  const bufB = enc.encode(b);
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode("sgtx-csrf-compare"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  // HMAC both inputs with the same key — if they're equal, the HMACs are equal.
  // Comparing the HMACs (not the inputs) leaks no byte-level timing info.
  const [macA, macB] = await Promise.all([
    crypto.subtle.sign("HMAC", key, bufA),
    crypto.subtle.sign("HMAC", key, bufB),
  ]);
  // Use the built-in constant-time compare from SubtleCrypto.verify (self-verify trick).
  const ok = await crypto.subtle.verify("HMAC", key, macA, bufB);
  // We only return true if both: HMACs equal AND the self-verify confirms byte equality.
  return ok && arraysEqual(new Uint8Array(macA), new Uint8Array(macB));
}

/**
 * Constant-time Uint8Array equality (no early-exit on first differing byte).
 */
function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ============ Helpers ============

function isPublicPattern(path: string): boolean {
  if (path.startsWith("/api/sgtx/corridor/") && !path.includes("/analytics")) return true;
  if (path.startsWith("/api/sgtx/port/")) return true;
  if (path.startsWith("/api/sgtx/jurisdictions")) return true;
  if (path.startsWith("/api/sgtx/tcn/corridor/")) return true;
  // Tier 2: public Certificate of Origin verification endpoint (no auth).
  if (path.startsWith("/api/sgtx/certificates/public/")) return true;
  // Part 32 — Demurrage: dynamic [ustn] GET route. Pattern:
  //   /api/sgtx/demurrage/<ustn>  (single segment after demurrage/)
  if (/^\/api\/sgtx\/demurrage\/[^/]+$/.test(path)) return true;
  // Part 31 — Bond Management: dynamic [id] GET/PATCH route. Pattern:
  //   /api/sgtx/bonds/<bondId>  (single segment after bonds/, excluding
  //   the literal sub-route names create|list|verify|allocate|release|
  //   calculate|status|renew which are already in PUBLIC_ROUTES).
  if (/^\/api\/sgtx\/bonds\/[^/]+$/.test(path)) return true;
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
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-tenant-gtid, X-CSRF-Token",
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

  // IMPL-10a (M-037): Cross-Origin isolation headers.
  //  - COOP same-origin:    prevents window.opener cross-origin access (tab-nabbing).
  //  - COEP require-corp:   blocks cross-origin resources without CORP/CORS opt-in
  //                         (defense-in-depth against Spectre-style data exfiltration).
  //  - CORP same-origin:    blocks this origin's responses from being embedded by
  //                         other sites (defense against cross-origin resource inclusion).
  // NOTE: COEP=require-corp is strict — third-party <img>/<script> without CORS will
  // fail to load. The existing CSP already restricts img/script/connect to 'self'+https,
  // and all first-party assets are same-origin, so this is safe for SGTX. If a future
  // integration needs to load an unauthenticated cross-origin resource, the resource
  // must send `Cross-Origin-Resource-Policy: cross-origin` or be loaded via <script crossorigin>.
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");

  // IMPL-10a (M-023): Permissions-Policy — allow microphone + camera for the
  // SGTX Voice Command feature (execution/voice-command, settlement/voice-approve,
  // accessibility flows). All other powerful APIs remain locked down.
  // (self) restricts the API to same-origin contexts only — no third-party iframes
  // (and frame-ancestors 'none' in CSP already prevents framing anyway).
  response.headers.set(
    "Permissions-Policy",
    "camera=(self), microphone=(self), geolocation=(), accelerometer=(), gyroscope=(), usb=(), bluetooth=(), payment=()",
  );

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

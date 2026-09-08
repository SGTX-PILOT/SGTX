// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/v1/public-endpoints — Public endpoint index (v17 §18.26)
//
// Lists all public endpoints with their HTTP method, description, rate limit,
// and auth requirement. This is the "public verification index" mentioned in
// v17 §18.26 — a single self-describing catalog that auditors, regulators,
// counterparty integrators, and external tooling can use to discover the
// SGTX public API surface without scanning the OpenAPI spec.
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

// ============ Public endpoint catalog ============
// The single source of truth — also consumed by /api/v1/openapi.json.

interface EndpointEntry {
  path: string;
  method: string;
  description: string;
  rate_limit: string;
  auth_required: boolean;
  category: string;
  tags?: string[];
}

const ENDPOINT_CATALOG: EndpointEntry[] = [
  // ============ §18.26 — v1 Public Verification & Health ============
  {
    path: "/api/v1/openapi.json",
    method: "GET",
    description: "Returns the full OpenAPI 3.0.3 specification for the SGTX public API surface.",
    rate_limit: "50 req/min/IP",
    auth_required: false,
    category: "discovery",
    tags: ["Public", "System"],
  },
  {
    path: "/api/v1/status",
    method: "GET",
    description: "Returns the SGTX platform status (operational | degraded | outage) plus per-service health.",
    rate_limit: "100 req/min/IP",
    auth_required: false,
    category: "system",
    tags: ["Public", "System"],
  },
  {
    path: "/api/v1/keys",
    method: "GET",
    description: "Returns the SGTX platform public keys (Ed25519 + Dilithium3) for signature verification.",
    rate_limit: "100 req/min/IP",
    auth_required: false,
    category: "crypto",
    tags: ["Public", "Crypto"],
  },
  {
    path: "/api/v1/public-endpoints",
    method: "GET",
    description: "Lists all public endpoints with their method, description, rate limit, and auth requirement.",
    rate_limit: "100 req/min/IP",
    auth_required: false,
    category: "discovery",
    tags: ["Public"],
  },
  {
    path: "/api/v1/verify/loom",
    method: "GET",
    description: "Replays the full Governor Loom hash chain from genesis and returns the verification result.",
    rate_limit: "10 req/min/IP",
    auth_required: false,
    category: "governance",
    tags: ["Public", "Governance"],
  },
  {
    path: "/api/v1/gtid/resolve",
    method: "GET",
    description: "Resolves a Global Trade ID (GTID) to its registered entity + trust portrait.",
    rate_limit: "50 req/min/IP",
    auth_required: false,
    category: "identity",
    tags: ["Public", "Identity"],
  },
  {
    path: "/api/v1/ustn/track",
    method: "GET",
    description: "Returns the public tracking view of a Universal Sovereign Trade Number (USTN).",
    rate_limit: "50 req/min/IP",
    auth_required: false,
    category: "trade",
    tags: ["Public", "Trade"],
  },
  {
    path: "/api/v1/evidence/package",
    method: "POST",
    description: "Generates a cryptographically-signed evidence package for a USTN (court-admissible).",
    rate_limit: "10 req/min/IP",
    auth_required: false,
    category: "evidence",
    tags: ["Public", "Evidence"],
  },
  {
    path: "/api/v1/auth/login",
    method: "POST",
    description: "Authenticates a tenant (GTID + password) and returns a session + refresh JWT pair.",
    rate_limit: "10 req/min/IP",
    auth_required: false,
    category: "auth",
    tags: ["Auth"],
  },
  {
    path: "/api/v1/auth/refresh",
    method: "POST",
    description: "Exchanges a refresh token for a new session + refresh JWT pair.",
    rate_limit: "20 req/min/IP",
    auth_required: false,
    category: "auth",
    tags: ["Auth"],
  },
  {
    path: "/api/v1/auth/logout",
    method: "POST",
    description: "Invalidates the current session token.",
    rate_limit: "20 req/min/IP",
    auth_required: true,
    category: "auth",
    tags: ["Auth"],
  },
  {
    path: "/api/v1/onboarding/start",
    method: "POST",
    description: "Begins a new tenant onboarding flow. Returns a one-shot token for the next step.",
    rate_limit: "10 req/min/IP",
    auth_required: false,
    category: "onboarding",
    tags: ["Onboarding"],
  },
  {
    path: "/api/v1/onboarding/step",
    method: "POST",
    description: "Advances the onboarding flow to the next step using the one-shot token.",
    rate_limit: "20 req/min/IP",
    auth_required: false,
    category: "onboarding",
    tags: ["Onboarding"],
  },
  {
    path: "/api/v1/onboarding/complete",
    method: "POST",
    description: "Completes the onboarding flow and issues the new tenant's first session.",
    rate_limit: "10 req/min/IP",
    auth_required: false,
    category: "onboarding",
    tags: ["Onboarding"],
  },

  // ============ §18.26 — SGTX mirrors (also public) ============
  {
    path: "/api/sgtx/health",
    method: "GET",
    description: "Lightweight liveness probe — returns 200 if the process is alive and the DB is reachable.",
    rate_limit: "60 req/min/IP",
    auth_required: false,
    category: "system",
    tags: ["Public", "System"],
  },
  {
    path: "/api/sgtx/health/ready",
    method: "GET",
    description: "Deep readiness check — probes AI, governor, and external adapters.",
    rate_limit: "30 req/min/IP",
    auth_required: false,
    category: "system",
    tags: ["Public", "System"],
  },
  {
    path: "/api/sgtx/status",
    method: "GET",
    description: "Returns the public status page (overall status, active incidents, upcoming maintenance).",
    rate_limit: "60 req/min/IP",
    auth_required: false,
    category: "system",
    tags: ["Public", "System"],
  },
  {
    path: "/api/sgtx/release/crl",
    method: "GET",
    description: "Returns the X.509 CRL for revoked SGTX-signed certificates (container release authorisations).",
    rate_limit: "30 req/min/IP",
    auth_required: false,
    category: "crypto",
    tags: ["Public", "Crypto", "Release"],
  },
  {
    path: "/api/sgtx/trust-passport/public-key",
    method: "GET",
    description: "Returns the SGTX platform Ed25519 public key for Trust Passport signature verification.",
    rate_limit: "60 req/min/IP",
    auth_required: false,
    category: "crypto",
    tags: ["Public", "Crypto"],
  },
  {
    path: "/api/sgtx/governor/verify-loom",
    method: "GET",
    description: "SGTX-namespace mirror of /api/v1/verify/loom. Same chain-replay verification.",
    rate_limit: "10 req/min/IP",
    auth_required: false,
    category: "governance",
    tags: ["Public", "Governance"],
  },
  {
    path: "/api/sgtx/governor/gates",
    method: "GET",
    description: "Lists the Governor Gates registry (public read for transparency).",
    rate_limit: "50 req/min/IP",
    auth_required: false,
    category: "governance",
    tags: ["Governance"],
  },
  {
    path: "/api/sgtx/ustn/verify",
    method: "GET",
    description: "Public USTN verification endpoint.",
    rate_limit: "50 req/min/IP",
    auth_required: false,
    category: "trade",
    tags: ["Trade"],
  },
  {
    path: "/api/sgtx/ustn/lifecycle",
    method: "GET",
    description: "Public USTN lifecycle view.",
    rate_limit: "50 req/min/IP",
    auth_required: false,
    category: "trade",
    tags: ["Trade"],
  },
  {
    path: "/api/sgtx/trust-passport/verify",
    method: "GET",
    description: "Public Trust Passport verification endpoint.",
    rate_limit: "50 req/min/IP",
    auth_required: false,
    category: "identity",
    tags: ["Identity"],
  },
  {
    path: "/api/sgtx/release/authorization",
    method: "GET",
    description: "Public container release authorisation verification (Part 8).",
    rate_limit: "60 req/min/IP",
    auth_required: false,
    category: "release",
    tags: ["Release"],
  },
  {
    path: "/api/sgtx/release/webhook",
    method: "POST",
    description: "Public webhook endpoint for terminal-side container release events.",
    rate_limit: "30 req/min/IP",
    auth_required: false,
    category: "release",
    tags: ["Release"],
  },
];

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

    // Optional ?category=X filter (case-insensitive).
    const sp = req.nextUrl.searchParams;
    const categoryFilter = sp.get("category")?.toLowerCase();
    const endpoints = categoryFilter
      ? ENDPOINT_CATALOG.filter((e) => e.category === categoryFilter)
      : ENDPOINT_CATALOG;

    // Group by category for easier consumption.
    const byCategory: Record<string, EndpointEntry[]> = {};
    for (const ep of endpoints) {
      if (!byCategory[ep.category]) byCategory[ep.category] = [];
      byCategory[ep.category].push(ep);
    }

    return NextResponse.json(
      {
        endpoints,
        by_category: byCategory,
        count: endpoints.length,
        total: ENDPOINT_CATALOG.length,
        generated_at: new Date().toISOString(),
        spec_url: "/api/v1/openapi.json",
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
    logger.error("[api/v1/public-endpoints] error:", { error: e?.message || String(e) });
    return NextResponse.json(
      { error: e?.message || "Failed to list public endpoints" },
      { status: 500 },
    );
  }
}

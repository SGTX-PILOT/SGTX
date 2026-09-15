// @ts-nocheck
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/v1/openapi.json — Public OpenAPI 3.0 specification (v17 §18.26)
//
// Returns the canonical OpenAPI 3.0.3 specification for the SGTX public API
// surface. The spec is assembled from a curated catalog of public endpoints
// (the ones explicitly listed in v17 §18.26 — Public Verification & Health
// Endpoints) plus the broader v1 surface (auth, onboarding, verify, gtid,
// ustn, evidence).
//
// No auth required. Rate-limited by the anonymous API bucket (50 req/min)
// in the middleware.
//
// Cache-Control: public, max-age=300 — the spec is stable for 5 minutes
// between deploys. After a deploy, the cache is invalidated automatically
// by the new build hash.

// ============ Public endpoint catalog ============
// Each entry corresponds to a public endpoint documented in v17 §18.26
// or the broader v1 surface. This catalog is the single source of truth
// for the /api/v1/public-endpoints listing as well.

interface PublicEndpoint {
  path: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  summary: string;
  description: string;
  tags: string[];
  rateLimit: string;
  authRequired: boolean;
  parameters?: any[];
  requestBody?: any;
  responses: Record<string, { description: string }>;
}

const PUBLIC_ENDPOINTS: PublicEndpoint[] = [
  // ============ §18.26 — Public Verification & Health Endpoints ============
  {
    path: "/api/v1/openapi.json",
    method: "GET",
    summary: "OpenAPI 3.0 specification",
    description:
      "Returns the full OpenAPI 3.0.3 specification for the SGTX public API surface.",
    tags: ["Public", "System"],
    rateLimit: "50 req/min/IP",
    authRequired: false,
    responses: { "200": { description: "OpenAPI 3.0.3 JSON spec" } },
  },
  {
    path: "/api/v1/status",
    method: "GET",
    summary: "Platform status",
    description:
      "Returns the SGTX platform status (operational | degraded | outage) plus per-service health (governor, database, ai, customs).",
    tags: ["Public", "System"],
    rateLimit: "100 req/min/IP",
    authRequired: false,
    responses: { "200": { description: "Platform status object" } },
  },
  {
    path: "/api/v1/keys",
    method: "GET",
    summary: "SGTX public keys",
    description:
      "Returns the SGTX platform public keys (Ed25519 + Dilithium3) for signature verification.",
    tags: ["Public", "Crypto"],
    rateLimit: "100 req/min/IP",
    authRequired: false,
    responses: { "200": { description: "Array of public keys" } },
  },
  {
    path: "/api/v1/public-endpoints",
    method: "GET",
    summary: "Public endpoint index",
    description:
      "Lists all public endpoints with their HTTP method, description, rate limit, and auth requirement.",
    tags: ["Public"],
    rateLimit: "100 req/min/IP",
    authRequired: false,
    responses: { "200": { description: "Array of public endpoint descriptors" } },
  },
  {
    path: "/api/v1/verify/loom",
    method: "GET",
    summary: "Verify Loom hash chain",
    description:
      "Replays the full Governor Loom hash chain from genesis and returns the verification result.",
    tags: ["Public", "Governance"],
    rateLimit: "10 req/min/IP",
    authRequired: false,
    parameters: [
      { name: "limit", in: "query", schema: { type: "integer", default: 100, maximum: 1000 } },
      { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
    ],
    responses: {
      "200": { description: "Chain verified" },
      "409": { description: "Chain verification failed (mismatches found)" },
      "429": { description: "Rate limit exceeded" },
    },
  },
  {
    path: "/api/v1/gtid/resolve",
    method: "GET",
    summary: "Resolve GTID",
    description: "Resolves a Global Trade ID (GTID) to its registered entity + trust portrait.",
    tags: ["Public", "Identity"],
    rateLimit: "50 req/min/IP",
    authRequired: false,
    parameters: [
      { name: "gtid", in: "query", required: true, schema: { type: "string" } },
    ],
    responses: { "200": { description: "Entity + trust portrait" }, "404": { description: "GTID not found" } },
  },
  {
    path: "/api/v1/ustn/track",
    method: "GET",
    summary: "Track USTN",
    description: "Returns the public tracking view of a Universal Sovereign Trade Number (USTN).",
    tags: ["Public", "Trade"],
    rateLimit: "50 req/min/IP",
    authRequired: false,
    parameters: [
      { name: "ustn", in: "query", required: true, schema: { type: "string" } },
    ],
    responses: { "200": { description: "USTN tracking view" }, "404": { description: "USTN not found" } },
  },
  {
    path: "/api/v1/evidence/package",
    method: "POST",
    summary: "Generate evidence package",
    description:
      "Generates a cryptographically-signed evidence package for a USTN (court-admissible).",
    tags: ["Public", "Evidence"],
    rateLimit: "10 req/min/IP",
    authRequired: false,
    requestBody: {
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              ustn: { type: "string" },
              includeLoom: { type: "boolean", default: true },
              includeGovernor: { type: "boolean", default: true },
              includeTrustPassport: { type: "boolean", default: true },
            },
            required: ["ustn"],
          },
        },
      },
    },
    responses: { "200": { description: "Evidence package (signed)" }, "404": { description: "USTN not found" } },
  },

  // ============ §18.26 — SGTX mirrors (also public) ============
  {
    path: "/api/sgtx/health",
    method: "GET",
    summary: "Liveness probe",
    description: "Lightweight liveness probe — returns 200 if the process is alive and the DB is reachable.",
    tags: ["Public", "System"],
    rateLimit: "60 req/min/IP",
    authRequired: false,
    responses: { "200": { description: "Healthy" }, "503": { description: "Unhealthy" } },
  },
  {
    path: "/api/sgtx/health/ready",
    method: "GET",
    summary: "Readiness probe",
    description:
      "Deep readiness check — probes AI, governor, and external adapters. Slower than /api/sgtx/health.",
    tags: ["Public", "System"],
    rateLimit: "30 req/min/IP",
    authRequired: false,
    responses: { "200": { description: "Ready" }, "503": { description: "Not ready" } },
  },
  {
    path: "/api/sgtx/status",
    method: "GET",
    summary: "Public status page",
    description: "Returns the public status page (overall status, active incidents, upcoming maintenance).",
    tags: ["Public", "System"],
    rateLimit: "60 req/min/IP",
    authRequired: false,
    responses: { "200": { description: "Status page" } },
  },
  {
    path: "/api/sgtx/release/crl",
    method: "GET",
    summary: "Certificate Revocation List (CRL)",
    description:
      "Returns the X.509 CRL for revoked SGTX-signed certificates (container release authorisations).",
    tags: ["Public", "Crypto", "Release"],
    rateLimit: "30 req/min/IP",
    authRequired: false,
    responses: { "200": { description: "CRL (application/pkix-crl)" } },
  },
  {
    path: "/api/sgtx/trust-passport/public-key",
    method: "GET",
    summary: "Trust Passport public key",
    description: "Returns the SGTX platform Ed25519 public key for Trust Passport signature verification.",
    tags: ["Public", "Crypto"],
    rateLimit: "60 req/min/IP",
    authRequired: false,
    responses: { "200": { description: "Ed25519 public key (hex)" } },
  },
  {
    path: "/api/sgtx/governor/verify-loom",
    method: "GET",
    summary: "Verify Loom (SGTX mirror)",
    description: "SGTX-namespace mirror of /api/v1/verify/loom. Same chain-replay verification.",
    tags: ["Public", "Governance"],
    rateLimit: "10 req/min/IP",
    authRequired: false,
    responses: { "200": { description: "Chain verified" } },
  },
];

// ============ Authenticated endpoints (listed but flagged authRequired=true) ============

const AUTH_ENDPOINTS: PublicEndpoint[] = [
  {
    path: "/api/v1/auth/login",
    method: "POST",
    summary: "Login",
    description: "Authenticates a tenant (GTID + password) and returns a session + refresh JWT pair.",
    tags: ["Auth"],
    rateLimit: "10 req/min/IP",
    authRequired: false,
    requestBody: {
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              gtid: { type: "string" },
              password: { type: "string" },
            },
            required: ["gtid", "password"],
          },
        },
      },
    },
    responses: { "200": { description: "Session + refresh token" }, "401": { description: "Invalid credentials" } },
  },
  {
    path: "/api/v1/auth/refresh",
    method: "POST",
    summary: "Refresh session",
    description: "Exchanges a refresh token for a new session + refresh JWT pair.",
    tags: ["Auth"],
    rateLimit: "20 req/min/IP",
    authRequired: false,
    requestBody: { content: { "application/json": { schema: { type: "object", properties: { refresh: { type: "string" } }, required: ["refresh"] } } } },
    responses: { "200": { description: "New session + refresh token" }, "401": { description: "Invalid refresh token" } },
  },
  {
    path: "/api/v1/auth/logout",
    method: "POST",
    summary: "Logout",
    description: "Invalidates the current session token.",
    tags: ["Auth"],
    rateLimit: "20 req/min/IP",
    authRequired: true,
    responses: { "200": { description: "Logged out" } },
  },
  {
    path: "/api/v1/onboarding/start",
    method: "POST",
    summary: "Start onboarding",
    description: "Begins a new tenant onboarding flow. Returns a one-shot token for the next step.",
    tags: ["Onboarding"],
    rateLimit: "10 req/min/IP",
    authRequired: false,
    responses: { "200": { description: "Onboarding token + next step" } },
  },
  {
    path: "/api/v1/onboarding/step",
    method: "POST",
    summary: "Onboarding step",
    description: "Advances the onboarding flow to the next step using the one-shot token.",
    tags: ["Onboarding"],
    rateLimit: "20 req/min/IP",
    authRequired: false,
    responses: { "200": { description: "Step accepted + next step" } },
  },
  {
    path: "/api/v1/onboarding/complete",
    method: "POST",
    summary: "Complete onboarding",
    description: "Completes the onboarding flow and issues the new tenant's first session.",
    tags: ["Onboarding"],
    rateLimit: "10 req/min/IP",
    authRequired: false,
    responses: { "200": { description: "Onboarding complete + session" } },
  },
];

// ============ §18.26 — OpenAPI 3.0.3 spec assembly ============

function buildOpenApiSpec(): any {
  const allEndpoints = [...PUBLIC_ENDPOINTS, ...AUTH_ENDPOINTS];

  const paths: Record<string, any> = {};
  for (const ep of allEndpoints) {
    if (!paths[ep.path]) paths[ep.path] = {};
    paths[ep.path][ep.method.toLowerCase()] = {
      summary: ep.summary,
      description: ep.description,
      tags: ep.tags,
      security: ep.authRequired ? [{ bearerAuth: [] }] : [],
      parameters: ep.parameters ?? [],
      requestBody: ep.requestBody,
      responses: ep.responses,
      "x-rate-limit": ep.rateLimit,
      "x-auth-required": ep.authRequired,
    };
  }

  const tagSet = new Set<string>();
  for (const ep of allEndpoints) {
    for (const t of ep.tags) tagSet.add(t);
  }
  const tags = Array.from(tagSet).map((t) => ({
    name: t,
    description: tagDescription(t),
  }));

  return {
    openapi: "3.0.3",
    info: {
      title: "SGTX Public API",
      version: "v17.0",
      description:
        "Sovereign Governed Trade Execution — public verification, health, status, and key-distribution endpoints per v17 §18.26.",
      contact: { name: "SGTX Platform", url: "https://sgtx.io" },
      license: { name: "Apache 2.0", url: "https://www.apache.org/licenses/LICENSE-2.0.html" },
    },
    servers: [
      { url: "https://api.sgtx.io", description: "Production" },
      { url: "http://localhost:3000", description: "Development" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
    },
    security: [],
    tags,
    paths,
    "x-sgtx-version": "v17",
    "x-sgtx-blueprint-section": "§18.26 — Public Verification & Health Endpoints",
    "x-generated-at": new Date().toISOString(),
  };
}

function tagDescription(tag: string): string {
  const map: Record<string, string> = {
    Public: "Public, unauthenticated endpoints (rate-limited).",
    System: "System health, status, and metrics.",
    Crypto: "Cryptographic key distribution and CRL.",
    Governance: "Governor Loom chain verification.",
    Identity: "GTID (Global Trade ID) resolution.",
    Trade: "USTN (Universal Sovereign Trade Number) tracking.",
    Evidence: "Court-admissible evidence package generation.",
    Release: "Container release authorisation (Part 8).",
    Auth: "Authentication (login, refresh, logout).",
    Onboarding: "Tenant onboarding flow.",
  };
  return map[tag] ?? tag;
}

export async function GET() {
  try {
    const spec = buildOpenApiSpec();
    return NextResponse.json(spec, {
      headers: {
        "Cache-Control": "public, max-age=300",
        "X-SGTX-Version": "v17",
      },
    });
  } catch (e: any) {
    logger.error("[api/v1/openapi.json] error:", { error: e?.message || String(e) });
    return NextResponse.json({ error: "Failed to generate OpenAPI spec" }, { status: 500 });
  }
}

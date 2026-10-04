// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/v1/public-endpoints — Public endpoint index (v18 §18.26)
//
// Lists all public endpoints with their HTTP method, description, rate limit,
// and auth requirement. This is the "public verification index" mentioned in
// v18 §18.26 — a single self-describing catalog that auditors, regulators,
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
    path: "/api/v1/blueprint",
    method: "GET",
    description:
      "Returns the canonical v18 Document Control Block, Layer System (L0/L1/L2), Document Map (24 sections), Three Pillars, and cross-layer Success Condition formula.",
    rate_limit: "100 req/min/IP",
    auth_required: false,
    category: "discovery",
    tags: ["Public", "System", "Blueprint"],
  },
  {
    path: "/api/v1/constitution",
    method: "GET",
    description:
      "Returns the canonical Layer 0 immutable invariants: 7 Governor Principles (G1–G7), 38 Constitutional Points (1–29 + 30–38), AI Authority Ladder (A0–A5), AI Agent Registry, Fallback Chains, and Forbidden Actions (A5).",
    rate_limit: "100 req/min/IP",
    auth_required: false,
    category: "governance",
    tags: ["Public", "Governance", "Constitution"],
  },
  {
    path: "/api/v1/kyb/tiers",
    method: "GET",
    description:
      "Returns the canonical KYB Tier Model (4 tiers), Portal Requirements (11 portal types), KYB Status Model (4 states), Sanctions & PEP Screening rules, Registry Source Classification (5 source types), and existing registry integrations (GLEIF, Nafeza, ETA, D&B, chambers).",
    rate_limit: "100 req/min/IP",
    auth_required: false,
    category: "compliance",
    tags: ["Public", "Compliance", "KYB"],
  },
  {
    path: "/api/sgtx/kyb/tiers",
    method: "GET",
    description:
      "Internal mirror of /api/v1/kyb/tiers — exposes the same canonical KYB metadata for the cockpit admin panel and demo portals.",
    rate_limit: "100 req/min/IP",
    auth_required: false,
    category: "compliance",
    tags: ["Public", "Compliance", "KYB"],
  },
  {
    path: "/api/v1/onboarding/wizard",
    method: "GET",
    description:
      "Returns the canonical 6-step onboarding wizard structure: Welcome & GTID Confirmation, Organization Details, KYB/KYC Verification, Profile Configuration, Create First Resource, Enter Sandbox. Includes AI authority per step, one-click actions, Trade Readiness Assessment (8 categories + scoring formula).",
    rate_limit: "100 req/min/IP",
    auth_required: false,
    category: "onboarding",
    tags: ["Public", "Onboarding", "Wizard"],
  },
  {
    path: "/api/sgtx/onboarding/wizard",
    method: "GET",
    description:
      "Internal mirror of /api/v1/onboarding/wizard — exposes the same canonical onboarding wizard metadata for the cockpit admin panel and demo portals.",
    rate_limit: "100 req/min/IP",
    auth_required: false,
    category: "onboarding",
    tags: ["Public", "Onboarding", "Wizard"],
  },
  {
    path: "/api/v1/ustn/format",
    method: "GET",
    description:
      "Returns the canonical v18 USTN format spec: SGTX-{COUNTRY}-{YEAR}-{TRADER}-{SEQ} (15-22 chars). Includes 5 component definitions, 9 validation rules, atomic counter model, 5 examples, namespace semantics, replay-attack protection, 16 lifecycle statuses, and 7 closure conditions.",
    rate_limit: "100 req/min/IP",
    auth_required: false,
    category: "trade",
    tags: ["Public", "Trade", "USTN"],
  },
  {
    path: "/api/sgtx/ustn/format",
    method: "GET",
    description:
      "Internal mirror of /api/v1/ustn/format — exposes the same canonical v18 USTN format spec for the cockpit admin panel and demo portals.",
    rate_limit: "100 req/min/IP",
    auth_required: false,
    category: "trade",
    tags: ["Public", "Trade", "USTN"],
  },
  {
    path: "/api/v1/workflow/buyer",
    method: "GET",
    description:
      "Returns the canonical 13-section Buyer Workflow form structure (Seller Selection → Incoterm → Transport → Commodity → Lab Tests → QC → AI Advisor → Documents → Insurance → Delivery → Criticality → Draft Auto-Save → Submit). Includes 6 core principles, AI authority per step, Governor gates, and Trade Request Readiness scoring (10 components).",
    rate_limit: "100 req/min/IP",
    auth_required: false,
    category: "workflow",
    tags: ["Public", "Workflow", "Buyer"],
  },
  {
    path: "/api/sgtx/workflow/buyer",
    method: "GET",
    description:
      "Internal mirror of /api/v1/workflow/buyer — exposes the same canonical Buyer Workflow form structure for the cockpit admin panel and demo portals.",
    rate_limit: "100 req/min/IP",
    auth_required: false,
    category: "workflow",
    tags: ["Public", "Workflow", "Buyer"],
  },
  {
    path: "/api/v1/workflow/cfr",
    method: "GET",
    description:
      "Returns the canonical Conditional Financing Reference (CFR) two-phase financing model: Phase A pre-clearance (6 steps A1-A6, non-binding CFR) + Phase B formal execution (4 steps B1-B4, binding agreement). Includes 5 semantic distinctions, CFR data model (13 fields + 5 statuses), buyer/seller financing toggles, 9 API endpoints, and 5 Governor gates (G1U9-G1U13).",
    rate_limit: "100 req/min/IP",
    auth_required: false,
    category: "workflow",
    tags: ["Public", "Workflow", "CFR", "Financing"],
  },
  {
    path: "/api/sgtx/workflow/cfr",
    method: "GET",
    description:
      "Internal mirror of /api/v1/workflow/cfr — exposes the same canonical CFR model for the cockpit admin panel and demo portals.",
    rate_limit: "100 req/min/IP",
    auth_required: false,
    category: "workflow",
    tags: ["Public", "Workflow", "CFR", "Financing"],
  },
  {
    path: "/api/v1/workflow/seller",
    method: "GET",
    description:
      "Returns the canonical 25-step Seller Workflow (Phase 2: Quote, Packing & Logistics): Receive Request → Seller Brief → Feasibility → Decision → Loading Origin → Product/Availability → Quality Matching → Packing → Logistics (3 modes) → Alternative Ports → Cost Engine → EXW Lock → Margin → Scenario Builder → Confidentiality → Doc Readiness → Regulatory → Doc Generation → Delivery Schedule → Multi-Shipment → Quote Construction → Status → Versioning → Expiry → Negotiation. Includes 12 core principles, 3 logistics modes, 7 quote statuses.",
    rate_limit: "100 req/min/IP",
    auth_required: false,
    category: "workflow",
    tags: ["Public", "Workflow", "Seller"],
  },
  {
    path: "/api/sgtx/workflow/seller",
    method: "GET",
    description:
      "Internal mirror of /api/v1/workflow/seller — exposes the same canonical Seller Workflow for the cockpit admin panel and demo portals.",
    rate_limit: "100 req/min/IP",
    auth_required: false,
    category: "workflow",
    tags: ["Public", "Workflow", "Seller"],
  },
  {
    path: "/api/v1/workflow/negotiation",
    method: "GET",
    description:
      "Returns the canonical Phase 3 Negotiation/Contracting/Lock workflow: 12-stage master flow (A-L: Receive → Understand → Negotiate → Resolve → Mutual Confirm → Contract Formation → Validation → Fee/Lock Conditions → Signing → Lock → USTN Generation → Canonical Handoff), 14 negotiation components (versioned model, side-by-side diff, impact analysis, partial accept, counteroffer, clarification, deadline extension, etc.), 2 contract generation paths (Clause Forge A2 + Upload Own), 7 final lock preconditions (G1U22-G1U27 + G1U11 CFR), atomic lock semantics, USTN generation at lock, 5 canonical events.",
    rate_limit: "100 req/min/IP",
    auth_required: false,
    category: "workflow",
    tags: ["Public", "Workflow", "Negotiation"],
  },
  {
    path: "/api/sgtx/workflow/negotiation",
    method: "GET",
    description:
      "Internal mirror of /api/v1/workflow/negotiation — exposes the same canonical Phase 3 workflow for the cockpit admin panel and demo portals.",
    rate_limit: "100 req/min/IP",
    auth_required: false,
    category: "workflow",
    tags: ["Public", "Workflow", "Negotiation"],
  },
  {
    path: "/api/v1/workflow/finance",
    method: "GET",
    description:
      "Returns the canonical Phase 4 Formal Trade Finance Execution workflow: 8 principles, 6 semantic distinctions (Financing Request/Bid/Agreement/AI Credit/Collateral/Co-Financing), 8 financing types (Working Capital, L/C, Factoring, Forfaiting, SCF, Export Credit, Bridge Loan, Inventory Finance), ERR envelope, AI credit intelligence (advisory only), RFQ + preference engine, bid acceptance + co-financing, disbursement (bank-to-bank ISO 20022 non-custodial), repayment monitoring (5 alert stages), collateral management, default + recovery (5-step process), 6 Governor gates (G1U28-G1U33), and regulatory reporting.",
    rate_limit: "100 req/min/IP",
    auth_required: false,
    category: "workflow",
    tags: ["Public", "Workflow", "Finance"],
  },
  {
    path: "/api/sgtx/workflow/finance",
    method: "GET",
    description:
      "Internal mirror of /api/v1/workflow/finance — exposes the same canonical Phase 4 finance workflow for the cockpit admin panel and demo portals.",
    rate_limit: "100 req/min/IP",
    auth_required: false,
    category: "workflow",
    tags: ["Public", "Workflow", "Finance"],
  },
  {
    path: "/api/sgtx/constitution",
    method: "GET",
    description:
      "Internal mirror of /api/v1/constitution — exposes the same Layer 0 immutable invariants for cockpit admin panel and demo portals.",
    rate_limit: "100 req/min/IP",
    auth_required: false,
    category: "governance",
    tags: ["Public", "Governance", "Constitution"],
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

  // ============ v18 §2.5 — Authenticated Platform-Wide Components ============
  {
    path: "/api/v1/search",
    method: "GET",
    description:
      "Authenticated universal search across the caller's authorised universe: shipments, quotes, contracts, financing agreements, disputes, contacts (v18 §2.5.4).",
    rate_limit: "50 req/min/IP",
    auth_required: true,
    category: "search",
    tags: ["Authenticated", "Search"],
  },
  {
    path: "/api/v1/employee/switch-context",
    method: "POST",
    description:
      "Dual trader-mode toggle (BUY ↔ SELL). Audited action that flips the caller's activeTraderMode JWT claim (v18 §2.5.3). Only valid for DUAL-eligible TRD tenants.",
    rate_limit: "10 req/min/employee",
    auth_required: true,
    category: "employee",
    tags: ["Authenticated", "Employee"],
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

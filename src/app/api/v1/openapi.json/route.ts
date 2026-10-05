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
    path: "/api/v1/blueprint",
    method: "GET",
    summary: "Blueprint metadata (Document Control Block)",
    description:
      "Returns the canonical v18 Document Control Block, Layer System (L0/L1/L2), Document Map (24 sections), Three Unshakable Pillars, and the cross-layer Success Condition formula (§1 + §1.1 + §2).",
    tags: ["Public", "System", "Blueprint"],
    rateLimit: "100 req/min/IP",
    authRequired: false,
    responses: {
      "200": { description: "Blueprint metadata object" },
      "429": { description: "Rate limit exceeded" },
      "503": { description: "Blueprint metadata unavailable" },
    },
  },
  {
    path: "/api/v1/constitution",
    method: "GET",
    summary: "Constitutional foundation (Layer 0)",
    description:
      "Returns the canonical Layer 0 immutable invariants: 7 Governor Principles (G1–G7), 38 Constitutional Points (1–29 + 30–38), AI Authority Ladder (A0–A5), AI Agent Registry, Fallback Chains, and Forbidden Actions (A5). v18 §3.",
    tags: ["Public", "Governance", "Constitution"],
    rateLimit: "100 req/min/IP",
    authRequired: false,
    responses: {
      "200": { description: "Constitution payload object" },
      "429": { description: "Rate limit exceeded" },
      "503": { description: "Constitution metadata unavailable" },
    },
  },
  {
    path: "/api/v1/kyb/tiers",
    method: "GET",
    summary: "KYB Tier Model + Portal Requirements",
    description:
      "Returns the canonical KYB Tier Model (4 tiers: Basic, Standard, Enhanced, Diplomatic), 11 Portal Requirements, 4 KYB Statuses, Sanctions & PEP Screening rules, 5 Registry Source Types, and 5 Existing Registry Integrations. v18 §4.2.",
    tags: ["Public", "Compliance", "KYB"],
    rateLimit: "100 req/min/IP",
    authRequired: false,
    responses: {
      "200": { description: "KYB payload object" },
      "429": { description: "Rate limit exceeded" },
      "503": { description: "KYB metadata unavailable" },
    },
  },
  {
    path: "/api/sgtx/kyb/tiers",
    method: "GET",
    summary: "KYB Tier Model (internal mirror)",
    description:
      "Internal mirror of /api/v1/kyb/tiers — exposes the same canonical KYB metadata for the cockpit admin panel and demo portals.",
    tags: ["Public", "Compliance", "KYB"],
    rateLimit: "100 req/min/IP",
    authRequired: false,
    responses: {
      "200": { description: "KYB payload object" },
      "503": { description: "KYB metadata unavailable" },
    },
  },
  {
    path: "/api/v1/onboarding/wizard",
    method: "GET",
    summary: "Onboarding Wizard (6 steps)",
    description:
      "Returns the canonical 6-step onboarding wizard structure (Welcome & GTID Confirmation, Organization Details, KYB/KYC Verification, Profile Configuration, Create First Resource, Enter Sandbox) with AI authority per step, one-click actions, post-onboarding go-live conditions, and Trade Readiness Assessment (8 categories + scoring formula). v18 §4.3.",
    tags: ["Public", "Onboarding", "Wizard"],
    rateLimit: "100 req/min/IP",
    authRequired: false,
    responses: {
      "200": { description: "Onboarding wizard payload object" },
      "429": { description: "Rate limit exceeded" },
      "503": { description: "Onboarding wizard metadata unavailable" },
    },
  },
  {
    path: "/api/sgtx/onboarding/wizard",
    method: "GET",
    summary: "Onboarding Wizard (internal mirror)",
    description:
      "Internal mirror of /api/v1/onboarding/wizard — exposes the same canonical onboarding wizard metadata for the cockpit admin panel and demo portals.",
    tags: ["Public", "Onboarding", "Wizard"],
    rateLimit: "100 req/min/IP",
    authRequired: false,
    responses: {
      "200": { description: "Onboarding wizard payload object" },
      "503": { description: "Onboarding wizard metadata unavailable" },
    },
  },
  {
    path: "/api/v1/ustn/format",
    method: "GET",
    summary: "USTN v18 format spec",
    description:
      "Returns the canonical v18 USTN format spec: SGTX-{COUNTRY}-{YEAR}-{TRADER}-{SEQ} (15-22 chars). Includes 5 component definitions, 9 validation rules, atomic counter model (per year per trader), 5 examples, namespace semantics (canonical, external IDs preserved, mandatory, immutable, multi-shipment, generation point, physical embodiment, AI assistance), replay-attack protection (5 protections + verification endpoint), 16 lifecycle statuses, and 7 closure conditions. v18 §5.1.",
    tags: ["Public", "Trade", "USTN"],
    rateLimit: "100 req/min/IP",
    authRequired: false,
    responses: {
      "200": { description: "USTN format payload object" },
      "429": { description: "Rate limit exceeded" },
      "503": { description: "USTN format metadata unavailable" },
    },
  },
  {
    path: "/api/sgtx/ustn/format",
    method: "GET",
    summary: "USTN v18 format spec (internal mirror)",
    description:
      "Internal mirror of /api/v1/ustn/format — exposes the same canonical v18 USTN format spec for the cockpit admin panel and demo portals.",
    tags: ["Public", "Trade", "USTN"],
    rateLimit: "100 req/min/IP",
    authRequired: false,
    responses: {
      "200": { description: "USTN format payload object" },
      "503": { description: "USTN format metadata unavailable" },
    },
  },
  {
    path: "/api/v1/workflow/buyer",
    method: "GET",
    summary: "Buyer Workflow (Phase 1: Trade Initiation)",
    description:
      "Returns the canonical 13-section Buyer Workflow form structure per v18 §6.1.3: Seller Selection → Incoterm + Commercial Foundation → Transport Mode & Equipment → Container/Commodity → Lab Tests → QC Inspection → AI Container Advisor → Documentation → Insurance → Delivery Window → Criticality → Draft Auto-Save → Submit. Includes 6 core principles, AI authority per step (A1 Groq, A2 RIA, A4 WasmEdge, GNN), Governor pre-screen gates, Executive Approval Layer (> $100k), and Trade Request Readiness scoring (10 components).",
    tags: ["Public", "Workflow", "Buyer"],
    rateLimit: "100 req/min/IP",
    authRequired: false,
    responses: {
      "200": { description: "Buyer workflow payload object" },
      "429": { description: "Rate limit exceeded" },
      "503": { description: "Buyer workflow metadata unavailable" },
    },
  },
  {
    path: "/api/sgtx/workflow/buyer",
    method: "GET",
    summary: "Buyer Workflow (internal mirror)",
    description:
      "Internal mirror of /api/v1/workflow/buyer — exposes the same canonical Buyer Workflow form structure for the cockpit admin panel and demo portals.",
    tags: ["Public", "Workflow", "Buyer"],
    rateLimit: "100 req/min/IP",
    authRequired: false,
    responses: {
      "200": { description: "Buyer workflow payload object" },
      "503": { description: "Buyer workflow metadata unavailable" },
    },
  },
  {
    path: "/api/v1/workflow/cfr",
    method: "GET",
    summary: "Conditional Financing Reference (CFR)",
    description:
      "Returns the canonical CFR two-phase financing model per v18 §7: Phase A pre-clearance (6 steps A1-A6 → non-binding CFR) + Phase B formal execution (4 steps B1-B4 → binding agreement). Includes 5 semantic distinctions (declaration/digest/CFR/formal request/agreement), CFR data model (13 fields + 5 statuses), buyer/seller financing toggles (data-sovereign), 9 API endpoints, and 5 Governor gates (G1U9-G1U13).",
    tags: ["Public", "Workflow", "CFR", "Financing"],
    rateLimit: "100 req/min/IP",
    authRequired: false,
    responses: {
      "200": { description: "CFR payload object" },
      "429": { description: "Rate limit exceeded" },
      "503": { description: "CFR metadata unavailable" },
    },
  },
  {
    path: "/api/sgtx/workflow/cfr",
    method: "GET",
    summary: "CFR (internal mirror)",
    description:
      "Internal mirror of /api/v1/workflow/cfr — exposes the same canonical CFR model for the cockpit admin panel and demo portals.",
    tags: ["Public", "Workflow", "CFR", "Financing"],
    rateLimit: "100 req/min/IP",
    authRequired: false,
    responses: {
      "200": { description: "CFR payload object" },
      "503": { description: "CFR metadata unavailable" },
    },
  },
  {
    path: "/api/v1/workflow/seller",
    method: "GET",
    summary: "Seller Workflow (Phase 2: Quote, Packing & Logistics)",
    description:
      "Returns the canonical 25-step Seller Workflow per v18 §8: Receive Request → Seller Brief → Feasibility → Decision → Loading Origin → Product/Availability → Quality Matching → Packing → Logistics (3 modes A/B/C) → Alternative Ports → Cost Engine → EXW Lock → Margin → Scenario Builder → Confidentiality → Doc Readiness → Regulatory → Doc Generation → Delivery Schedule → Multi-Shipment → Quote Construction → Status → Versioning → Expiry → Negotiation. Includes 12 core principles, 3 logistics modes (Manual/RFQ-LSP/Direct-SHIP), 7 quote statuses, timeline (days 5-8), and 7-component quote composition.",
    tags: ["Public", "Workflow", "Seller"],
    rateLimit: "100 req/min/IP",
    authRequired: false,
    responses: {
      "200": { description: "Seller workflow payload object" },
      "429": { description: "Rate limit exceeded" },
      "503": { description: "Seller workflow metadata unavailable" },
    },
  },
  {
    path: "/api/sgtx/workflow/seller",
    method: "GET",
    summary: "Seller Workflow (internal mirror)",
    description:
      "Internal mirror of /api/v1/workflow/seller — exposes the same canonical Seller Workflow for the cockpit admin panel and demo portals.",
    tags: ["Public", "Workflow", "Seller"],
    rateLimit: "100 req/min/IP",
    authRequired: false,
    responses: {
      "200": { description: "Seller workflow payload object" },
      "503": { description: "Seller workflow metadata unavailable" },
    },
  },
  {
    path: "/api/v1/workflow/negotiation",
    method: "GET",
    summary: "Negotiation Workflow (Phase 3)",
    description:
      "Returns the canonical Phase 3 Negotiation/Contracting/Lock workflow per v18 §9: 12-stage master flow (A-L), 14 negotiation components, 2 contract generation paths (Clause Forge A2 + Upload Own), mandatory SGTX Witness Clause (non-removable), Canonical Fee Basis (7 components), 7 final lock preconditions (G1U22-G1U27 + G1U11 CFR), atomic lock semantics, USTN generation at lock, 5 canonical events (contract.locked, feeling.locked, ustn.generated, loom.anchored, cfr.converted), and CFR gate at lock.",
    tags: ["Public", "Workflow", "Negotiation"],
    rateLimit: "100 req/min/IP",
    authRequired: false,
    responses: {
      "200": { description: "Negotiation workflow payload object" },
      "429": { description: "Rate limit exceeded" },
      "503": { description: "Negotiation workflow metadata unavailable" },
    },
  },
  {
    path: "/api/sgtx/workflow/negotiation",
    method: "GET",
    summary: "Negotiation Workflow (internal mirror)",
    description:
      "Internal mirror of /api/v1/workflow/negotiation — exposes the same canonical Phase 3 workflow for the cockpit admin panel and demo portals.",
    tags: ["Public", "Workflow", "Negotiation"],
    rateLimit: "100 req/min/IP",
    authRequired: false,
    responses: {
      "200": { description: "Negotiation workflow payload object" },
      "503": { description: "Negotiation workflow metadata unavailable" },
    },
  },
  {
    path: "/api/v1/workflow/finance",
    method: "GET",
    summary: "Formal Trade Finance Workflow (Phase 4)",
    description:
      "Returns the canonical Phase 4 Formal Trade Finance Execution workflow per v18 §10: 8 principles, 6 semantic distinctions, 8 financing types (Working Capital, L/C, Factoring, Forfaiting, SCF, Export Credit, Bridge Loan, Inventory Finance), ERR envelope (amount control), AI credit intelligence (advisory only — A1 + A2), Financing RFQ, Financier Preference Engine (versioned), bid acceptance + co-financing (annex A/B/C), disbursement (bank-to-bank ISO 20022 non-custodial — G7), repayment monitoring (5 alert stages), collateral management (pledge + valuation + release), default + recovery (5-step process), 6 Governor gates (G1U28-G1U33), and regulatory reporting.",
    tags: ["Public", "Workflow", "Finance"],
    rateLimit: "100 req/min/IP",
    authRequired: false,
    responses: {
      "200": { description: "Finance workflow payload object" },
      "429": { description: "Rate limit exceeded" },
      "503": { description: "Finance workflow metadata unavailable" },
    },
  },
  {
    path: "/api/sgtx/workflow/finance",
    method: "GET",
    summary: "Finance Workflow (internal mirror)",
    description:
      "Internal mirror of /api/v1/workflow/finance — exposes the same canonical Phase 4 finance workflow for the cockpit admin panel and demo portals.",
    tags: ["Public", "Workflow", "Finance"],
    rateLimit: "100 req/min/IP",
    authRequired: false,
    responses: {
      "200": { description: "Finance workflow payload object" },
      "503": { description: "Finance workflow metadata unavailable" },
    },
  },
  {
    path: "/api/v1/workflow/service-provider",
    method: "GET",
    summary: "Service Provider Capability Model (v18 §11)",
    description:
      "Returns the canonical Service Provider Capability Model: 11 service capabilities (TRUCKING, FORWARDING, WAREHOUSING, OCEAN_FREIGHT, AIR_FREIGHT, CUSTOMS_BROKERAGE, PHYSICAL_HANDLING, STORAGE, AUDIT_REPRESENTATION, LAB_TESTING, QC_INSPECTION), 9 core principles, 8-step provider onboarding, 5-step RFQ→Quote→Review→Selection flow, 6 eligibility filters, 12 unified quotation common fields, 5 provider-specific workflows (LSP/SHIP/LAB/QC/CBR), and geo-aware service matching.",
    tags: ["Public", "Workflow", "ServiceProvider"],
    rateLimit: "100 req/min/IP",
    authRequired: false,
    responses: {
      "200": { description: "Service provider payload object" },
      "429": { description: "Rate limit exceeded" },
      "503": { description: "Service provider metadata unavailable" },
    },
  },
  {
    path: "/api/sgtx/workflow/service-provider",
    method: "GET",
    summary: "Service Provider (internal mirror)",
    description:
      "Internal mirror of /api/v1/workflow/service-provider.",
    tags: ["Public", "Workflow", "ServiceProvider"],
    rateLimit: "100 req/min/IP",
    authRequired: false,
    responses: {
      "200": { description: "Service provider payload object" },
      "503": { description: "Service provider metadata unavailable" },
    },
  },
  {
    path: "/api/v1/workflow/physical-execution",
    method: "GET",
    summary: "Physical Execution Workflow (Phase 5, v18 §12)",
    description:
      "Returns the canonical Phase 5 Physical Execution & Multiparty Tracking workflow: 9 principles, 9 workflow steps (Pre-Execution Setup → Container Release & Loading → QC Inspection → Vessel Departure → In-Transit → Arrival → Customs Import → Delivery → Settlement), Container Identity (ISO 6346), Pallet Identity (SSCC GS1-128), 7 multi-clock views, 8 milestone-triggered payment legs, Conditional QC Hold impact, Mobile App (3 types + 3 barcode formats + 5 scan events), and USTN QR Code (7-step scan workflow).",
    tags: ["Public", "Workflow", "PhysicalExecution"],
    rateLimit: "100 req/min/IP",
    authRequired: false,
    responses: {
      "200": { description: "Physical execution payload object" },
      "429": { description: "Rate limit exceeded" },
      "503": { description: "Physical execution metadata unavailable" },
    },
  },
  {
    path: "/api/sgtx/workflow/physical-execution",
    method: "GET",
    summary: "Physical Execution (internal mirror)",
    description:
      "Internal mirror of /api/v1/workflow/physical-execution.",
    tags: ["Public", "Workflow", "PhysicalExecution"],
    rateLimit: "100 req/min/IP",
    authRequired: false,
    responses: {
      "200": { description: "Physical execution payload object" },
      "503": { description: "Physical execution metadata unavailable" },
    },
  },
  {
    path: "/api/v1/workflow/settlement",
    method: "GET",
    summary: "Settlement + Post-Trade Workflow (Phases 6-8, v18 §13+§14)",
    description:
      "Returns the canonical Phase 6 Settlement + Phases 7-8 Post-Trade workflow: 7 settlement stages, 8 direct bank settlement principles, USTN Multi-Leg Manifest (11 fields + 9-field leg structure), ISO 20022 USTN binding, Reconciliation Engine (≥95% auto / <95% manual), 3 distressed cargo triage paths, 10 dispute categories, 4-step escalation ladder, 4 resolution outcomes, and 7 USTN closure conditions (canClose predicate).",
    tags: ["Public", "Workflow", "Settlement", "PostTrade"],
    rateLimit: "100 req/min/IP",
    authRequired: false,
    responses: {
      "200": { description: "Settlement + post-trade payload object" },
      "429": { description: "Rate limit exceeded" },
      "503": { description: "Settlement metadata unavailable" },
    },
  },
  {
    path: "/api/sgtx/workflow/settlement",
    method: "GET",
    summary: "Settlement + Post-Trade (internal mirror)",
    description:
      "Internal mirror of /api/v1/workflow/settlement.",
    tags: ["Public", "Workflow", "Settlement", "PostTrade"],
    rateLimit: "100 req/min/IP",
    authRequired: false,
    responses: {
      "200": { description: "Settlement + post-trade payload object" },
      "503": { description: "Settlement metadata unavailable" },
    },
  },
  {
    path: "/api/v1/reference/consolidated",
    method: "GET",
    summary: "Consolidated Reference (v18 §15-§24)",
    description:
      "Returns the consolidated canonical reference for v18 §15-§24: 42 Governor gates (G1U1-G1U42) across 7 groups, 10 portals, 4 command center components, Trade Health Score formula, 24 data model domains (425+ tables), 25 API endpoint categories (400+ endpoints), 5 finality rules, 6 transport engines, 18 platform guarantees, 51 platform add-ons, 4 barcode formats, 7 workflow examples, 15 key terms, 8 roadmap phases, and 4 validation gates.",
    tags: ["Public", "Reference", "Consolidated"],
    rateLimit: "100 req/min/IP",
    authRequired: false,
    responses: {
      "200": { description: "Consolidated reference payload object" },
      "429": { description: "Rate limit exceeded" },
      "503": { description: "Consolidated reference metadata unavailable" },
    },
  },
  {
    path: "/api/sgtx/reference/consolidated",
    method: "GET",
    summary: "Consolidated Reference (internal mirror)",
    description:
      "Internal mirror of /api/v1/reference/consolidated.",
    tags: ["Public", "Reference", "Consolidated"],
    rateLimit: "100 req/min/IP",
    authRequired: false,
    responses: {
      "200": { description: "Consolidated reference payload object" },
      "503": { description: "Consolidated reference metadata unavailable" },
    },
  },
  {
    path: "/api/v1/identity/access",
    method: "GET",
    summary: "Identity & Access Architecture (v18 §4.4-§4.12)",
    description:
      "Returns the canonical Identity & Access Architecture for v18 §4.4-§4.12: 14 employee record fields, 41 permissions across 10 role types (Buyer/Seller/LSP/SHIP/LAB/QC/CBR/FIN/GOV/ADM), 7 roles (OWNER/ADMIN/TRADER/COMPLIANCE/FINANCE/OPERATIONS/READONLY), 10 role journey maps (TRADER_BUYER 22 days/8 steps, TRADER_SELLER 21 days/9 steps, LSP 6 days/6 steps, SHIP 8 days/7 steps, LAB 5 days/5 steps, QC 5 days/5 steps, CBR 7 days/6 steps, FIN 30+ days/6 steps, GOV ongoing/4 steps, MP ongoing/3 steps), 5 data scopes (cost hiding, mode scoping, business unit, field-level, consent-gated), dual-mode toggle (BUY/SELL/DUAL with OPA + voice + WCAG), session+device security (4 step-up factors, session risk engine), consent management (6 purposes with W3C + revocation), internal organisation (business units/departments/cost centres/approval groups/policies), tenant lifecycle (7-state machine), saved contacts (non-marketplace, GNN trust portrait), and SGTX Trade Trust Passport™ (W3C Verifiable Credential with Ed25519 proof).",
    tags: ["Public", "Identity", "Access"],
    rateLimit: "100 req/min/IP",
    authRequired: false,
    responses: {
      "200": { description: "Identity & Access payload object" },
      "429": { description: "Rate limit exceeded" },
      "503": { description: "Identity & Access metadata unavailable" },
    },
  },
  {
    path: "/api/sgtx/identity/access",
    method: "GET",
    summary: "Identity & Access (internal mirror)",
    description:
      "Internal mirror of /api/v1/identity/access.",
    tags: ["Public", "Identity", "Access"],
    rateLimit: "100 req/min/IP",
    authRequired: false,
    responses: {
      "200": { description: "Identity & Access payload object" },
      "503": { description: "Identity & Access metadata unavailable" },
    },
  },
  {
    path: "/api/v1/trust/passport/{gtid}",
    method: "GET",
    summary: "Trust Passport (W3C Verifiable Credential)",
    description:
      "Returns the canonical W3C Verifiable Credential for the tenant's Trust Passport per v18 §4.12.4. Auth required — caller must be the passport owner. Returns 404 if no passport exists, 410 if expired or revoked. The credential includes TRI score + confidence + status + 8 dimensions + verified identifiers + Ed25519Signature2018 proof.",
    tags: ["Authenticated", "Trust", "Passport"],
    rateLimit: "100 req/min/IP",
    authRequired: true,
    parameters: [
      { name: "gtid", in: "path", required: true, schema: { type: "string" } },
    ],
    responses: {
      "200": { description: "W3C Verifiable Credential for the Trust Passport" },
      "401": { description: "Authentication required" },
      "403": { description: "Access denied — caller is not the passport owner" },
      "404": { description: "Passport not found" },
      "410": { description: "Passport expired or revoked" },
    },
  },
  {
    path: "/api/v1/trust/share",
    method: "POST",
    summary: "Share Trust Passport (generate token)",
    description:
      "Generate a one-time sharing token for the caller's Trust Passport per v18 §4.12.4 Step 2. The recipient must be a saved contact (non-marketplace rule). Returns a verification URL + the token. Token expires in 7 days by default (max 30 days).",
    tags: ["Authenticated", "Trust", "Passport"],
    rateLimit: "20 req/min/IP",
    authRequired: true,
    requestBody: {
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              shared_with_gtid: { type: "string", description: "Recipient GTID (must be a saved contact) or null for 'anyone with link'" },
              dimensions: {
                type: "array",
                items: { type: "string" },
                description: "Dimensions to share (e.g., 'tri_score', 'compliance_health', 'verified_identifiers')",
              },
              expires_in_days: { type: "integer", default: 7, maximum: 30 },
            },
          },
        },
      },
    },
    responses: {
      "200": { description: "Token + verification URL" },
      "401": { description: "Authentication required" },
      "403": { description: "Recipient is not a saved contact" },
      "404": { description: "Caller has no Trust Passport" },
      "410": { description: "Caller's Trust Passport expired" },
    },
  },
  {
    path: "/api/v1/trust/verify/{token}",
    method: "GET",
    summary: "Verify Trust Passport (public, token = capability)",
    description:
      "Public Trust Passport verification per v18 §4.12.4 Step 3. The token in the URL acts as a capability token — no auth required. Returns the W3C Verifiable Credential with only the consented dimensions. Returns {valid: false, reason: 'revoked'|'expired'|'TOKEN_NOT_FOUND'|...} for invalid tokens.",
    tags: ["Public", "Trust", "Passport"],
    rateLimit: "100 req/min/IP",
    authRequired: false,
    parameters: [
      { name: "token", in: "path", required: true, schema: { type: "string" } },
    ],
    responses: {
      "200": { description: "Verifiable Credential with consented dimensions (or {valid: false, reason: ...})" },
      "404": { description: "Token not found" },
      "410": { description: "Token revoked or expired, or passport expired/revoked" },
    },
  },
  {
    path: "/api/v1/trust/revoke",
    method: "POST",
    summary: "Revoke Trust Passport sharing token",
    description:
      "Revoke a Trust Passport sharing token per v18 §4.12.4 Step 4. Auth required — caller must be the original sharer. Revocation is immediate; subsequent verify attempts for that token return {valid: false, reason: 'revoked'}.",
    tags: ["Authenticated", "Trust", "Passport"],
    rateLimit: "20 req/min/IP",
    authRequired: true,
    requestBody: {
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              token: { type: "string", description: "The sharing token to revoke" },
            },
            required: ["token"],
          },
        },
      },
    },
    responses: {
      "200": { description: "Token revoked (or was already revoked)" },
      "401": { description: "Authentication required" },
      "403": { description: "Caller is not the original sharer" },
      "404": { description: "Token not found" },
    },
  },
  {
    path: "/api/v1/identity/gtid/generate",
    method: "POST",
    summary: "GTID Generation (internal, v18 §4.1.4.3)",
    description:
      "Internal GTID generation endpoint per v18 §4.1.4.3. Only called during onboarding. Generates a GTID for the given (country, entity_type) pair, persists the atomic sequence, and returns the GTID + sequence + checksum. Auth required — ADM/GOV role only. Atomic sequence per (country, entity_type) via gtid_sequences table upsert.",
    tags: ["Authenticated", "Identity", "GTID"],
    rateLimit: "10 req/min/caller",
    authRequired: true,
    requestBody: {
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              country_code: { type: "string", description: "ISO 3166-1 alpha-2 (e.g., 'EG')" },
              entity_type: { type: "string", enum: ["TRD", "LSP", "SHIP", "LAB", "QC", "CBR", "FIN", "GOV", "MP"] },
              legal_name: { type: "string", description: "Legal name (min 2 chars)" },
              jurisdiction: { type: "string", description: "Jurisdiction code (defaults to country_code)" },
            },
            required: ["country_code", "entity_type", "legal_name"],
          },
        },
      },
    },
    responses: {
      "200": { description: "GTID generated + tenant created (lifecycle_state=REGISTERED) + Governor audit log" },
      "401": { description: "Authentication required" },
      "403": { description: "Caller is not ADM/GOV" },
      "400": { description: "Invalid country_code/entity_type/legal_name" },
      "429": { description: "Rate limit exceeded (10 req/min/caller)" },
    },
  },
  {
    path: "/api/v1/identity/ustn/generate",
    method: "POST",
    summary: "USTN Generation (internal, v18 §5.1.6)",
    description:
      "Internal USTN generation endpoint per v18 §5.1.6. Only called during contract lock (Phase 3 Stage J → K). Generates a v18 format USTN SGTX-{COUNTRY}-{YEAR}-{TRADER}-{SEQ} with atomic sequence per (country, year, traderId). Body: {seller_gtid, buyer_gtid, contract_id, shipment_number}. Auth required — caller must be buyer/seller on the contract or ADM/GOV. Returns USTN + country + year + trader_id + sequence + loom_hash.",
    tags: ["Authenticated", "Identity", "USTN"],
    rateLimit: "5 req/min/caller",
    authRequired: true,
    requestBody: {
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              seller_gtid: { type: "string", description: "Seller GTID (format: SGTX-{CC}-{TYPE}-{SEQ6}-{CHECKSUM4})" },
              buyer_gtid: { type: "string", description: "Buyer GTID" },
              contract_id: { type: "string", description: "Contract ID from the locked contract" },
              shipment_number: { type: "integer", default: 1, description: "Shipment sequence within the contract (for multi-shipment)" },
            },
            required: ["seller_gtid", "buyer_gtid", "contract_id"],
          },
        },
      },
    },
    responses: {
      "200": { description: "USTN generated + Governor audit log + Loom hash" },
      "401": { description: "Authentication required" },
      "403": { description: "Caller is not buyer/seller/ADM/GOV" },
      "400": { description: "Invalid GTID format or missing fields" },
      "429": { description: "Rate limit exceeded (5 req/min/caller)" },
    },
  },
  {
    path: "/api/v1/ustn/{ustn}",
    method: "GET",
    summary: "USTN Master Object resolution (v18 §5.5.2)",
    description:
      "Returns the USTN master object per v18 §5.5.2 with role-based filtering. Auth required. LSP sees only their services; buyer sees full commercial terms but not seller costs; financier sees all trade data; gov sees only compliance documents. Query params: include_timeline (default true), include_documents (default role-dependent), version (cached version). Rate limit 100 req/min per tenant.",
    tags: ["Authenticated", "Trade", "USTN"],
    rateLimit: "100 req/min/tenant",
    authRequired: true,
    parameters: [
      { name: "ustn", in: "path", required: true, schema: { type: "string" } },
      { name: "include_timeline", in: "query", schema: { type: "boolean", default: true } },
      { name: "include_documents", in: "query", schema: { type: "boolean" } },
      { name: "version", in: "query", schema: { type: "string" } },
    ],
    responses: {
      "200": { description: "USTN master object filtered by requester role" },
      "401": { description: "Authentication required" },
      "400": { description: "Invalid USTN format" },
      "404": { description: "USTN not found" },
      "429": { description: "Rate limit exceeded (100 req/min/tenant)" },
    },
  },
  {
    path: "/api/sgtx/constitution",
    method: "GET",
    summary: "Constitutional foundation (internal mirror)",
    description:
      "Internal mirror of /api/v1/constitution — exposes the same Layer 0 immutable invariants for the cockpit admin panel and demo portals.",
    tags: ["Public", "Governance", "Constitution"],
    rateLimit: "100 req/min/IP",
    authRequired: false,
    responses: {
      "200": { description: "Constitution payload object" },
      "503": { description: "Constitution metadata unavailable" },
    },
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
  // ============ v18 §2.5 — Platform-Wide Execution Components ============
  {
    path: "/api/v1/search",
    method: "GET",
    summary: "Universal search",
    description:
      "Authenticated search across the caller's authorised universe: shipments, quotes, contracts, financing agreements, disputes, contacts (v18 §2.5.4).",
    tags: ["Authenticated", "Search"],
    rateLimit: "50 req/min/IP",
    authRequired: true,
    parameters: [
      { name: "q", in: "query", required: true, schema: { type: "string", minLength: 2, maxLength: 256 } },
      { name: "tenant", in: "query", schema: { type: "string" } },
      { name: "limit", in: "query", schema: { type: "integer", default: 10, maximum: 50 } },
      { name: "types", in: "query", schema: { type: "string" } },
    ],
    responses: {
      "200": { description: "Search results across 6 entity types" },
      "401": { description: "Authentication required" },
      "429": { description: "Rate limit exceeded" },
    },
  },
  {
    path: "/api/v1/employee/switch-context",
    method: "POST",
    summary: "Switch trader-mode context (BUY ↔ SELL)",
    description:
      "Dual trader-mode toggle. Audited action that flips the caller's activeTraderMode JWT claim between BUY and SELL (v18 §2.5.3). Only valid for DUAL-eligible TRD tenants.",
    tags: ["Authenticated", "Employee"],
    rateLimit: "10 req/min/employee",
    authRequired: true,
    requestBody: {
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: { newMode: { type: "string", enum: ["BUY", "SELL"] } },
            required: ["newMode"],
          },
        },
      },
    },
    responses: {
      "200": { description: "Context switched + new JWT" },
      "403": { description: "Tenant not DUAL-eligible" },
      "429": { description: "Rate limit exceeded" },
    },
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
      version: "v18.0",
      description:
        "Sovereign Governed Trade Execution — public verification, health, status, and key-distribution endpoints per v18 §18.26.",
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
    "x-sgtx-version": "v18.0",
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
    Authenticated: "Authenticated endpoints (require Bearer JWT).",
    Search: "Universal search across the caller's authorised universe.",
    Employee: "Employee session and trader-mode management.",
    Blueprint: "Canonical blueprint metadata (Document Control Block).",
    Constitution: "Layer 0 immutable constitutional invariants (Governor Principles, Constitutional Points, AI Authority Ladder).",
    Compliance: "KYB/KYC tier model, sanctions screening, PEP, and registry source classification.",
    KYB: "Know-Your-Business tier requirements per portal and registry source authority.",
    Onboarding: "Tenant onboarding wizard (6 steps) and Trade Readiness Assessment.",
    Wizard: "Onboarding wizard step structure and one-click actions.",
    USTN: "Universal Shipment Tracking Number — canonical trade namespace format and lifecycle.",
    Workflow: "Phase-based trade execution workflows (Buyer, Seller, Financing, Negotiation, Settlement, Post-Trade).",
    Buyer: "Buyer-side trade initiation form (13 sections, 6 core principles, AI-assisted).",
    CFR: "Conditional Financing Reference — two-phase financing model (pre-clearance + formal execution).",
    Financing: "Financing pre-clearance, formal execution, repayment monitoring, and bank-authoritative settlement.",
    Seller: "Seller-side Phase 2 workflow (quote, packing, logistics, EXW lock, multi-shipment).",
    Negotiation: "Phase 3 negotiation, contracting, signing, and lock workflow with USTN generation.",
    Finance: "Phase 4 formal trade finance execution — RFQ, bids, agreements, disbursement, repayment, default.",
    ServiceProvider: "Service Provider Capability Model — 11 capabilities, 5 provider workflows, RFQ→Quote→Selection flow.",
    PhysicalExecution: "Phase 5 physical cargo movement, multiparty tracking, milestone-triggered payments.",
    Settlement: "Phase 6 settlement + payment orchestration with direct bank settlement (ISO 20022).",
    PostTrade: "Phases 7-8 distressed cargo + disputes + reconciliation + USTN closure.",
    Reference: "Consolidated canonical reference for v18 §15-§24 (gates, portals, data model, API index, tx state, trade graph, guarantees, add-ons, network, roadmap).",
    Consolidated: "Cross-section consolidated reference data for auditors and downstream teams.",
    Access: "Identity & access architecture — employees, roles, permissions, data scopes, dual-mode, session, consent, organisation, lifecycle, contacts, trust passport.",
    Trust: "Trust Passport — W3C Verifiable Credential with TRI score, dimensions, verified identifiers, Ed25519 proof, sharing + verification + revocation.",
    Passport: "SGTX Trade Trust Passport™ endpoints (get, share, verify, revoke) per v18 §4.12.4.",
    GTID: "Global Trade Entity ID — generation, resolution, and verification per v18 §4.1.",
  };
  return map[tag] ?? tag;
}

export async function GET() {
  try {
    const spec = buildOpenApiSpec();
    return NextResponse.json(spec, {
      headers: {
        "Cache-Control": "public, max-age=300",
        "X-SGTX-Version": "v18.0",
      },
    });
  } catch (e: any) {
    logger.error("[api/v1/openapi.json] error:", { error: e?.message || String(e) });
    return NextResponse.json({ error: "Failed to generate OpenAPI spec" }, { status: 500 });
  }
}

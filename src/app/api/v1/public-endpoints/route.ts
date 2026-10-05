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
    path: "/api/v1/workflow/service-provider",
    method: "GET",
    description:
      "Returns the canonical Service Provider Capability Model (v18 §11): 11 service capabilities (TRUCKING, FORWARDING, WAREHOUSING, OCEAN_FREIGHT, AIR_FREIGHT, CUSTOMS_BROKERAGE, PHYSICAL_HANDLING, STORAGE, AUDIT_REPRESENTATION, LAB_TESTING, QC_INSPECTION), 9 core principles, 8-step provider onboarding, 5-step RFQ→Quote→Review→Selection flow, 6 eligibility filters, 12 unified quotation common fields, 5 provider-specific workflows (LSP/SHIP/LAB/QC/CBR), and geo-aware service matching.",
    rate_limit: "100 req/min/IP",
    auth_required: false,
    category: "workflow",
    tags: ["Public", "Workflow", "ServiceProvider"],
  },
  {
    path: "/api/sgtx/workflow/service-provider",
    method: "GET",
    description:
      "Internal mirror of /api/v1/workflow/service-provider — exposes the same canonical Service Provider Capability Model for the cockpit admin panel and demo portals.",
    rate_limit: "100 req/min/IP",
    auth_required: false,
    category: "workflow",
    tags: ["Public", "Workflow", "ServiceProvider"],
  },
  {
    path: "/api/v1/workflow/physical-execution",
    method: "GET",
    description:
      "Returns the canonical Phase 5 Physical Execution & Multiparty Tracking workflow (v18 §12): 9 principles (Phase 5 Start Condition, Multi-Dimensional, Multi-Shipment Independence, USTN-Centric, Container Identity, Pallet Identity, Multi-Clock View, Transaction Twin, No Silent Overwrite), 9 workflow steps (Pre-Execution Setup → Container Release & Loading → QC Inspection → Vessel Departure → In-Transit → Arrival → Customs Import → Delivery → Settlement), Container Identity (ISO 6346), Pallet Identity (SSCC GS1-128), 7 multi-clock views, 8 milestone-triggered payment legs, Conditional QC Hold impact, Mobile App (3 types + 3 barcode formats + 5 scan events), and USTN QR Code (7-step scan workflow).",
    rate_limit: "100 req/min/IP",
    auth_required: false,
    category: "workflow",
    tags: ["Public", "Workflow", "PhysicalExecution"],
  },
  {
    path: "/api/sgtx/workflow/physical-execution",
    method: "GET",
    description:
      "Internal mirror of /api/v1/workflow/physical-execution — exposes the same canonical Phase 5 workflow for the cockpit admin panel and demo portals.",
    rate_limit: "100 req/min/IP",
    auth_required: false,
    category: "workflow",
    tags: ["Public", "Workflow", "PhysicalExecution"],
  },
  {
    path: "/api/v1/workflow/settlement",
    method: "GET",
    description:
      "Returns the canonical Phase 6 Settlement + Phases 7-8 Post-Trade workflow (v18 §13 + §14): 7 settlement stages (Instruction Generation → Bank Selection → Buyer Approval → Bank Processing → Deferred Govt Fee → Reconciliation → Monthly Statement), 8 direct bank settlement principles (Non-Custodial Pillar I, USTN Multi-Leg Manifest, ISO 20022 Native, SWIFT gpi UETR, Bank-Authoritative G7, Quotation Transparency, Reconciliation-First, Audit Trail), USTN Multi-Leg Manifest (11 fields + 9-field leg structure), ISO 20022 USTN binding, Reconciliation Engine (≥95% auto / <95% manual), 3 distressed cargo triage paths, 10 dispute categories, 4-step escalation ladder, 4 resolution outcomes, and 7 USTN closure conditions (canClose predicate).",
    rate_limit: "100 req/min/IP",
    auth_required: false,
    category: "workflow",
    tags: ["Public", "Workflow", "Settlement", "PostTrade"],
  },
  {
    path: "/api/sgtx/workflow/settlement",
    method: "GET",
    description:
      "Internal mirror of /api/v1/workflow/settlement — exposes the same canonical Phase 6 + Post-Trade workflow for the cockpit admin panel and demo portals.",
    rate_limit: "100 req/min/IP",
    auth_required: false,
    category: "workflow",
    tags: ["Public", "Workflow", "Settlement", "PostTrade"],
  },
  {
    path: "/api/v1/reference/consolidated",
    method: "GET",
    description:
      "Returns the consolidated canonical reference for v18 §15-§24: 42 Governor gates (G1U1-G1U42) across 7 groups, 10 portals (TRD/LSP/SHIP/LAB/QC/CBR/FIN/GOV/MP/ADM), 4 command center components, Trade Health Score formula (6 components), 24 data model domains (425+ tables), 25 API endpoint categories (400+ endpoints), 5 finality rules (Points 30-34), 6 transport engines, 18 platform guarantees (6 security + 5 availability + 7 privacy), 51 platform add-ons, 4 barcode formats, 7 workflow examples, 15 key terms, 8 roadmap phases (P0-P7), and 4 validation gates (§24.4.11-24.4.13 + §24.7).",
    rate_limit: "100 req/min/IP",
    auth_required: false,
    category: "reference",
    tags: ["Public", "Reference", "Consolidated"],
  },
  {
    path: "/api/sgtx/reference/consolidated",
    method: "GET",
    description:
      "Internal mirror of /api/v1/reference/consolidated — exposes the same consolidated canonical reference for the cockpit admin panel and demo portals.",
    rate_limit: "100 req/min/IP",
    auth_required: false,
    category: "reference",
    tags: ["Public", "Reference", "Consolidated"],
  },
  {
    path: "/api/v1/identity/access",
    method: "GET",
    description:
      "Returns the canonical Identity & Access Architecture for v18 §4.4-§4.12: 14 employee record fields, 41 permissions (Buyer/Seller/LSP/SHIP/LAB/QC/CBR/FIN/GOV/ADM), 7 roles (OWNER/ADMIN/TRADER/COMPLIANCE/FINANCE/OPERATIONS/READONLY), 10 role journey maps, 5 data scopes, dual-mode toggle (BUY/SELL/DUAL), session+device security (4 step-up factors), consent management (6 purposes), internal organisation (business units/departments/cost centres/approval policies), tenant lifecycle (7 states), saved contacts (non-marketplace), and SGTX Trade Trust Passport™ (W3C Verifiable Credential).",
    rate_limit: "100 req/min/IP",
    auth_required: false,
    category: "identity",
    tags: ["Public", "Identity", "Access"],
  },
  {
    path: "/api/sgtx/identity/access",
    method: "GET",
    description:
      "Internal mirror of /api/v1/identity/access — exposes the same canonical Identity & Access Architecture for the cockpit admin panel and demo portals.",
    rate_limit: "100 req/min/IP",
    auth_required: false,
    category: "identity",
    tags: ["Public", "Identity", "Access"],
  },
  {
    path: "/api/v1/trust/passport/{gtid}",
    method: "GET",
    description:
      "Returns the canonical W3C Verifiable Credential for the tenant's Trust Passport (v18 §4.12.4). Auth required — caller must be the passport owner. Returns 404 if no passport exists, 410 if expired/revoked.",
    rate_limit: "100 req/min/IP",
    auth_required: true,
    category: "trust",
    tags: ["Authenticated", "Trust", "Passport"],
  },
  {
    path: "/api/v1/trust/share",
    method: "POST",
    description:
      "Generate a one-time sharing token for the caller's Trust Passport (v18 §4.12.4 Step 2). Body: {shared_with_gtid, dimensions[], expires_in_days}. Returns token + verification URL. Recipient must be a saved contact (non-marketplace rule).",
    rate_limit: "20 req/min/IP",
    auth_required: true,
    category: "trust",
    tags: ["Authenticated", "Trust", "Passport"],
  },
  {
    path: "/api/v1/trust/verify/{token}",
    method: "GET",
    description:
      "Public Trust Passport verification (v18 §4.12.4 Step 3). The token in the URL acts as a capability token — no auth required. Returns the W3C Verifiable Credential with only the consented dimensions. Returns {valid: false, reason: 'revoked'|'expired'|...} for invalid tokens.",
    rate_limit: "100 req/min/IP",
    auth_required: false,
    category: "trust",
    tags: ["Public", "Trust", "Passport"],
  },
  {
    path: "/api/v1/trust/revoke",
    method: "POST",
    description:
      "Revoke a Trust Passport sharing token (v18 §4.12.4 Step 4). Body: {token}. Auth required — caller must be the original sharer. Revocation is immediate; subsequent verify attempts return {valid: false, reason: 'revoked'}.",
    rate_limit: "20 req/min/IP",
    auth_required: true,
    category: "trust",
    tags: ["Authenticated", "Trust", "Passport"],
  },
  {
    path: "/api/v1/identity/gtid/generate",
    method: "POST",
    description:
      "Internal GTID generation endpoint (v18 §4.1.4.3). Only called during onboarding. Body: {country_code, entity_type, legal_name, jurisdiction}. Auth required — ADM/GOV role only. Returns {gtid, sequence, checksum, created_at}. Atomic sequence per (country, entity_type).",
    rate_limit: "10 req/min/caller",
    auth_required: true,
    category: "identity",
    tags: ["Authenticated", "Identity", "GTID"],
  },
  {
    path: "/api/v1/identity/ustn/generate",
    method: "POST",
    description:
      "Internal USTN generation endpoint (v18 §5.1.6). Only called during contract lock. Body: {seller_gtid, buyer_gtid, contract_id, shipment_number}. Auth required — caller must be buyer/seller on the contract or ADM/GOV. Returns v18 format USTN SGTX-{COUNTRY}-{YEAR}-{TRADER}-{SEQ} with atomic sequence per (country, year, traderId) + Loom hash.",
    rate_limit: "5 req/min/caller",
    auth_required: true,
    category: "identity",
    tags: ["Authenticated", "Identity", "USTN"],
  },
  {
    path: "/api/v1/ustn/{ustn}",
    method: "GET",
    description:
      "USTN master object resolution (v18 §5.5.2). Authenticated, role-based filtering. Returns the USTN master object (parties, shipments, timeline, documents, invoices, quotations) filtered by requester permissions. LSP sees only their services; buyer sees commercial terms but not seller costs; financier sees all trade data; gov sees only compliance documents. Rate limit 100 req/min per tenant.",
    rate_limit: "100 req/min/tenant",
    auth_required: true,
    category: "trade",
    tags: ["Authenticated", "Trade", "USTN"],
  },
  {
    path: "/api/v1/verify/ustn",
    method: "GET",
    description:
      "Public USTN verification (v18 §5.2.9). No auth required. Query: ?ustn=SGTX-EG-26-F3A-1&token=... Returns a public verification card with status + parties (masked) + commodity + origin/dest ports. Used by external parties scanning QR codes, customs authorities, banks verifying payment narratives.",
    rate_limit: "60 req/min/IP",
    auth_required: false,
    category: "trade",
    tags: ["Public", "Trade", "USTN", "Verify"],
  },
  {
    path: "/api/v1/signature/qes/request",
    method: "POST",
    description:
      "QES signature request (v18 §3.5.10.3). Initiates a Qualified Electronic Signature flow with the user's preferred TSP. Body: {document_sha256, document_type, ustn, signer_gtid, signer_tsp, callback_url}. Auth required — caller must be the signer. Returns request_id + tsp_request_url + expires_at + status=PENDING.",
    rate_limit: "20 req/min/signer",
    auth_required: true,
    category: "signature",
    tags: ["Authenticated", "Signature", "QES"],
  },
  {
    path: "/api/v1/governor/decision",
    method: "POST",
    description:
      "Governor decision endpoint (v18 §3.5.2). The canonical way for any client to request a Governor decision on a proposed action. Evaluates against OPA Rego policies + WasmEdge constitutional modules + AI Decision Merger. Returns verdict ALLOW | DENY | CONDITIONAL with policy_id + conditions + loom_hash. Rate limit 30 req/min per caller.",
    rate_limit: "30 req/min/caller",
    auth_required: true,
    category: "governance",
    tags: ["Authenticated", "Governance", "Governor"],
  },
  {
    path: "/api/v1/quote/submit",
    method: "POST",
    description:
      "Quote submission (v18 §5.8.2). Body: {ustn, quote_number, service_provider_gtid, line_items[], total_usd, currency, validity_days, sla, eta, conditions[]}. Auth required — caller must be the service_provider_gtid. Returns quote_id + status=SUBMITTED.",
    rate_limit: "20 req/min/caller",
    auth_required: true,
    category: "trade",
    tags: ["Authenticated", "Trade", "Quote"],
  },
  {
    path: "/api/v1/contract/sign",
    method: "POST",
    description:
      "Contract signing (v18 §5.8.2 + §9.17). Body: {ustn, contract_id, signer_gtid, signer_role (BUYER|SELLER), signature (base64 QES), qes_request_id}. Auth required — caller must be the signer + a party to the trade. Governor gate G1U23. Returns contract_hash_sha256 + signed_at.",
    rate_limit: "5 req/min/caller",
    auth_required: true,
    category: "trade",
    tags: ["Authenticated", "Trade", "Contract"],
  },
  {
    path: "/api/v1/shipment/milestone",
    method: "POST",
    description:
      "Milestone confirmation (v18 §5.8.2 + §12.2). Body: {ustn, milestone (1 of 16 lifecycle statuses), confirmer_gtid, confirmation_method (barcode|voice|manual|api|auto_consensus), container_no, pallet_sscc, notes}. Auth required — caller must be the confirmer. Governor gate G1U37. Updates trade.status to the milestone.",
    rate_limit: "30 req/min/caller",
    auth_required: true,
    category: "trade",
    tags: ["Authenticated", "Trade", "Shipment", "Milestone"],
  },
  {
    path: "/api/v1/documents/upload",
    method: "POST",
    description:
      "Document upload (v18 §5.8.2). Body: {ustn, document_type (1 of 16), title, file_base64, file_sha256 (optional, computed if missing), uploader_gtid}. Auth required — caller must be a party to the trade (buyer or seller). Returns document_id + file_sha256 + file_size_bytes + status=UPLOADED.",
    rate_limit: "20 req/min/caller",
    auth_required: true,
    category: "trade",
    tags: ["Authenticated", "Trade", "Documents"],
  },
  {
    path: "/api/v1/settlement/approve",
    method: "POST",
    description:
      "Settlement approval (v18 §5.8.2 + §13.1.1 Stage 3). Body: {ustn, manifest_id, approver_gtid, total_amount_usd, currency, approval_method (one_click|voice|auto), voice_transcript (if voice)}. Auth required — caller must be the buyer on the trade. Governor gate G1U38. Returns settlement_hash_sha256 + next_stage=Stage 4 (Bank Processing).",
    rate_limit: "5 req/min/caller",
    auth_required: true,
    category: "trade",
    tags: ["Authenticated", "Trade", "Settlement"],
  },
  {
    path: "/api/v1/customs/declaration",
    method: "POST",
    description:
      "Customs declaration (v18 §5.8.2). Body: {ustn, declaration_type (EXPORT|IMPORT|TRANSIT), broker_gtid, hs_code, commodity_description, origin_country, dest_country, declared_value_usd, currency, customs_authority}. Auth required — caller must be a CBR (Customs Broker). Persists to customs_declarations + activity log.",
    rate_limit: "10 req/min/caller",
    auth_required: true,
    category: "trade",
    tags: ["Authenticated", "Trade", "Customs"],
  },
  {
    path: "/api/v1/financing/request",
    method: "POST",
    description:
      "Financing request (v18 §5.8.2 + §10.5). Body: {ustn, borrower_gtid, financing_type (1 of 8: WORKING_CAPITAL, LETTER_OF_CREDIT, FACTORING, FORFAITING, SUPPLY_CHAIN_FINANCE, EXPORT_CREDIT, BRIDGE_LOAN, INVENTORY_FINANCE), principal_usd, currency, tenor_days, cfr_id (optional), collateral_offered[]}. Auth required — caller must be the borrower. Governor gate G1U28 (amount validated against ERR envelope).",
    rate_limit: "5 req/min/caller",
    auth_required: true,
    category: "trade",
    tags: ["Authenticated", "Trade", "Financing"],
  },
  {
    path: "/api/v1/dispute/file",
    method: "POST",
    description:
      "Dispute filing (v18 §5.8.2 + §14.3). Body: {ustn, filer_gtid, category (1 of 10: QUALITY, QUANTITY, TIMING, PAYMENT, DOCUMENTATION, CUSTOMS, LOGISTICS, INSURANCE, FINANCING, REGULATORY), severity (LOW|MEDIUM|HIGH|CRITICAL), description, remedy_sought, evidence_refs[]}. Auth required — caller must be a party to the trade. Governor gate G1U41. FeeLock freezes on filing.",
    rate_limit: "5 req/min/caller",
    auth_required: true,
    category: "trade",
    tags: ["Authenticated", "Trade", "Dispute"],
  },
  {
    path: "/api/v1/compliance/screen",
    method: "POST",
    description:
      "Unified Screening Gateway (v18 §3.5.13). Body: {gtid, hs_code, jurisdiction, screening_types[]}. Runs sanctions (OFAC/EU/UK/UN), PEP, KYB, jurisdiction risk (RIA), and HS code dual-use checks. Returns verdict CLEAR|CONDITIONAL|BLOCKED with conditions[]. Governor-logged.",
    rate_limit: "30 req/min/caller",
    auth_required: true,
    category: "compliance",
    tags: ["Authenticated", "Compliance", "Screening"],
  },
  {
    path: "/api/v1/distressed/declare",
    method: "POST",
    description:
      "Distressed cargo declaration (v18 §5.8.2 + §14.2 Phase 7). Body: {ustn, declarer_gtid, reason, condition_assessment, ai_price_usd, triage_path (SELL_QUICKLY|COMPLY_LOCAL_LAW|FILE_INSURANCE), partial_distress, distress_percentage}. Auth required — caller must be the seller. Governor gate G1U40. Updates trade status to DISTRESSED.",
    rate_limit: "3 req/min/caller",
    auth_required: true,
    category: "trade",
    tags: ["Authenticated", "Trade", "Distressed"],
  },
  {
    path: "/api/v1/financing/pre-clearance",
    method: "POST",
    description:
      "CFR creation (v18 §7.3 Phase A Steps A2-A3). Body: {borrower_gtid, financier_gtid, trade_request_uuid, max_amount_usd, currency, borrower_role (BUYER|SELLER)}. Auth required — caller must be the borrower. Verifies financier is a saved contact (non-marketplace). Compiles privacy-preserving trade digest (masked parties). Governor gate G1U9.",
    rate_limit: "10 req/min/caller",
    auth_required: true,
    category: "trade",
    tags: ["Authenticated", "Trade", "CFR", "Financing"],
  },
  {
    path: "/api/v1/financing/pre-clearance",
    method: "GET",
    description:
      "List CFRs (v18 §7.6 — data-sovereign, role-filtered). Borrower sees only their own CFRs; financier sees only CFRs issued to them. Query: status, role. Auth required.",
    rate_limit: "10 req/min/caller",
    auth_required: true,
    category: "trade",
    tags: ["Authenticated", "Trade", "CFR", "Financing"],
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
  // ============ v18 §6.16 + §8.13 — Trade Drafts + Packing Lock ============
  {
    path: "/api/v1/trade/draft",
    method: "POST",
    description:
      "Draft auto-save (v18 §6.16 + §6.2.15 Step 12). Body: {draft_id (optional — update existing), draft_data (JSON blob), step (1-13), trader_mode}. Auth required. 60 req/min per caller (auto-save every 30s). Returns draft_id + saved_at + ttl_hours=168.",
    rate_limit: "60 req/min/caller",
    auth_required: true,
    category: "trade",
    tags: ["Authenticated", "Trade", "Draft"],
  },
  {
    path: "/api/v1/trade/drafts",
    method: "GET",
    description:
      "List drafts (v18 §6.16.9.1). Auth required — drafts scoped to caller's GTID + active trader mode. No cross-tenant draft access.",
    rate_limit: "60 req/min/caller",
    auth_required: true,
    category: "trade",
    tags: ["Authenticated", "Trade", "Draft"],
  },
  {
    path: "/api/v1/trade/draft/{id}",
    method: "GET",
    description:
      "Load draft (v18 §6.16.9.1). Auth required — draft scoped to caller's GTID (no cross-tenant access). Returns draft_data + step + trader_mode.",
    rate_limit: "60 req/min/caller",
    auth_required: true,
    category: "trade",
    tags: ["Authenticated", "Trade", "Draft"],
  },
  {
    path: "/api/v1/trade/draft/{id}",
    method: "DELETE",
    description:
      "Delete draft (v18 §6.16.9.1). Auth required — caller must own the draft.",
    rate_limit: "60 req/min/caller",
    auth_required: true,
    category: "trade",
    tags: ["Authenticated", "Trade", "Draft"],
  },
  {
    path: "/api/v1/packing/{id}/lock",
    method: "POST",
    description:
      "Packing plan lock (v18 §8.2.8 Step 8 + §8.13.9). Body: {locker_gtid, pallet_details[]}. Auth required — caller must be the seller. Governor gate G1U15. Hashes pallet_details (SHA256) at lock time per §8.13.4. Returns lock_id + pallet_hash_sha256 + reprint_policy (Governor-Enforced per §8.13.6).",
    rate_limit: "5 req/min/caller",
    auth_required: true,
    category: "trade",
    tags: ["Authenticated", "Trade", "Packing"],
  },
  {
    path: "/api/v1/packing/{id}/unlock",
    method: "POST",
    description:
      "Packing plan unlock (v18 §8.13.9). Body: {unlocker_gtid, reason}. Auth required — caller must be the original locker or ADM/GOV.",
    rate_limit: "5 req/min/caller",
    auth_required: true,
    category: "trade",
    tags: ["Authenticated", "Trade", "Packing"],
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

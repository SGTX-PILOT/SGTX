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

  // ===== Phase 5 — Transport & Logistics Orchestration Fabric (Task 5-api) =====
  // Public so the demo portal + admin shells can call without a session cookie.
  // Tenant scoping is via body / query params (ustn, graphId, legId, providerGtid,
  // traderGtid). Rate-limited by the anonymous API bucket (50 req/min).
  //
  // §1 Transport Graphs
  "/api/sgtx/transport/graphs",
  "/api/sgtx/transport/graphs/[id]",
  "/api/sgtx/transport/graphs/[id]/legs",
  "/api/sgtx/transport/graphs/[id]/progress",
  "/api/sgtx/transport/graphs/[id]/continuity",
  "/api/sgtx/transport/graphs/[id]/totals",
  "/api/sgtx/transport/graphs/[id]/status",
  "/api/sgtx/transport/graphs/by-ustn/[ustn]",
  "/api/sgtx/transport/legs/[legId]/status",
  "/api/sgtx/transport/legs/[legId]/assign-provider",
  "/api/sgtx/transport/legs/[legId]/link-mode-engine",
  // §2 Provider Relationships (non-marketplace)
  "/api/sgtx/transport/providers/visible",
  "/api/sgtx/transport/providers/can-see",
  "/api/sgtx/transport/providers/relationships",
  "/api/sgtx/transport/providers/relationships/[id]",
  "/api/sgtx/transport/providers/relationships/[id]/status",
  "/api/sgtx/transport/providers/approve",
  "/api/sgtx/transport/providers/authorized-route",
  "/api/sgtx/transport/providers/authorized-commodity",
  "/api/sgtx/transport/providers/trust-score",
  // §3 Logistics Quotes V2 (non-marketplace explicit selection)
  "/api/sgtx/transport/quotes",
  "/api/sgtx/transport/quotes/[id]",
  "/api/sgtx/transport/quotes/by-quote-id/[quoteId]",
  "/api/sgtx/transport/quotes/request",
  "/api/sgtx/transport/quotes/[id]/submit",
  "/api/sgtx/transport/quotes/[id]/select",
  "/api/sgtx/transport/quotes/[id]/expire",
  "/api/sgtx/transport/quotes/[id]/cancel",
  "/api/sgtx/transport/quotes/[id]/link-validation",
  "/api/sgtx/transport/quotes/graph/[graphId]",
  "/api/sgtx/transport/quotes/leg/[legId]",
  // §4 Landed Cost Engine (20-component breakdown + SGTX fee)
  "/api/sgtx/transport/landed-cost/compute",
  "/api/sgtx/transport/landed-cost/[id]",
  "/api/sgtx/transport/landed-cost/[id]/component",
  "/api/sgtx/transport/landed-cost/graph/[graphId]",
  "/api/sgtx/transport/landed-cost/leg/[legId]",
  "/api/sgtx/transport/landed-cost/sgtx-fee",
  // §5 Transport Documents (DRAFT→ISSUED→SURRENDERED→RELEASED / AMENDED / CANCELLED)
  "/api/sgtx/transport/documents",
  "/api/sgtx/transport/documents/[id]",
  "/api/sgtx/transport/documents/by-number/[documentNumber]",
  "/api/sgtx/transport/documents/[id]/issue",
  "/api/sgtx/transport/documents/[id]/surrender",
  "/api/sgtx/transport/documents/[id]/release",
  "/api/sgtx/transport/documents/[id]/amend",
  "/api/sgtx/transport/documents/[id]/cancel",
  "/api/sgtx/transport/documents/[id]/verify",
  "/api/sgtx/transport/documents/graph/[graphId]",
  "/api/sgtx/transport/documents/leg/[legId]",
  "/api/sgtx/transport/documents/types-for-mode",
  // §6 Provider Validation (12-check battery + context-aware screening)
  "/api/sgtx/transport/provider-validation",
  "/api/sgtx/transport/provider-validation/validate",
  "/api/sgtx/transport/provider-validation/list",
  "/api/sgtx/transport/provider-validation/expired",
  "/api/sgtx/transport/provider-validation/fully-validated",
  "/api/sgtx/transport/provider-validation/route-auth",
  "/api/sgtx/transport/provider-validation/commodity-auth",

  // ===== Phase 6 — Financial & Commercial Execution Fabric (Task 6-api) =====
  // Public so the financier portals (BANK / PFI), trader portals, and admin
  // shells can call without a session cookie. Tenant scoping is via body /
  // query params (ustn, paymentId, caseId, traderGtid, financierGtid, lcNumber,
  // guaranteeId, etc.). Rate-limited by the anonymous API bucket (50 req/min).
  //
  // §1 Payments (PENDING → SUBMITTED → PROCESSING → SETTLED / FAILED / CANCELLED / REVERSED)
  "/api/sgtx/finance/payments",
  "/api/sgtx/finance/payments/[id]",
  "/api/sgtx/finance/payments/by-payment-id/[paymentId]",
  "/api/sgtx/finance/payments/by-ustn/[ustn]",
  "/api/sgtx/finance/payments/[id]/submit",
  "/api/sgtx/finance/payments/[id]/process",
  "/api/sgtx/finance/payments/[id]/settle",
  "/api/sgtx/finance/payments/[id]/fail",
  "/api/sgtx/finance/payments/[id]/cancel",
  "/api/sgtx/finance/payments/[id]/reverse",
  "/api/sgtx/finance/payments/split",
  "/api/sgtx/finance/payments/duplicate-check",
  // §2 Trade Finance (non-marketplace explicit financier selection)
  "/api/sgtx/finance/cases",
  "/api/sgtx/finance/cases/[id]",
  "/api/sgtx/finance/cases/[id]/accept",
  "/api/sgtx/finance/cases/[id]/disburse",
  "/api/sgtx/finance/cases/[id]/repay",
  "/api/sgtx/finance/cases/[id]/margin-call",
  "/api/sgtx/finance/cases/[id]/settle",
  "/api/sgtx/finance/cases/trader/[traderGtid]",
  "/api/sgtx/finance/cases/financier/[financierGtid]",
  // §2b Financier Relationships (non-marketplace — FLAT list, internal trust score)
  "/api/sgtx/finance/financiers",
  "/api/sgtx/finance/financiers/connected",
  "/api/sgtx/finance/financiers/can-use",
  "/api/sgtx/finance/financiers/[id]",
  "/api/sgtx/finance/financiers/[id]/status",
  "/api/sgtx/finance/financiers/by-gtids",
  "/api/sgtx/finance/financiers/credit-limit",
  "/api/sgtx/finance/financiers/approve",
  "/api/sgtx/finance/financiers/trust-score",
  // §3 LC Lifecycle (ISSUE → ADVISE → AMEND → PRESENTATION → DISCREPANCY → ACCEPTANCE → PAID → REIMBURSED)
  "/api/sgtx/finance/lc-lifecycles",
  "/api/sgtx/finance/lc-lifecycles/[id]",
  "/api/sgtx/finance/lc-lifecycles/by-lc-number/[lcNumber]",
  "/api/sgtx/finance/lc-lifecycles/[id]/advance",
  "/api/sgtx/finance/lc-lifecycles/[id]/discrepancies",
  "/api/sgtx/finance/lc-lifecycles/[id]/waive-discrepancy",
  "/api/sgtx/finance/lc-lifecycles/[id]/accept",
  "/api/sgtx/finance/lc-lifecycles/[id]/pay",
  "/api/sgtx/finance/lc-lifecycles/[id]/reimburse",
  "/api/sgtx/finance/lc-lifecycles/[id]/progress",
  // §4 Documentary Matching (field-level comparison + presentation readiness)
  "/api/sgtx/finance/documentary-match",
  "/api/sgtx/finance/documentary-match/run",
  "/api/sgtx/finance/documentary-match/[id]",
  "/api/sgtx/finance/documentary-match/by-ustn/[ustn]",
  "/api/sgtx/finance/documentary-match/[id]/review",
  "/api/sgtx/finance/documentary-match/[id]/waive-discrepancy",
  "/api/sgtx/finance/documentary-match/[id]/ready",
  // §5 Guarantees (DRAFT → ISSUED → ACTIVE → CALLED → RELEASED / CANCELLED / EXPIRED)
  "/api/sgtx/finance/guarantees",
  "/api/sgtx/finance/guarantees/[id]",
  "/api/sgtx/finance/guarantees/[id]/issue",
  "/api/sgtx/finance/guarantees/[id]/activate",
  "/api/sgtx/finance/guarantees/[id]/call",
  "/api/sgtx/finance/guarantees/[id]/release",
  "/api/sgtx/finance/guarantees/[id]/cancel",
  // §6 Insurance Lifecycle (QUOTE → BIND → CERTIFICATE → ... → INCIDENT → CLAIM → SETTLE → CLOSE)
  "/api/sgtx/finance/insurance",
  "/api/sgtx/finance/insurance/[id]",
  "/api/sgtx/finance/insurance/[id]/advance",
  "/api/sgtx/finance/insurance/[id]/bind",
  "/api/sgtx/finance/insurance/[id]/certificate",
  "/api/sgtx/finance/insurance/[id]/incident",
  "/api/sgtx/finance/insurance/[id]/claim",
  "/api/sgtx/finance/insurance/[id]/survey",
  "/api/sgtx/finance/insurance/[id]/settle",
  "/api/sgtx/finance/insurance/[id]/close",
  "/api/sgtx/finance/insurance/[id]/progress",
  // §7 Accounting (DRAFT → POSTED → REVERSED + Trial Balance + P&L)
  "/api/sgtx/finance/accounting/entries",
  "/api/sgtx/finance/accounting/entries/[id]",
  "/api/sgtx/finance/accounting/entries/[id]/post",
  "/api/sgtx/finance/accounting/entries/[id]/reverse",
  "/api/sgtx/finance/accounting/trial-balance",
  "/api/sgtx/finance/accounting/pnl",
  // §8 ERP Adapters (NOT_CONFIGURED → CONNECTED + sync to/from + test + health + delete)
  "/api/sgtx/finance/erp-adapters",
  "/api/sgtx/finance/erp-adapters/[id]",
  "/api/sgtx/finance/erp-adapters/[id]/connect",
  "/api/sgtx/finance/erp-adapters/[id]/sync-to",
  "/api/sgtx/finance/erp-adapters/[id]/sync-from",
  "/api/sgtx/finance/erp-adapters/[id]/test",
  "/api/sgtx/finance/erp-adapters/[id]/health",
  // §9 Reconciliation (PAYMENT × ACCOUNTING × BANK-STATEMENT, with manual match + resolve)
  "/api/sgtx/finance/reconciliation",
  "/api/sgtx/finance/reconciliation/run",
  "/api/sgtx/finance/reconciliation/[id]",
  "/api/sgtx/finance/reconciliation/[id]/match",
  "/api/sgtx/finance/reconciliation/[id]/resolve",
  "/api/sgtx/finance/reconciliation/summary",
  "/api/sgtx/finance/reconciliation/unreconciled-payments",

  // ===== Phase 7 — Post-Trade Completion Fabric (§1–§6) =====
  // §1 Delivery Acceptance — 8 endpoints (list + create + get-by-id +
  // accept/reject/partial-accept/evidence + by-ustn).
  "/api/sgtx/completion/deliveries",
  "/api/sgtx/completion/deliveries/[id]",
  "/api/sgtx/completion/deliveries/[id]/accept",
  "/api/sgtx/completion/deliveries/[id]/reject",
  "/api/sgtx/completion/deliveries/[id]/partial-accept",
  "/api/sgtx/completion/deliveries/[id]/evidence",
  "/api/sgtx/completion/deliveries/by-ustn/[ustn]",
  // §2 Claims — 13 endpoints (list + create + get-by-id + by-claim-id +
  // review/accept/reject/resolve/escalate/withdraw/close/evidence + by-ustn).
  "/api/sgtx/completion/claims",
  "/api/sgtx/completion/claims/[id]",
  "/api/sgtx/completion/claims/by-claim-id/[claimId]",
  "/api/sgtx/completion/claims/[id]/review",
  "/api/sgtx/completion/claims/[id]/accept",
  "/api/sgtx/completion/claims/[id]/reject",
  "/api/sgtx/completion/claims/[id]/resolve",
  "/api/sgtx/completion/claims/[id]/escalate",
  "/api/sgtx/completion/claims/[id]/withdraw",
  "/api/sgtx/completion/claims/[id]/close",
  "/api/sgtx/completion/claims/[id]/evidence",
  "/api/sgtx/completion/claims/by-ustn/[ustn]",
  // §3 Returns — 11 endpoints (list + create + get-by-id + by-return-id +
  // ship/receive/process/complete/cancel + parent + parent-child-map).
  "/api/sgtx/completion/returns",
  "/api/sgtx/completion/returns/[id]",
  "/api/sgtx/completion/returns/by-return-id/[returnId]",
  "/api/sgtx/completion/returns/[id]/ship",
  "/api/sgtx/completion/returns/[id]/receive",
  "/api/sgtx/completion/returns/[id]/process",
  "/api/sgtx/completion/returns/[id]/complete",
  "/api/sgtx/completion/returns/[id]/cancel",
  "/api/sgtx/completion/returns/parent/[parentUstn]",
  "/api/sgtx/completion/returns/parent-child-map/[parentUstn]",
  // §4 Post-Clearance — 10 endpoints (list + create + get-by-id +
  // review/approve/reject/complete/mark-paid/appeal + by-ustn).
  "/api/sgtx/completion/post-clearance",
  "/api/sgtx/completion/post-clearance/[id]",
  "/api/sgtx/completion/post-clearance/[id]/review",
  "/api/sgtx/completion/post-clearance/[id]/approve",
  "/api/sgtx/completion/post-clearance/[id]/reject",
  "/api/sgtx/completion/post-clearance/[id]/complete",
  "/api/sgtx/completion/post-clearance/[id]/mark-paid",
  "/api/sgtx/completion/post-clearance/[id]/appeal",
  "/api/sgtx/completion/post-clearance/by-ustn/[ustn]",
  // §5 Evidence Packages — 12 endpoints (list + create + get-by-id +
  // by-package-id + by-ustn + compile/seal/amend/archive +
  // completeness + section + verify).
  "/api/sgtx/completion/evidence-packages",
  "/api/sgtx/completion/evidence-packages/[id]",
  "/api/sgtx/completion/evidence-packages/by-package-id/[packageId]",
  "/api/sgtx/completion/evidence-packages/by-ustn/[ustn]",
  "/api/sgtx/completion/evidence-packages/[id]/compile",
  "/api/sgtx/completion/evidence-packages/[id]/seal",
  "/api/sgtx/completion/evidence-packages/[id]/amend",
  "/api/sgtx/completion/evidence-packages/[id]/archive",
  "/api/sgtx/completion/evidence-packages/[id]/completeness",
  "/api/sgtx/completion/evidence-packages/[id]/section",
  "/api/sgtx/completion/evidence-packages/[id]/verify",
  // §6 Trade Closure — 7 endpoints (get-or-create + evaluate + close +
  // reopen + checklist + is-closed + link-evidence).
  "/api/sgtx/completion/closure",
  "/api/sgtx/completion/closure/evaluate",
  "/api/sgtx/completion/closure/close",
  "/api/sgtx/completion/closure/reopen",
  "/api/sgtx/completion/closure/checklist",
  "/api/sgtx/completion/closure/is-closed",
  "/api/sgtx/completion/closure/link-evidence",

  // ===== Phase 8 — Worldwide Integration Catalog + Gap Control Center (§1–§11) =====
  // §1-3 Catalog — 8 endpoints (list + upsert + by-id + by-connector-id +
  // by-jurisdiction + connected-count + status + delete).
  "/api/sgtx/integrations/catalog",
  "/api/sgtx/integrations/catalog/[id]",
  "/api/sgtx/integrations/catalog/[id]/status",
  "/api/sgtx/integrations/catalog/by-connector-id/[connectorId]",
  "/api/sgtx/integrations/catalog/by-jurisdiction/[jurisdictionCode]",
  "/api/sgtx/integrations/catalog/connected-count",
  // §4 Gap Analysis — 10 endpoints (list + create + by-id + by-gap-id +
  // missing + summary + status + priority + assign + resolve).
  "/api/sgtx/integrations/gaps",
  "/api/sgtx/integrations/gaps/[id]",
  "/api/sgtx/integrations/gaps/[id]/status",
  "/api/sgtx/integrations/gaps/[id]/priority",
  "/api/sgtx/integrations/gaps/[id]/assign",
  "/api/sgtx/integrations/gaps/[id]/resolve",
  "/api/sgtx/integrations/gaps/by-gap-id/[gapId]",
  "/api/sgtx/integrations/gaps/missing",
  "/api/sgtx/integrations/gaps/summary",
  // §5 Discovery — 4 endpoints (discover + report + transit-countries + integration-families).
  "/api/sgtx/integrations/discover",
  "/api/sgtx/integrations/discover/report",
  "/api/sgtx/integrations/discover/transit-countries",
  "/api/sgtx/integrations/discover/integration-families",
  // §8 Country Readiness — 6 endpoints (get + summary + all + dimension + list + assess).
  "/api/sgtx/integrations/country-readiness",
  "/api/sgtx/integrations/country-readiness/assess",
  "/api/sgtx/integrations/country-readiness/summary",
  "/api/sgtx/integrations/country-readiness/all",
  "/api/sgtx/integrations/country-readiness/dimension",
  "/api/sgtx/integrations/country-readiness/list",
  // §9 Trade Lane Readiness — 6 endpoints (list + by-id + by-lane-id + non-ready + blockers + assess).
  "/api/sgtx/integrations/trade-lanes",
  "/api/sgtx/integrations/trade-lanes/assess",
  "/api/sgtx/integrations/trade-lanes/[id]",
  "/api/sgtx/integrations/trade-lanes/[id]/blockers",
  "/api/sgtx/integrations/trade-lanes/by-lane-id/[laneId]",
  "/api/sgtx/integrations/trade-lanes/non-ready",
  // §10 Alerts — 11 endpoints (list + create + by-id + by-alert-id + open +
  // critical + summary + acknowledge + resolve + dismiss + scan + expiring-certificates).
  "/api/sgtx/integrations/alerts",
  "/api/sgtx/integrations/alerts/[id]",
  "/api/sgtx/integrations/alerts/[id]/acknowledge",
  "/api/sgtx/integrations/alerts/[id]/resolve",
  "/api/sgtx/integrations/alerts/[id]/dismiss",
  "/api/sgtx/integrations/alerts/by-alert-id/[alertId]",
  "/api/sgtx/integrations/alerts/open",
  "/api/sgtx/integrations/alerts/critical",
  "/api/sgtx/integrations/alerts/summary",
  "/api/sgtx/integrations/alerts/scan",
  "/api/sgtx/integrations/alerts/expiring-certificates",

  // ===== Phase 9 — Worldwide Country Activation + Regulatory Change Management =====
  // §1 Country Activation (10 endpoints — list + create + by-id + by-country +
  // complete-step + suspend + resume + cancel + progress + checklist + activated-countries).
  "/api/sgtx/regulatory/activation",
  "/api/sgtx/regulatory/activation/[id]",
  "/api/sgtx/regulatory/activation/by-country/[countryCode]",
  "/api/sgtx/regulatory/activation/[id]/complete-step",
  "/api/sgtx/regulatory/activation/[id]/suspend",
  "/api/sgtx/regulatory/activation/[id]/resume",
  "/api/sgtx/regulatory/activation/[id]/cancel",
  "/api/sgtx/regulatory/activation/[id]/progress",
  "/api/sgtx/regulatory/activation/[id]/checklist",
  "/api/sgtx/regulatory/activation/activated-countries",
  // §2 Regulatory Changes (9 endpoints — list + detect + by-id + by-change-id +
  // verify + assign-governor + assign-multisig + pending + deployed).
  "/api/sgtx/regulatory/changes",
  "/api/sgtx/regulatory/changes/[id]",
  "/api/sgtx/regulatory/changes/by-change-id/[changeId]",
  "/api/sgtx/regulatory/changes/[id]/verify",
  "/api/sgtx/regulatory/changes/[id]/assign-governor",
  "/api/sgtx/regulatory/changes/[id]/assign-multisig",
  "/api/sgtx/regulatory/changes/pending",
  "/api/sgtx/regulatory/changes/deployed",
  // §3 Impact Engine (3 endpoints — assess + simulate + get stored).
  "/api/sgtx/regulatory/impact/[changeId]",
  "/api/sgtx/regulatory/impact/[changeId]/assess",
  "/api/sgtx/regulatory/impact/[changeId]/simulate",
  // §4 Change Approval Pipeline (8 endpoints — advance + reject + rollback +
  // status + steps + can-advance + awaiting-approval + awaiting-deployment).
  "/api/sgtx/regulatory/pipeline/[changeId]/advance",
  "/api/sgtx/regulatory/pipeline/[changeId]/reject",
  "/api/sgtx/regulatory/pipeline/[changeId]/rollback",
  "/api/sgtx/regulatory/pipeline/[changeId]/status",
  "/api/sgtx/regulatory/pipeline/[changeId]/steps",
  "/api/sgtx/regulatory/pipeline/[changeId]/can-advance",
  "/api/sgtx/regulatory/pipeline/awaiting-approval",
  "/api/sgtx/regulatory/pipeline/awaiting-deployment",
  // §5 Snapshot Versions (8 endpoints — list + create + by-id + active +
  // for-trade + activate + archive + lock-trade). §5 critical: locked trades
  // retain their original snapshot; future trades use the new ACTIVE version.
  "/api/sgtx/regulatory/snapshots",
  "/api/sgtx/regulatory/snapshots/[id]",
  "/api/sgtx/regulatory/snapshots/active",
  "/api/sgtx/regulatory/snapshots/for-trade",
  "/api/sgtx/regulatory/snapshots/[id]/activate",
  "/api/sgtx/regulatory/snapshots/[id]/archive",
  "/api/sgtx/regulatory/snapshots/lock-trade",

  // ===== Phase 10 — Production Readiness Center (FINAL INTEGRATION PHASE) =====
  // §1 E2E Trade Graph Validation (4 endpoints — validate + list + by-id + by-ustn).
  // §2-§10 individual verification endpoints (each POST runs the corresponding
  // verification function from src/lib/sgtx/production-readiness/index.ts).
  // §11-§12 Production Readiness Report (3 endpoints — generate + list + by-id + latest).
  // §13 Final USTN Closure Test (1 endpoint — POST).
  // §14 Run All Tests (1 endpoint — POST sweep that runs every verification).
  "/api/sgtx/readiness/e2e/validate",
  "/api/sgtx/readiness/e2e",
  "/api/sgtx/readiness/e2e/[id]",
  "/api/sgtx/readiness/e2e/by-ustn/[ustn]",
  "/api/sgtx/readiness/multimodal-tests",
  "/api/sgtx/readiness/country-tests",
  "/api/sgtx/readiness/government-connectivity",
  "/api/sgtx/readiness/financial-reconciliation",
  "/api/sgtx/readiness/data-reconciliation",
  "/api/sgtx/readiness/gap-center",
  "/api/sgtx/readiness/security-audit",
  "/api/sgtx/readiness/governor-coverage",
  "/api/sgtx/readiness/loom-traceability",
  "/api/sgtx/readiness/report",
  "/api/sgtx/readiness/report/latest",
  "/api/sgtx/readiness/report/[id]",
  "/api/sgtx/readiness/ustn-closure-test",
  "/api/sgtx/readiness/run-all-tests",

  // ===== Constitutional Amendment Engines (Task amendment-gates-api) =====
  // Public so the demo portal + Government Portal admin shell can call
  // without a session cookie. Tenant scoping is via body / query params
  // (ustn, eventId, exceptionId, legId, instructionId, obligationId,
  // gatewayId, packetId, entryId, ustn). Rate-limited by the anonymous
  // API bucket (50 req/min). All 34 routes are also covered by the
  // catch-all in isPublicPattern() — these explicit entries are the
  // belt-and-braces (template form).
  //
  // §6-8 State Vector (3 routes)
  "/api/sgtx/constitutional/state-vector",
  "/api/sgtx/constitutional/state-vector/update",
  // §12-18 Event Spine (5 routes)
  "/api/sgtx/constitutional/events",
  "/api/sgtx/constitutional/events/[id]",
  "/api/sgtx/constitutional/events/verify-chain",
  "/api/sgtx/constitutional/events/replay",
  // §37-49 Settlement Orchestration (5 routes)
  "/api/sgtx/constitutional/settlement/instruction",
  "/api/sgtx/constitutional/settlement/submit/[instructionId]",
  "/api/sgtx/constitutional/settlement/legs",
  "/api/sgtx/constitutional/settlement/legs/[legId]/state",
  "/api/sgtx/constitutional/settlement/status",
  // §68-73 Exception Engine (4 routes)
  "/api/sgtx/constitutional/exceptions",
  "/api/sgtx/constitutional/exceptions/[id]/evaluate",
  "/api/sgtx/constitutional/exceptions/causal-impact",
  // §89 Transaction Twin (3 routes)
  "/api/sgtx/constitutional/twin",
  "/api/sgtx/constitutional/twin/update",
  // §91 Recovery Vault (3 routes)
  "/api/sgtx/constitutional/recovery-vault",
  "/api/sgtx/constitutional/recovery-vault/[id]",
  // §57 External Identifiers (3 routes)
  "/api/sgtx/constitutional/identifiers",
  "/api/sgtx/constitutional/identifiers/link",
  // §63-65 Financial Exposure (3 routes)
  "/api/sgtx/constitutional/exposure",
  "/api/sgtx/constitutional/exposure/update",
  "/api/sgtx/constitutional/exposure/reopen",
  // §66-68 Obligation Graph (4 routes)
  "/api/sgtx/constitutional/obligations",
  "/api/sgtx/constitutional/obligations/[id]/dependency",
  "/api/sgtx/constitutional/obligations/graph",
  // §90 Dispute Packet (2 routes)
  "/api/sgtx/constitutional/dispute-packets",
  "/api/sgtx/constitutional/dispute-packets/assemble",
  // §37 Bank Settlement Gateway (3 routes)
  "/api/sgtx/constitutional/bank-gateway",
  "/api/sgtx/constitutional/bank-gateway/[id]/process",
  // §11 Closure Policy (5 routes)
  "/api/sgtx/constitutional/closure-policy",
  "/api/sgtx/constitutional/closure/evaluate",
  "/api/sgtx/constitutional/closure/can-close",
  "/api/sgtx/constitutional/closure/blockers",
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
  // Phase 5 — Transport & Logistics Orchestration Fabric (Task 5-api).
  // All transport routes are also in PUBLIC_ROUTES (with [param] placeholders).
  // These regexes match the actual runtime paths where the [param] is a real value
  // (cuid / USTN / quoteId / etc.). Belt-and-braces — PUBLIC_ROUTES already covers
  // the template form; the regex covers the runtime form.
  if (path.startsWith("/api/sgtx/transport/")) {
    // Allow every /api/sgtx/transport/* path EXCEPT the ones that collide
    // with sub-resources that need their own (e.g. none currently — all transport
    // routes are public for the demo portal). If a future route needs auth, add
    // an explicit exclusion here.
    return true;
  }
  // Phase 6 — Financial & Commercial Execution Fabric (Task 6-api).
  // All finance routes are also listed in PUBLIC_ROUTES (with [param] placeholders).
  // These regexes match the actual runtime paths where the [param] is a real value
  // (cuid / USTN / paymentId / lcNumber / traderGtid / financierGtid / etc.).
  // Belt-and-braces — PUBLIC_ROUTES already covers the template form; the regex
  // covers the runtime form. Routes that need auth should be added as explicit
  // exclusions inside this branch.
  if (path.startsWith("/api/sgtx/finance/")) {
    // Allow every /api/sgtx/finance/* path. All Phase 6 routes are public for
    // the financier portals (BANK / PFI), trader portals, and admin shells.
    // Tenant scoping is via body / query params.
    return true;
  }
  // Phase 7 — Post-Trade Completion Fabric (Task 7-api-admin).
  // All completion routes are also listed in PUBLIC_ROUTES (with [param] placeholders).
  // These regexes match the actual runtime paths where the [param] is a real value
  // (cuid / USTN / claimId / returnId / packageId / parentUstn / etc.). Belt-and-braces
  // — PUBLIC_ROUTES already covers the template form; the regex covers the runtime form.
  // Routes that need auth should be added as explicit exclusions inside this branch.
  if (path.startsWith("/api/sgtx/completion/")) {
    // Allow every /api/sgtx/completion/* path. All Phase 7 routes are public for
    // the Government portal admin shell + trader portals. Tenant scoping is via
    // body / query params.
    return true;
  }
  // Phase 8 — Worldwide Integration Catalog + Gap Control Center (Task 8-api-admin).
  // All integrations routes are also listed in PUBLIC_ROUTES (with [param] placeholders).
  // These regexes match the actual runtime paths where the [param] is a real value
  // (cuid / connectorId / jurisdictionCode / gapId / laneId / alertId / etc.).
  // Belt-and-braces — PUBLIC_ROUTES already covers the template form; the regex
  // covers the runtime form. Routes that need auth should be added as explicit
  // exclusions inside this branch.
  if (path.startsWith("/api/sgtx/integrations/")) {
    // Allow every /api/sgtx/integrations/* path EXCEPT the existing root
    // `/api/sgtx/integrations` endpoint (which is already in PUBLIC_ROUTES
    // for the legacy IntegrationsFull dashboard). All Phase 8 sub-paths are
    // public for the Government portal admin shell + trader portals.
    return true;
  }
  // Phase 9 — Worldwide Country Activation + Regulatory Change Management
  // (Task 9-api-admin). All regulatory routes are also listed in PUBLIC_ROUTES
  // (with [param] placeholders). These regexes match the actual runtime paths
  // where the [param] is a real value (cuid / changeId / workflowId /
  // versionId / countryCode / ustn / etc.). Belt-and-braces — PUBLIC_ROUTES
  // already covers the template form; the regex covers the runtime form.
  // Routes that need auth should be added as explicit exclusions inside this branch.
  if (path.startsWith("/api/sgtx/regulatory/")) {
    // Allow every /api/sgtx/regulatory/* path. All Phase 9 routes are public
    // for the Government portal admin shell (Regulatory Change Center) +
    // trader portals. Tenant scoping is via body / query params.
    return true;
  }
  // Phase 10 — Production Readiness Center (Task 10-api-admin).
  // All readiness routes are also listed in PUBLIC_ROUTES (with [param]
  // placeholders). These regexes match the actual runtime paths where the
  // [param] is a real value (cuid / ustn / reportId / etc.). Belt-and-braces
  // — PUBLIC_ROUTES already covers the template form; the regex covers the
  // runtime form. Routes that need auth should be added as explicit exclusions
  // inside this branch. The /api/sgtx/readiness/cron route is NOT covered
  // here — it requires CRON_SECRET (in CRON_ROUTES above).
  if (path.startsWith("/api/sgtx/readiness/")) {
    // Allow every /api/sgtx/readiness/* path EXCEPT /cron which is in
    // CRON_ROUTES (handled separately below). All Phase 10 verification +
    // report routes are public for the Government portal admin shell
    // (Production Readiness Center) + trader portals.
    return true;
  }
  // Constitutional Amendment Engines (Task amendment-gates-api).
  // All constitutional routes are also listed in PUBLIC_ROUTES (with
  // [param] placeholders). This regex matches the actual runtime paths
  // where the [param] is a real value (cuid / USTN / eventId /
  // exceptionId / legId / instructionId / obligationId / gatewayId /
  // packetId / entryId / etc.). Belt-and-braces — PUBLIC_ROUTES already
  // covers the template form; the regex covers the runtime form. Routes
  // that need auth should be added as explicit exclusions inside this branch.
  if (path.startsWith("/api/sgtx/constitutional/")) {
    // Allow every /api/sgtx/constitutional/* path. All Constitutional
    // Amendment engine routes are public for the Government Portal admin
    // shell (Constitutional Amendment Center) + trader portals. Tenant
    // scoping is via body / query params (ustn, etc.).
    return true;
  }
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

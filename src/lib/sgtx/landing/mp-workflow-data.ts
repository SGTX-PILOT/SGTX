// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v18 — Portal #12: MP Workflow Data (FINAL WORKFLOW — completes ALL 12 PORTALS!)
// Creative: Lead submission pipeline + revenue attribution flow + sandbox→production + webhook config
// ═══════════════════════════════════════════════════════════════════════════════

import type { LucideIcon } from "lucide-react";
import {
  Inbox, Eye, DollarSign, KeyRound, Webhook,
  CheckCircle2, AlertTriangle, Clock, ShieldAlert,
  Zap, FileText, Settings, Globe2, Send,
  RotateCcw, Users, BarChart3, Percent,
} from "lucide-react";

export interface FormField {
  key: string; label: string; type: "text" | "select" | "radio" | "number" | "textarea" | "smart" | "toggle" | "slider";
  options?: string[]; placeholder?: string; aiAssist?: string; defaultValue?: string; required?: boolean;
  min?: number; max?: number; step?: number;
}
export interface WorkflowStep {
  number: number; id: string; name: string; specRef: string; purpose: string; icon: LucideIcon;
  fields: FormField[]; aiSuggestion?: string; governorGate?: string; creativeFeature?: string;
}

export const MP_WORKFLOW_STEPS: WorkflowStep[] = [
  {
    number: 1, id: "lead-submit", name: "Lead Submission (Buyer Intent Capture)",
    specRef: "§16.8.6.12", purpose: "Capture buyer trade intent from marketplace. Submit lead with buyer GTID, commodity, route, quantity. SGTX qualifies (GTID verified, sanctions checked). Non-marketplace: no provider suggestions.",
    icon: Inbox, governorGate: "G1U1 (identity verified)", creativeFeature: "SVG lead submission pipeline (capture → qualify → submit → track)",
    aiSuggestion: "Lead submitted: Buyer Nile Harvest Trading (GTID SGTX-EG-26-NH3T-0042), Frozen Strawberries 20,000 kg, Egypt → Italy, CIF. GTID verified ✓. Sanctions clear ✓. KYB T3 sufficient. Lead qualified. Forwarded to SGTX platform for trade creation. Referral cookie: tradebridge.ref=abc123 (attribution evidence).",
    fields: [
      { key: "buyer", label: "Buyer (from marketplace)", type: "select", options: ["Nile Harvest Trading (GTID verified)", "Delta Foods Italia (GTID verified)", "Enter new GTID…"], required: true, defaultValue: "Nile Harvest Trading (GTID verified)" },
      { key: "commodity", label: "Commodity", type: "text", defaultValue: "Frozen Strawberries — 20,000 kg" },
      { key: "route", label: "Route", type: "text", defaultValue: "Egypt → Italy (Alexandria → Genoa)" },
      { key: "gtid-check", label: "GTID Verification", type: "toggle", options: ["Verified ✓ (Nile Harvest, KYB T3, sanctions clear)", "Failed — GTID not found"], defaultValue: "Verified ✓ (Nile Harvest, KYB T3, sanctions clear)", required: true },
      { key: "referral", label: "Referral Attribution Evidence", type: "text", defaultValue: "Cookie: tradebridge.ref=abc123, IP: 198.51.100.42 (whitelisted), timestamp: 2026-09-18 14:22" },
      { key: "submit", label: "Submit Lead to SGTX", type: "toggle", options: ["Submit — forward to SGTX platform", "Draft (save)"], defaultValue: "Submit — forward to SGTX platform", required: true },
    ],
  },
  {
    number: 2, id: "lead-qualify", name: "Lead Qualification & Tracking",
    specRef: "§16.8.6.12", purpose: "Track lead through qualification pipeline: submitted → GTID verified → sanctions checked → forwarded → trade created → USTN minted → revenue earned. Real-time status.",
    icon: Eye, governorGate: "G1U3 (sanctions clear)", creativeFeature: "SVG lead tracking pipeline with conversion stages",
    aiSuggestion: "Lead #L-2026-0042 tracking:\n• Submitted: 14:22 ✓\n• GTID verified: 14:23 ✓\n• Sanctions checked: 14:24 ✓ (3 hops, safe)\n• Forwarded to SGTX: 14:25 ✓\n• Trade created (13-section form): 14:30 ✓\n• USTN minted: 15:35 ✓ (SGTX-EG-26-NH3T-0042)\n• Revenue earned: pending (trade in execution phase)\n• Estimated revenue: $22.75 (15% of $151.34 SGTX fee)\n• Conversion: successful (lead → trade → USTN)",
    fields: [
      { key: "status", label: "Lead Status", type: "toggle", options: ["CONVERTED — USTN minted, trade in execution", "Pending — trade creation in progress", "Rejected — incomplete data"], defaultValue: "CONVERTED — USTN minted, trade in execution", required: true },
      { key: "ustn", label: "USTN (minted from lead)", type: "text", defaultValue: "SGTX-EG-26-NH3T-0042" },
      { key: "conversion-time", label: "Conversion Time", type: "text", defaultValue: "73 minutes (14:22 submit → 15:35 USTN mint)" },
      { key: "est-revenue", label: "Estimated Revenue (15% share)", type: "text", defaultValue: "$22.75 (15% of $151.34 SGTX fee, pending settlement)" },
    ],
  },
  {
    number: 3, id: "revenue-attribution", name: "Revenue Attribution (Attribution Verification)",
    specRef: "§16.8.6.12", purpose: "Verify that the lead originated from the marketplace partner. Check referral cookie, IP match, timestamp. If disputed: submit evidence. SGTX platform verifies attribution.",
    icon: DollarSign, governorGate: "G1U1 (attribution verified)", creativeFeature: "SVG attribution flow diagram (marketplace → SGTX → verification → revenue)",
    aiSuggestion: "ATTRIBUTION VERIFIED ✓\n• Referral cookie: tradebridge.ref=abc123 (present, valid)\n• IP match: 198.51.100.42 (whitelisted range 198.51.100.0/24)\n• Timestamp: 2026-09-18 14:22 (before trade creation 14:30)\n• Buyer clicked 'Trade via SGTX' link on TradeBridge marketplace\n• No organic search evidence (referral cookie takes precedence)\n• Attribution: TradeBridge Marketplace (15% revenue share)\n• Revenue: $22.75 (15% of $151.34, pending trade settlement)",
    fields: [
      { key: "attribution", label: "Attribution Result", type: "toggle", options: ["VERIFIED ✓ — referral cookie + IP match + timestamp confirmed", "DISPUTED — SGTX claims organic (evidence needed)"], defaultValue: "VERIFIED ✓ — referral cookie + IP match + timestamp confirmed", required: true },
      { key: "evidence", label: "Attribution Evidence", type: "textarea", defaultValue: "1. Referral cookie: tradebridge.ref=abc123 (present in buyer's session)\n2. IP address: 198.51.100.42 (matches whitelisted range 198.51.100.0/24)\n3. Timestamp: 2026-09-18 14:22 (4 minutes before trade creation at 14:26)\n4. Referrer URL: tradebridge.example/listings/frozen-strawberries-egypt\n5. No organic search referrer detected" },
      { key: "revenue", label: "Revenue Share (15%)", type: "text", defaultValue: "$22.75 = 15% × $151.34 SGTX fee. Pending trade settlement. Will be paid via ISO 20022." },
    ],
  },
  {
    number: 4, id: "revenue-dispute", name: "Revenue Attribution Dispute (if disputed)",
    specRef: "§16.8.6.12", purpose: "If SGTX disputes attribution: submit evidence package. SGTX platform reviews. Resolution: marketplace-attributed (revenue to partner) or organic (no revenue). Evidence-based, not opinion-based.",
    icon: ShieldAlert, governorGate: "G1U6 (intent — dispute resolution)", creativeFeature: "SVG dispute resolution flow (evidence → review → resolution)",
    aiSuggestion: "NOT DISPUTED for this lead (attribution verified in Step 3). If disputed:\n• Partner submits: referral cookie, IP match, timestamp, referrer URL\n• SGTX reviews: checks server logs, search referrer, direct access patterns\n• Resolution: if cookie present + IP whitelisted + timestamp before trade → marketplace-attributed (revenue to partner)\n• If no cookie + organic search referrer → organic (no revenue to partner)\n• Appeal: multisig 3-of-5 if either party disagrees with resolution\n• Escrow: revenue held in escrow during dispute (non-custodial FeeLock instruction)",
    fields: [
      { key: "disputed", label: "Attribution Disputed?", type: "toggle", options: ["No — attribution verified, not disputed ✓", "Yes — SGTX claims organic, evidence submitted"], defaultValue: "No — attribution verified, not disputed ✓", required: true },
      { key: "resolution", label: "Resolution (if disputed)", type: "text", defaultValue: "N/A — not disputed. If disputed: evidence reviewed, referral cookie takes precedence if IP whitelisted + timestamp before trade." },
      { key: "escrow", label: "Revenue Escrow (during dispute)", type: "toggle", options: ["N/A — not disputed", "Held in FeeLock instruction (non-custodial, no funds table)"], defaultValue: "N/A — not disputed" },
    ],
  },
  {
    number: 5, id: "webhook-config", name: "Webhook Configuration & Delivery",
    specRef: "§16.8.6.12", purpose: "Configure webhook endpoint. SGTX sends events: trade.created, trade.locked, trade.settled, trade.milestone, ustn.minted, closure.published. Auto-retry on failure (3 attempts: 1s, 2s, 4s).",
    icon: Webhook, governorGate: "§16.8.6.12 (webhook delivery)", creativeFeature: "SVG webhook delivery flow (SGTX → endpoint → success/retry/fail)",
    aiSuggestion: "WEBHOOK CONFIGURATION:\n• Endpoint: https://tradebridge.example/webhooks/sgtx\n• Events subscribed: trade.created, trade.locked, trade.settled, trade.milestone, ustn.minted, closure.published (6 events)\n• Delivery: 6/8 delivered successfully (75%), 2 failed (timeout 5s)\n• Auto-retry: 3 attempts (1s, 2s, 4s exponential backoff)\n• Last 8 deliveries: 6 ✓ delivered (avg latency 191ms), 2 ✗ failed (timeout)\n• Endpoint health: DEGRADED (check server, may be down or slow)\n• Recommendation: increase endpoint timeout or add queue (SQS/RabbitMQ)",
    fields: [
      { key: "endpoint", label: "Webhook Endpoint URL", type: "text", defaultValue: "https://tradebridge.example/webhooks/sgtx" },
      { key: "events", label: "Events Subscribed (6)", type: "textarea", defaultValue: "trade.created, trade.locked, trade.settled, trade.milestone, ustn.minted, closure.published" },
      { key: "delivery", label: "Delivery Status", type: "toggle", options: ["6/8 delivered (75% success, 2 timeout — DEGRADED)", "8/8 delivered (100% success)", "0/8 delivered (endpoint down)"], defaultValue: "6/8 delivered (75% success, 2 timeout — DEGRADED)", required: true },
      { key: "retry", label: "Auto-Retry Config", type: "text", defaultValue: "3 attempts (1s, 2s, 4s exponential backoff, max 3 retries)" },
      { key: "health", label: "Endpoint Health", type: "toggle", options: ["DEGRADED — 2 timeouts, check server", "HEALTHY — all deliveries within 5s", "DOWN — endpoint unreachable"], defaultValue: "DEGRADED — 2 timeouts, check server" },
    ],
  },
  {
    number: 6, id: "api-key-gen", name: "API Key Generation (Production + Sandbox)",
    specRef: "§16.8.6.12", purpose: "Generate API keys. Production key: 5000 calls/day, real trades, Ed25519 signed. Sandbox key: 1000 calls/day, synthetic data only, no real trades. Scope-limited JWT.",
    icon: KeyRound, governorGate: "§16.8.6.12 (API key management)", creativeFeature: "SVG API key lifecycle (generate → scope → rate limit → usage)",
    aiSuggestion: "API KEY MANAGEMENT:\n• Production key: MP-PROD-2026-0042 (Ed25519 signed, 5000/day, real trades, scopes: lead:submit, webhook:config, revenue:view)\n• Sandbox key: MP-SANDBOX-2026-0042 (synthetic data only, 1000/day, no real trades, scopes: lead:submit, webhook:test)\n• Usage today: 1240/5000 (24.8%, on track)\n• IP whitelist: 198.51.100.0/24 (1 of 5 max ranges)\n• Rate limit: 500 req/min burst, 5000/day sustained\n• Key rotation: every 90 days (auto-reminder 7 days before expiry)",
    fields: [
      { key: "prod-key", label: "Production API Key", type: "text", defaultValue: "MP-PROD-2026-0042 (Ed25519, 5000/day, scopes: lead/webhook/revenue)" },
      { key: "sandbox-key", label: "Sandbox API Key", type: "text", defaultValue: "MP-SANDBOX-2026-0042 (synthetic, 1000/day, no real trades)" },
      { key: "scopes", label: "API Scopes", type: "textarea", defaultValue: "Production: lead:submit, webhook:config, webhook:read, revenue:view, revenue:dispute\nSandbox: lead:submit (synthetic), webhook:test, revenue:view (mock)" },
      { key: "rate-limit", label: "Rate Limit", type: "text", defaultValue: "500 req/min burst, 5000/day sustained (production); 100 req/min, 1000/day (sandbox)" },
      { key: "rotation", label: "Key Rotation", type: "toggle", options: ["90-day rotation (auto-reminder 7 days before)", "Manual rotation", "Disabled"], defaultValue: "90-day rotation (auto-reminder 7 days before)", required: true },
    ],
  },
  {
    number: 7, id: "sandbox-test", name: "Sandbox Testing (Synthetic Data)",
    specRef: "§16.8.6.12", purpose: "Test integration in sandbox with synthetic data. Submit synthetic leads, receive synthetic webhooks, test revenue calculation. No real trades, no real revenue. Verify before production.",
    icon: Eye, governorGate: "§16.8.6.12 (sandbox)", creativeFeature: "SVG sandbox testing checklist (all tests passed)",
    aiSuggestion: "SANDBOX TESTING COMPLETE:\n• Synthetic lead submitted: SYNTH-LEAD-001 (buyer: TEST-BUYER-001, commodity: Synthetic Strawberries)\n• GTID check: synthetic GTID verified ✓\n• Webhook delivered: trade.created event received ✓ (latency 45ms)\n• Revenue calculation: 15% × $1.51 synthetic fee = $0.23 (mock revenue)\n• API rate: 45/1000 (4.5%, well within sandbox limit)\n• All 5 integration tests passed: lead submit ✓, webhook receive ✓, revenue calc ✓, API auth ✓, IP whitelist ✓\n• Ready for production deployment",
    fields: [
      { key: "synthetic-lead", label: "Synthetic Lead Test", type: "toggle", options: ["Passed ✓ (SYNTH-LEAD-001, synthetic GTID verified)", "Failed"], defaultValue: "Passed ✓ (SYNTH-LEAD-001, synthetic GTID verified)", required: true },
      { key: "webhook-test", label: "Webhook Delivery Test", type: "toggle", options: ["Passed ✓ (trade.created received, 45ms latency)", "Failed (timeout)"], defaultValue: "Passed ✓ (trade.created received, 45ms latency)" },
      { key: "revenue-calc", label: "Revenue Calculation Test", type: "toggle", options: ["Passed ✓ (15% × $1.51 = $0.23 mock)", "Failed"], defaultValue: "Passed ✓ (15% × $1.51 = $0.23 mock)" },
      { key: "all-tests", label: "Integration Tests (5/5)", type: "toggle", options: ["All 5 passed ✓ — ready for production", "3/5 passed — fix before production"], defaultValue: "All 5 passed ✓ — ready for production", required: true },
    ],
  },
  {
    number: 8, id: "agreement-renewal", name: "Agreement Renewal (Revenue Share Terms)",
    specRef: "§16.8.6.12", purpose: "Review and renew revenue share agreement. Current: 15% partner / 85% SGTX. Renewal proposal: maintain 15%, add API v2 access, expanded webhook events, sandbox with synthetic data. Sign with QES.",
    icon: FileText, governorGate: "§16.8.6.12 (agreement)", creativeFeature: "SVG agreement terms comparison (current vs proposed)",
    aiSuggestion: "AGREEMENT RENEWAL:\n• Current: 15% revenue share, expires 2026-10-19 (30 days remaining)\n• Proposed: maintain 15% (market standard), add API v2 access (GraphQL), expanded webhook events (8 new event types), sandbox with synthetic data, 90-day key rotation\n• Changes: +8 webhook events, API v2 (GraphQL), sandbox access, auto key rotation\n• Revenue impact: no change (15% maintained)\n• Sign with QES (Egypt Trust Ed25519)\n• Effective: 2026-10-19 (immediate on expiry)",
    fields: [
      { key: "current", label: "Current Agreement", type: "text", defaultValue: "15% revenue share, expires 2026-10-19 (30 days), API v1, 6 webhook events" },
      { key: "proposed", label: "Proposed Renewal", type: "text", defaultValue: "15% maintained, API v2 (GraphQL), +8 webhook events (14 total), sandbox access, 90-day key rotation" },
      { key: "revenue-impact", label: "Revenue Impact", type: "radio", options: ["No change — 15% maintained (market standard)", "Increase to 18% (high-volume partner discount)", "Decrease to 12% (new partner tier)"], defaultValue: "No change — 15% maintained (market standard)", required: true },
      { key: "sign", label: "Sign Agreement (QES)", type: "toggle", options: ["Signed ✓ (Ed25519 via Egypt Trust, effective 2026-10-19)", "Pending — review terms"], defaultValue: "Signed ✓ (Ed25519 via Egypt Trust, effective 2026-10-19)", required: true },
    ],
  },
  {
    number: 9, id: "revenue-settlement", name: "Revenue Settlement (ISO 20022 + Closure)",
    specRef: "§13, §16.8.6.12", purpose: "Revenue share payment received via ISO 20022. $22.75 = 15% of $151.34 SGTX fee. Settlement confirmed. Reconciliation 100%. Revenue recorded. Agreement active.",
    icon: CheckCircle2, governorGate: "G6 (settlement) + G7 (closure)", creativeFeature: "SVG revenue settlement summary with attribution chain",
    aiSuggestion: "REVENUE SETTLEMENT COMPLETE:\n• Revenue: $22.75 (15% of $151.34 SGTX trade fee)\n• Attribution: TradeBridge Marketplace (referral cookie verified, IP whitelisted)\n• Settlement: ISO 20022 pain.001 (CBE clearing)\n• Reconciliation: 100% (≥95% threshold — passed)\n• Lead #L-2026-0042 → USTN SGTX-EG-26-NH3T-0042 → Revenue $22.75\n• Total YTD revenue: $12.6K (42 converted leads)\n• Agreement: active (15% share, renewed until 2027-10-19)\n• Closure hash published on Loom",
    fields: [
      { key: "revenue", label: "Revenue Received", type: "text", defaultValue: "$22.75 (15% of $151.34 SGTX fee)" },
      { key: "settlement", label: "ISO 20022 Settlement", type: "toggle", options: ["Confirmed ✓ (pain.001, CBE clearing)", "Pending"], defaultValue: "Confirmed ✓ (pain.001, CBE clearing)", required: true },
      { key: "reconciliation", label: "Reconciliation Confidence", type: "text", defaultValue: "100% (≥95% threshold — passed)" },
      { key: "attribution-chain", label: "Attribution Chain", type: "text", defaultValue: "Lead L-2026-0042 → Trade USTN ...0042 → Fee $151.34 → Share 15% → Revenue $22.75" },
      { key: "ytd", label: "Total YTD Revenue", type: "text", defaultValue: "$12.6K (42 converted leads × avg $300 fee × 15% share)" },
      { key: "closure", label: "Closure Hash Published (Loom)", type: "toggle", options: ["Published", "Pending"], defaultValue: "Published", required: true },
    ],
  },
];

export interface DownstreamPhase {
  phase: string; name: string; specRef: string; status: "complete" | "active" | "pending" | "blocked";
  description: string; governorGate: string; icon: LucideIcon;
}

export const MP_DOWNSTREAM_PHASES: DownstreamPhase[] = [
  { phase: "Phase 1", name: "Lead Submitted (Buyer Intent)", specRef: "§16.8.6.12", status: "complete", description: "Nile Harvest lead captured. GTID verified. Sanctions clear. Referral cookie present. Forwarded to SGTX.", governorGate: "G1U1", icon: Inbox },
  { phase: "Phase 2", name: "Lead Tracked (Converted)", specRef: "§16.8.6.12", status: "complete", description: "Lead #L-2026-0042 → USTN minted (73 min). Conversion: successful. Est. revenue $22.75.", governorGate: "G1U3", icon: Eye },
  { phase: "Phase 3", name: "Attribution Verified", specRef: "§16.8.6.12", status: "complete", description: "Referral cookie + IP match + timestamp confirmed. TradeBridge attributed. 15% revenue share.", governorGate: "G1U1", icon: DollarSign },
  { phase: "Phase 4", name: "Attribution Not Disputed", specRef: "§16.8.6.12", status: "complete", description: "SGTX accepted attribution. No dispute. Revenue not in escrow. Direct settlement path.", governorGate: "G1U6", icon: ShieldAlert },
  { phase: "Phase 5", name: "Webhook Configured", specRef: "§16.8.6.12", status: "active", description: "6 events subscribed. 6/8 delivered (75%). 2 timeout (degraded). Auto-retry active. Endpoint needs check.", governorGate: "§16.8.6.12", icon: Webhook },
  { phase: "Phase 6", name: "API Keys Generated", specRef: "§16.8.6.12", status: "pending", description: "Production (5000/day, Ed25519) + Sandbox (1000/day, synthetic). 90-day rotation. IP whitelist 1/5.", governorGate: "§16.8.6.12", icon: KeyRound },
  { phase: "Phase 7", name: "Sandbox Tested (5/5)", specRef: "§16.8.6.12", status: "pending", description: "Synthetic lead, webhook, revenue calc, API auth, IP whitelist — all 5 tests passed. Ready for prod.", governorGate: "§16.8.6.12", icon: Eye },
  { phase: "Phase 8", name: "Agreement Renewed", specRef: "§16.8.6.12", status: "pending", description: "15% maintained. API v2 + 8 new webhook events + sandbox. QES signed. Effective 2026-10-19.", governorGate: "§16.8.6.12", icon: FileText },
  { phase: "Phase 9", name: "Revenue Settled ($22.75)", specRef: "§13", status: "pending", description: "ISO 20022 pain.001. Reconciliation 100%. Attribution chain verified. YTD $12.6K. Loom sealed.", governorGate: "G6 + G7", icon: CheckCircle2 },
];

export const MP_VALIDATION_GATES = [
  { gate: "G1U1", name: "Lead Attribution Verified", description: "Referral cookie + IP whitelist + timestamp confirmed. TradeBridge attributed.", status: "pass" },
  { gate: "G1U3", name: "Sanctions Clear", description: "Buyer Nile Harvest: 3 hops (safe). Sanctions screening passed.", status: "pass" },
  { gate: "G1U6", name: "Dispute Resolution", description: "Attribution not disputed. Revenue not in escrow. Direct settlement.", status: "pass" },
  { gate: "§16.8.6.12", name: "Webhook Configured", description: "6 events, endpoint configured, auto-retry active. 75% success (degraded).", status: "conditional" },
  { gate: "§16.8.6.12", name: "API Keys Generated", description: "Production (Ed25519, 5000/day) + Sandbox (synthetic, 1000/day). 90-day rotation.", status: "pass" },
  { gate: "§16.8.6.12", name: "Sandbox Tested", description: "5/5 integration tests passed. Synthetic lead, webhook, revenue, auth, IP.", status: "pass" },
  { gate: "§16.8.6.12", name: "Agreement Signed", description: "15% share maintained. API v2 + 8 new events. QES signed. Effective 2026-10-19.", status: "pass" },
  { gate: "G6+G7", name: "Revenue Settled + Closure", description: "$22.75 (15% of $151.34) via ISO 20022. Reconciliation 100%. Loom sealed.", status: "pass" },
];

export const MP_SETTLEMENT_SUMMARY = {
  leadId: "L-2026-0042",
  ustn: "SGTX-EG-26-NH3T-0042",
  buyer: "Nile Harvest Trading",
  commodity: "Frozen Strawberries — 20,000 kg",
  route: "Egypt → Italy (Alexandria → Genoa)",
  sgtxFee: "$151.34 (0.144% of $105,100 Canonical Fee Basis)",
  revenueShare: "15% (TradeBridge Marketplace)",
  revenueReceived: "$22.75",
  attributionMethod: "Referral cookie (tradebridge.ref=abc123) + IP whitelist (198.51.100.0/24) + timestamp (before trade creation)",
  settlementMethod: "ISO 20022 pain.001 (CBE clearing)",
  reconciliation: "100% (≥95% threshold — passed)",
  ytdRevenue: "$12.6K (42 converted leads)",
  agreementStatus: "Active (15% share, renewed until 2027-10-19, API v2 + 14 webhook events + sandbox)",
  webhookHealth: "75% success (6/8 delivered, 2 timeout — degraded, auto-retry active)",
  apiKeys: "Production (MP-PROD-2026-0042, 5000/day) + Sandbox (MP-SANDBOX-2026-0042, 1000/day)",
  sandboxTests: "5/5 passed (lead, webhook, revenue, auth, IP)",
  closureHash: "0xe7c3...f9a2 (published on Loom)",
};

export const MP_CLOSURE_CONDITIONS = [
  { name: "Lead submitted + GTID verified + sanctions clear", status: "pending" as const },
  { name: "Lead converted (USTN minted, trade in execution)", status: "pending" as const },
  { name: "Attribution verified (referral cookie + IP + timestamp)", status: "pending" as const },
  { name: "Webhook configured + delivering (6 events, auto-retry)", status: "pending" as const },
  { name: "API keys generated (production + sandbox, 90-day rotation)", status: "pending" as const },
  { name: "Sandbox tested (5/5 integration tests passed)", status: "pending" as const },
  { name: "Revenue settled ($22.75 via ISO 20022, Loom sealed)", status: "pending" as const },
];

// SVG DATA: Lead submission pipeline
export const LEAD_PIPELINE = [
  { stage: "Capture", status: "complete", icon: "📥" },
  { stage: "GTID Verify", status: "complete", icon: "🔍" },
  { stage: "Sanctions", status: "complete", icon: "🛡️" },
  { stage: "Forward", status: "complete", icon: "➡️" },
  { stage: "Trade Created", status: "complete", icon: "📝" },
  { stage: "USTN Minted", status: "complete", icon: "✅" },
  { stage: "Revenue", status: "pending", icon: "💰" },
];

// SVG DATA: Attribution flow
export const ATTRIBUTION_FLOW = [
  { node: "Marketplace", x: 10, y: 30, type: "source", label: "TradeBridge" },
  { node: "Buyer Click", x: 30, y: 30, type: "action", label: "ref=abc123" },
  { node: "SGTX Platform", x: 50, y: 30, type: "platform", label: "Trade Created" },
  { node: "Attribution Check", x: 70, y: 30, type: "verify", label: "Cookie + IP + Time" },
  { node: "Revenue", x: 90, y: 30, type: "result", label: "$22.75 (15%)" },
];

// SVG DATA: Webhook delivery flow
export const WEBHOOK_FLOW = [
  { event: "trade.created", status: "delivered", latency: 180 },
  { event: "trade.locked", status: "delivered", latency: 210 },
  { event: "trade.settled", status: "failed", latency: 5000 },
  { event: "ustn.minted", status: "delivered", latency: 175 },
  { event: "closure.published", status: "failed", latency: 5000 },
  { event: "trade.milestone", status: "delivered", latency: 195 },
];

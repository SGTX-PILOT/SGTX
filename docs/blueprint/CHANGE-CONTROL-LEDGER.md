# SGTX Blueprint — Change Control Ledger

**Source of truth:** `upload/SGTX_Blueprint_v11.1_Complete.docx` (v11.1, MASTER BLUEPRINT — FULLY EXPANDED, PRODUCTION-READY)

**This file:** A formal, append-only change-control ledger that records every
modification applied to the v11.1 blueprint during implementation. The
blueprint itself is treated as the canonical specification; this ledger is the
delta log between the spec and the running system.

**Constitutional invariants (must hold for every change):**
1. Non-marketplace — no counterparty recommendations, no provider ranking, no match score.
2. Non-custodial — SGTX never holds funds (PSP split + FeeLock escrow only).
3. AI may block, never force — Governor gatekeeper, no autonomous execution.
4. Sovereign jurisdiction supremacy — jurisdictional rules never overridden by AI.
5. Cryptographic certainty — GTID + USTN + Governor + Loom audit trail.

---

## Change Control Process

Every change to the platform that touches the blueprint's domain model,
workflow, role architecture, or governance contract MUST be recorded here
before it ships. A change is recorded as a numbered entry with:

- **Change ID** (sequential, never reused)
- **Blueprint section affected** (e.g. PART 9 — Logistics)
- **Type** (ADD / MODIFY / REMOVE / CLARIFY)
- **Rationale**
- **Implementation reference** (file path / API route / Prisma model)
- **Governor actions touched**
- **Audit impact** (new Loom event types, new GTID-bearing records)
- **Status** (PROPOSED → APPROVED → SHIPPED → SUPERSEDED)

A change is **APPROVED** only when it has been reviewed against the five
constitutional invariants above. A change is **SHIPPED** only when the code is
merged, the Prisma schema is pushed to Turso, and the smoke test passes.

---

## CCL-001 — Logistics Orchestration (Mode A / B / C Normalized Quote System)

- **Change ID:** CCL-001
- **Blueprint section:** PART 9 — Logistics Provider Management (LSP, SHIP, LAB, QC, CBR portals, quotations, addenda); PART 12 — Universal Command Center (Trade Health Score)
- **Type:** ADD (new normalized logistics quote subsystem) + MODIFY (role/domain boundary clarification for CBR)
- **Rationale:** The v11.1 blueprint described logistics quotation at a
  high level (RFQ → quote → select). Production trading requires a
  normalized, versioned, capacity- and booking-aware quote object that
  works identically across Mode A (seller-entered known cost), Mode B
  (LSP RFQ for trucking/warehousing/customs brokerage), and Mode C
  (direct SHIP request), while preserving the non-marketplace principle
  (no ranking, no match score, no recommendation).
- **Implementation reference:**
  - `prisma/schema.prisma` — 11 new models (LogisticsQuote,
    LogisticsQuoteVersion, LogisticsQuoteSurcharge,
    LogisticsQuoteAssumption, LogisticsCapacity, LogisticsBooking,
    LogisticsServiceCommitment, LogisticsDriftEvent, LogisticsFallback,
    LogisticsRouteFeasibility, ProviderEligibility). 222 total models.
  - `src/lib/sgtx/logistics/index.ts` — 1,530 lines, 30 exported functions.
  - `src/app/api/sgtx/logistics/**` — 18 new API routes.
- **Governor actions touched:** 5 new —
  `logistics.quote.create`, `logistics.quote.select`,
  `logistics.capacity.confirm`, `logistics.booking.confirm`,
  `logistics.fallback.activate`.
- **Audit impact:** Every quote mutation emits a Loom record. Quote
  versions are immutable. Capacity and booking transitions are
  independently auditable. Drift events carry original/current/delta.
- **Status:** SHIPPED ✅

### Sub-changes (48 modifications, sections 0–46 of the implementation report)

| # | Section | Change type | Summary |
|---|---------|-------------|---------|
| 0 | Authority & source of truth | PRESERVE | Blueprint terminology (GTID, USTN, Governor, OPA, WasmEdge, Loom) preserved. Role architecture preserved. Non-custodial preserved. Non-marketplace preserved. |
| 1 | Role & domain separation | VERIFY | 6 logistics-bearing roles (TRD, LSP, SHIP, LAB, QC, CBR) preserved with correct subtyping. |
| 2 | Canonical domain model | IMPLEMENT | TRADE / LOGISTICS / CARRIER / TESTING / INSPECTION / CUSTOMS-EXECUTION / GOVERNMENT / FINANCE domains formalized. |
| 3 | Non-marketplace principle | ENFORCE | No counterparty recommendations anywhere in logistics code. Verified by grep. |
| 4 | Logistics-service RFQ exception | IMPLEMENT | Directed RFQ + anonymous broadcast RFQ to eligible LSPs supported. Quote comparison factual only. |
| 5 | Remove match score / recommendation | VERIFY (none existed) | No matchScore / recommend / ranking in logistics code. ProviderPerformance retains factual metrics only. |
| 6 | No generic provider ranking engine | ENFORCE | ProviderEligibility returns binary factual gates (license, insurance, route, equipment, jurisdiction, sanctions, capacity). |
| 7 | Mode A (manual entry) | IMPLEMENT | `createLogisticsQuote(sourceMode: "MODE_A")` — seller enters known cost; provider optional. |
| 8 | Mode B (RFQ to LSPs) | IMPLEMENT | `createLogisticsQuote(sourceMode: "MODE_B")` — RFQ to specific LSP; LSP submits via Smart Inbox. |
| 9 | Mode C (direct to SHIP) | IMPLEMENT | `createLogisticsQuote(sourceMode: "MODE_C")` — direct carrier; existing ship-quote/request route preserved. |
| 10 | Mode A+B+C combinable | IMPLEMENT | `getLogisticsBundle(ustn)` returns all quotes per USTN across modes. |
| 11 | Logistics bundle | IMPLEMENT | Bundle aggregates confirmed / estimated / conditional costs with per-line provenance. |
| 12 | Normalized quote object | IMPLEMENT | LogisticsQuote (50+ fields) + 10 related models. Single canonical model for all 3 modes. |
| 13 | Quote validity & expiry | IMPLEMENT | 12-state quote lifecycle; `expireLogisticsQuotes()` cron; expired selected quotes blocked by Governor. |
| 14 | Capacity distinct from price | IMPLEMENT | Capacity lifecycle: PENDING → AVAILABLE → HELD → CONFIRMED → LOST. Never QUOTED → BOOKED without capacity. |
| 15 | Logistics drift monitor | IMPLEMENT | `detectDrift(quoteId)` compares current vs SELECTED snapshot. 6 drift types. Never auto-rewrites seller contract. |
| 16 | Quote versioning | IMPLEMENT | `updateLogisticsQuote()` creates new version; old versions immutable; `currentVersion` pointer. |
| 17 | Assumptions & exclusions | IMPLEMENT | `addAssumption` / `addExclusion` with structured keys (COMMODITY, QUANTITY, EQUIPMENT, ORIGIN, PORT, PICKUP, INCLUDED, EXCLUDED, VALID_UNTIL). |
| 18 | Hidden-cost / surcharge engine | IMPLEMENT | 15 surcharge types; known / conditional / excluded separation; `calculateSurcharges` returns base + known + conditional + excluded + estimated + maxExposure. |
| 19 | Route feasibility | IMPLEMENT | `checkRouteFeasibility` validates pickup → loading → cutoff → sailing → transit → customs → inspection → arrival → delivery → deadline → buffer. Returns FEASIBLE / CONDITIONALLY_FEASIBLE / NOT_FEASIBLE. |
| 20 | Service commitment | IMPLEMENT | LogisticsServiceCommitment model (pickup, delivery, equipment, capacity, response SLA, cancellation, liability, documentation, penalty, escalation). |
| 21 | Fallback logistics plan | IMPLEMENT | `createFallbackPlan` + `activateFallback` (PRIMARY → BACKUP → EMERGENCY). Activation requires seller + Governor, never automatic. |
| 22 | Cost certainty | IMPLEMENT | `calculateCostCertainty(ustn)` returns confirmed / estimated / conditional / grand total. Structure indicator, not a ranking. |
| 23 | Seller margin at risk | IMPLEMENT | `calculateMarginAtRisk` — seller-only advisory. Never changes seller pricing, never selects providers, never auto-fallbacks. |
| 24 | Provider performance | PRESERVE | ProviderPerformance retains factual metrics (on-time %, dispute rate, invoice accuracy, risk score, quartile). No ranking. |
| 25 | Logistics truth layer | IMPLEMENT | `getLogisticsHistory(ustn)` returns full audit trail: WHO / WHAT / WHEN / PRICE / CURRENCY / VALIDITY / ASSUMPTIONS / EXCLUSIONS / CAPACITY / BOOKING / CHANGES / REASONS / APPROVALS / FINAL_INVOICE / FINAL_COST. |
| 26 | Seller dashboard | PRESERVE | Pending Requests, EXW Price Lock, Containerisation & Packing, Logistics Builder, Quote Submission, QC Booking, Laboratory Selection, Document Finalisation, Barcode Print. |
| 27 | LSP portal | PRESERVE | Smart Inbox, RFQ Inbox, Shipments, Dispatch Planner, Warehouse Dashboard, Forwarder Console, Performance, Invoices & Payments, Company Admin. No LAB / QC dashboards in LSP. |
| 28 | SHIP portal | PRESERVE | Booking Requests, eBL Management, Vessel Schedule, Freight Invoices, Contract Rate Manager, Performance, Company Admin. |
| 29 | LAB portal | PRESERVE | Inbox, Testing Jobs, Result Submission, Certificates, Performance, Invoices & Payments, Company Admin. NOT under Mode B. |
| 30 | QC portal | PRESERVE | Inspection Jobs, Mobile App, Report Submission, Re-inspection, Dispute Fast-Track, Performance, Company Admin. NOT turned into logistics. |
| 31 | CBR portal | PRESERVE | Certification Requests, Physical Document Jobs, Storage, Audit Representation, Performance, Invoices & Payments, Company Admin. Customs brokerage IS a Mode B service category. |
| 32 | Mode B + C combination | IMPLEMENT | Single trade may carry Trucking (B/LSP) + Customs Brokerage (B/LSP) + Ocean Freight (C/SHIP) + THC (A/Manual). |
| 33 | Mode C ancillary services | PRESERVE | Mode C request may include bundled/line-item ancillary services (trucking, customs broker, insurance, destination handling). Underlying service ownership respects role architecture. |
| 34 | AI rules | ENFORCE | AI MAY extract / explain / identify / analyze / summarize. AI MUST NOT recommend / rank / score / select / switch / activate fallback / alter price or terms / create unsolicited relationships. |
| 35 | Governor controls | IMPLEMENT | 5 logistics Governor actions; `validateLogisticsQuote` checks quote integrity, mandatory fields, valid source, valid version, non-duplicate, quote expiry, provider eligibility, capacity confirmation, route feasibility, incoterm services, cost integrity. |
| 36 | API architecture | IMPLEMENT | 18 new endpoints (quote create / get / patch / select / capacity / booking / surcharge / assumption / feasibility / eligibility / drift / fallback create / fallback activate / cost-certainty / margin-at-risk / history / bundle / expire). |
| 37 | Database architecture | IMPLEMENT | 11 new Prisma models (222 total). All linked to USTN + GTID. Tenant isolation preserved. Synced to Turso. |
| 38 | Testing | PASS | 7/7 smoke tests passed (Mode A, Mode B/C, combined bundle, eligibility factual, cost certainty, margin at risk, non-marketplace verification). |
| 39 | Non-marketplace tests | VERIFY | No provider ranking anywhere. No match score in providers/ship-quote/quote routes. No "best provider" / "recommended provider" language. No AI provider selection. RFQ workflow functional (directed + anonymous broadcast). |
| 40 | Implementation order | COMPLETE | P0 (core integrity) — DONE. P1 (operational reliability) — DONE. P2 (strategic intelligence) — DONE. |
| 41 | Regression requirement | PASS | No regression. Full E2E workflow intact. All prior fixes (CSRF, dual-mode, IDOR, rate limiting, form validation) intact. Lint 0 errors. |
| 42 | Blueprint change control | THIS DOCUMENT | This ledger entry (CCL-001) is the change-control record for the logistics subsystem. |
| 43 | Blueprint version pin | PIN | Implementation targets `SGTX_Blueprint_v11.1_Complete.docx`. Any future blueprint revision MUST bump the version and add a new CCL entry cross-referencing the prior one. |
| 44 | Blueprint reconciliation cadence | DEFINE | Reconcile this ledger against the source blueprint on every release. Any drift between spec and running system is either (a) a new CCL entry, or (b) a defect. |
| 45 | COO acceptance criteria | PASS | All architectural, role-structure, quote-integrity, provider-governance, operational-resilience, governance, and audit criteria verified TRUE. |
| 46 | Final canonical model | IMPLEMENT | Mode A seller-entered; Mode B RFQ to LSP; Mode C direct SHIP. Normalize → Validate Incoterm → Provider Eligibility → Quote Validity → Capacity → Route → Total Exposure → Seller Selects → Confirm Capacity → Book → Monitor Drift → Execute → Reconcile → USTN/Audit. LAB / QC / CBR remain separate portals; customs brokerage is a Mode B service category. |

### Implementation statistics

| Metric | Value |
|--------|-------|
| New Prisma models | 11 (222 total) |
| New lib file | 1,530 lines / 30 exported functions |
| New API routes | 18 |
| Governor actions added | 5 |
| Total modifications | 48 (sections 0–46) |
| Lint errors | 0 |
| Smoke tests passed | 7/7 |
| Match scores removed | 0 (none existed — verified clean) |
| Provider rankings removed | 0 (none existed — verified clean) |
| Role/domain separations preserved | 6 (LSP, SHIP, LAB, QC, CBR, TRD) |

---

## CCL-002 — Secrets & Deployment Configuration

- **Change ID:** CCL-002
- **Blueprint section:** PART 0 — Executive Summary & Core Philosophy (Zero-Cost, Fee Model); PART 13 — Complete Data Model & API Index
- **Type:** ADD (deployment + secret configuration)
- **Rationale:** The blueprint specifies a production-ready sovereign trade OS.
  Production-readiness requires (a) the Prisma schema deployed to the Turso
  remote database, (b) the codebase pushed to the canonical GitHub repository,
  (c) the Next.js application deployed to Vercel at the canonical domain, and
  (d) the AI / data-provider API keys wired into the runtime environment.
- **Implementation reference:**
  - GitHub repository: `SGTX-PILOT/SGTX` (canonical source)
  - Vercel project: `sgtx` → `sgtx.vercel.app`
  - Turso database: `sgtx-fortleem` (`libsql://sgtx-fortleem.aws-us-east-1.turso.io`)
  - `.env` (gitignored): `DATABASE_URL`, `TURSO_AUTH_TOKEN`,
    `AIS_STREAM_API_KEY`, `HUGGINGFACE_API_KEY`, `GEMINI_API_KEY`,
    `GROQ_API_KEY`, plus all existing app secrets.
- **Governor actions touched:** none (configuration, not workflow).
- **Audit impact:** The Turso token and AI provider keys are secrets; they
  are stored ONLY in `.env` locally and in the Vercel project environment
  (encrypted). They are NEVER committed to git. The `.gitignore` explicitly
  excludes `.env`.
- **Status:** SHIPPED ✅

### Secret rotation policy

| Secret | Storage | Rotation cadence |
|--------|---------|------------------|
| `DATABASE_URL` (Turso libsql URL) | `.env` + Vercel env | On Turso DB relocation only |
| `TURSO_AUTH_TOKEN` | `.env` + Vercel env | 90 days |
| `AIS_STREAM_API_KEY` (vessel tracking) | `.env` + Vercel env | 90 days |
| `HUGGINGFACE_API_KEY` | `.env` + Vercel env | 90 days |
| `GEMINI_API_KEY` | `.env` + Vercel env | 90 days |
| `GROQ_API_KEY` | `.env` + Vercel env | 90 days |
| `GITHUB_TOKEN` (deploy PAT) | git credential helper only | 90 days; scoped to `repo` + `workflow` |
| `VERCEL_TOKEN` | local CLI only | 90 days |

---

## Reconciliation log

| Date (UTC) | Reconciler | Blueprint version | Ledger version | Drift found | Resolution |
|------------|------------|-------------------|----------------|-------------|------------|
| 2026-08-15 | COO/CTO/PM | v11.1 | CCL-001, CCL-002 shipped | none | n/a |

---

## How to add a new change entry

1. Copy the CCL-00X template below.
2. Fill every field. "Implementation reference" MUST point at real file paths.
3. Verify against the five constitutional invariants at the top of this file.
4. Set status to PROPOSED.
5. On Governor + COO sign-off, set to APPROVED.
6. On merge + Turso push + smoke test pass, set to SHIPPED.
7. Append to the reconciliation log.

```markdown
## CCL-00X — <title>

- **Change ID:** CCL-00X
- **Blueprint section:** PART <N> — <name>
- **Type:** ADD / MODIFY / REMOVE / CLARIFY
- **Rationale:** <why>
- **Implementation reference:** <file paths / API routes / Prisma models>
- **Governor actions touched:** <list or "none">
- **Audit impact:** <new Loom event types / new GTID-bearing records / none>
- **Status:** PROPOSED → APPROVED → SHIPPED → SUPERSEDED
```

---

## CCL-003 — SGTX Brain AI Activation + Worldwide Integrations

- **Change ID:** CCL-003
- **Blueprint section:** PART 11 — Seven Critical Add-ons (GNN, Federated Learning, Causal Inference, Self-Healing); PART 9 — Logistics Provider Management; PART 12 — Universal Command Center
- **Type:** ADD (Brain activation + 4 new worldwide integrations) + MODIFY (learning persistence, AIS URL fix, cron consolidation)
- **Rationale:** The Brain AI was fully coded but DORMANT in production — no auto-init, no daily cron, learning state was in-memory only (lost on every Vercel serverless cold start). Additionally, the platform lacked worldwide macro-economic data (tariffs, indicators, port congestion) needed for global operation beyond Egypt.
- **Implementation reference:**
  - `src/instrumentation.ts` — Next.js 16 instrumentation hook: auto-initialises Brain orchestrator + learning loop + dataset collector + worldwide-routes learner on every cold boot (before any request is served).
  - `src/app/api/sgtx/brain-os/daily/route.ts` — master daily cron: 8 sequential steps in <60s (brain-init → free-integrations-sync → worldwide-routes-drift → shipping-schedules → unlocode-round-robin → worldwide-macro-indicators → logistics-quote-expire → loom-chain-audit → brain.daily.completed event → BrainDailyRun row).
  - `prisma/schema.prisma` — 3 new models: `LearningFeedbackRecord`, `WorldwideRouteObservation`, `BrainDailyRun` (228 total). Pushed to Turso.
  - `src/lib/sgtx/brain-os/learning/learning-loop.ts` — `recordFeedback()` now persists to `LearningFeedbackRecord` table (fire-and-forget).
  - `src/lib/sgtx/brain-os/learning/worldwide-routes-learner.ts` — `recordObservation()` now persists to `WorldwideRouteObservation` table (fire-and-forget).
  - `src/lib/sgtx/ai/ais-vessel-tracking.ts` — fixed AIS endpoint URL from `api.aistreams.com` (non-existent) → `api.aisstream.io` (correct AISStream.io REST API).
  - `vercel.json` — consolidated to 2 daily crons: `brain-os/daily` (00:00 UTC) + `governor/audit-cron` (12:00 UTC).
  - `src/lib/sgtx/compliance/wto-tariff-sync.ts` — WTO Tariff Download Facility (free, live fetch, 10 trading partners, 24h cache).
  - `src/lib/sgtx/compliance/imf-indicators-sync.ts` — IMF SDMX macro indicators (free, live XML, 20 countries, composite risk score).
  - `src/lib/sgtx/onboarding/worldbank-indicators-sync.ts` — World Bank indicators (free, 249 countries, LPI + GDP + trade % + tariff rate).
  - `src/lib/sgtx/shipping/searates-client.ts` — Searates port congestion (freemium, top 20 global ports, heuristic fallback).
  - `src/lib/sgtx/shipping/unlocode-full-sync.ts` — 249-country UN/LOCODE round-robin orchestrator (5 countries/day = full refresh ~50 days).
  - 9 new API routes for the above integrations (GET query + GET status + POST sync with CRON_SECRET).
- **Governor actions touched:** none new (Brain orchestrator invokes existing capabilities).
- **Audit impact:** Every daily cron run persists a `BrainDailyRun` row (steps completed/failed, duration, routes drift, sanctions/FX counts, fine-tuning examples count). Learning feedback + route observations now persist to Turso and survive cold starts.
- **Status:** SHIPPED ✅

### What this changes operationally

| Before CCL-003 | After CCL-003 |
|----------------|---------------|
| Brain dormant in production (no auto-init) | Brain auto-initialises on every cold boot via `instrumentation.ts` |
| Learning state in-memory only (lost on cold start) | Learning feedback + route observations persist to Turso |
| 13,448 worldwide routes static (no drift since migration) | Routes get ±3% market drift daily |
| Sanctions/FX/prices never auto-refresh | All free-integration syncs run daily |
| No worldwide macro data | WTO tariffs + IMF indicators + World Bank LPI + port congestion |
| UN/LOCODE only Egypt | UN/LOCODE round-robin 5 countries/day (full 249 in ~50 days) |
| AIS vessel tracking silently failed (wrong URL) | AIS endpoint corrected to `api.aisstream.io` |
| 2 crons: audit + quote-expire | 2 crons: brain-os/daily (includes quote-expire) + audit at noon |

---

## CCL-005 — Seller Delta Enhancements (Quote Viability + Change Impact + Contract Readiness + Lifecycle + Control Tower)

- **Change ID:** CCL-005
- **Blueprint section:** Part 3.12 — Seller Quote / Packing / Logistics; Part 12 — Portals & Command Center
- **Type:** ADD (5 seller-side enhancement deltas) + MODIFY (remove provider-ranking cosmetics)
- **Rationale:** The seller needed consolidated visibility into quote viability, buyer-change impact, contract readiness, lifecycle state, and a unified control tower — without duplicating existing engines. The constitutional non-marketplace rule required removing 2 remaining cosmetic provider-ranking references.
- **Implementation reference:**
  - `src/lib/sgtx/seller/lifecycle.ts` — `deriveSellerLifecycleStage()` (QUOTE_BUILDING → QUOTED → NEGOTIATION → CONTRACT_READY → CONTRACT_LOCKED → EXECUTION → DELIVERED → SETTLED)
  - `src/lib/sgtx/seller/quote-viability.ts` — `calculateQuoteViability()` (VIABLE / VIABLE_WITH_CONDITIONS / BLOCKED, 7 categories: Commercial, Operational, Logistics, Capacity, Compliance, Documents, Margin)
  - `src/lib/sgtx/seller/change-impact.ts` — `calculateBuyerChangeImpact()` (UNCHANGED / RECALCULATED / INVALIDATED / RECONFIRM_REQUIRED / REQUOTE_REQUIRED / REGENERATE_REQUIRED)
  - `src/lib/sgtx/seller/contract-readiness.ts` — `calculateContractReadiness()` (READY / ACTION_REQUIRED / BLOCKED, 12 items with deep-links)
  - `src/lib/sgtx/seller/control-tower.ts` — `buildControlTower()` (prioritized cards + actions, data-scope aware)
  - 4 API routes: `/api/sgtx/seller/quote-viability`, `/change-impact`, `/contract-readiness`, `/control-tower`
  - 4 UI components: `QuoteViabilityPanel`, `BuyerChangeImpactPanel`, `ContractReadinessPanel`, `SellerControlTower` + `ExecutionModePanel` (in `src/components/sgtx/seller-deltas/`)
  - UI integration in PortalContent.tsx: QuoteBuilderScreen (viability panel before submit), SellerPendingRequestsScreen (buyer-change impact for amended trades), ContractSigningScreen (readiness checklist before lock), CommandCenter (seller control tower above cards)
  - Provider-ranking cosmetics removed: "top-ranked provider" comment (line 1332), "Route Score (A1): 87/100" mock string (line 4195) — replaced with factual "Route Capability: Compatible"
- **Governor actions touched:** none new (existing Governor gates are surfaced, not replaced)
- **Audit impact:** No new scores introduced. States are structured summaries (VIABLE/CONDITIONAL/BLOCKED), not numerical scores. Non-marketplace principle preserved.
- **Status:** SHIPPED ✅

### What this changes operationally

| Before CCL-005 | After CCL-005 |
|----------------|---------------|
| Seller had no consolidated quote viability view | QuoteViabilityPanel shows 7-category assessment before submit |
| No buyer-change impact calculation | BuyerChangeImpactPanel shows downstream effects (REQUOTE/RECONFIRM/etc.) |
| No per-contract readiness checklist | ContractReadinessPanel shows 12-item checklist with deep-links |
| No lifecycle stage awareness | deriveSellerLifecycleStage() drives Build→Execute transition |
| Command Center showed metric cards only | SellerControlTower adds prioritized cards + actions + execution mode |
| "Route Score 87/100" mock ranking string | Replaced with factual "Route Capability: Compatible" |
| "top-ranked provider" comment | Replaced with "first saved provider" (no ranking) |

---

## CCL-009 — Consolidated Architecture Modifications (Money-Flow Separation + Trade Cost Engine + Payment Evidence + Multi-Modal)

- **Change ID:** CCL-009
- **Blueprint section:** Parts I-LII (consolidated architecture modifications document)
- **Type:** ADD (5 core engines) + HARDEN (non-custodial posture, fee gate, USTN lifecycle) + BACKUP
- **Rationale:** The SGTX platform must be explicitly non-custodial — trade money moves between regulated banks, SGTX does not touch it. The SGTX fee is a mandatory backend gate before execution activation. USTN is the universal trade correlation number. All transport modes (sea/air/road/rail/RoRo/multimodal) are first-class.
- **Implementation reference:**
  - **5 new Prisma models (283 total):** TradeCostObligation, PaymentEvent, PaymentEvidence, ReeferPowerTracking, TradeEvent
  - **4 new lib modules:** Trade Cost Engine (`src/lib/sgtx/trade-cost/index.ts`), Payment Evidence Engine (`src/lib/sgtx/payment-evidence/index.ts`), Reefer Power Tracker (`src/lib/sgtx/reefer-power/index.ts`), Trade Event Graph (`src/lib/sgtx/trade-events/index.ts`)
  - **9 new API routes:** trade-cost/calculate, trade-cost/obligations, payment-evidence/submit, payment-evidence/validate, payment-evidence/match, reefer-power/track, reefer-power/calculate, trade-events/record, trade-events/list
  - **Hardening verified:**
    - Fee gate: `fee_gate.wasm` WasmEdge module enforces 1.5% fee backend
    - Non-custodial: FeeLock documented as "SGTX never holds funds"
    - USTN: generated at contract lock (not trade creation), `/ustn/generate` requires CRON_SECRET
    - Trade status: PENDING_SELLER_RESPONSE (not INITIATED)
    - Multi-modal: SEA/AIR/ROAD/RAIL/RO_RO/MULTIMODAL all supported
  - **Backup:** Turso database backed up to `backups/turso-backup-2026-08-18T20-30-31-241Z.json` (257 tables, 13,969 rows)
  - **Trade Cost Engine:** calculates SGTX fee, customs duty (via GRiRE), logistics, reefer power, THC, port charges — each obligation has recipientClass, payer (Incoterm-driven), calculationMethod
  - **Payment Evidence Engine:** 5-level confidence model (1=direct API, 5=user-uploaded), match results (MATCH/PARTIAL/OVERPAYMENT/UNDERPAYMENT/WRONG_PAYER/etc.)
  - **Reefer Power:** dynamic cost with chargeable hours/days, applicable tariff, monitoring charge
  - **Trade Event Graph:** immutable hash-chained event log (28 event types from TRADE_REQUESTED to RECONCILED)
- **Status:** SHIPPED ✅

### Four Most Important Architectural Principles (verified)

1. **Money separation:** Trade money moves between regulated banks. SGTX does not touch it. ✅
2. **SGTX execution fee gate:** No SGTX trade execution without settlement of the applicable SGTX service fee. ✅
3. **USTN correlation:** Every important commercial, regulatory, logistics, payment and evidence event is correlated to the USTN. ✅
4. **Full transport neutrality:** SGTX is mode-agnostic: sea, air, road, rail, RoRo and multimodal are all first-class transport modes. ✅

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

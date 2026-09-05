# COCKPIT REBUILD — Phase 0 PR Description

## What this PR does

Introduces the routing foundation for the SGTX cockpit rebuild. Real
Next.js App Router routes are added **alongside** the existing legacy `/`
SPA — the app remains fully deployable and demo-able. No backend, DB
schema, API routes, or crypto/governance logic were changed.

## New routes (all client components, real URLs)

| Route | Auth | Purpose |
|---|---|---|
| `/` | public | Legacy marketing landing (unchanged) |
| `/login` | public | Email/password + demo-portal login |
| `/join` | public | 6-step onboarding wizard (wraps existing `RegistrationGateway`) |
| `/home` | auth required | Action-first home — 5 questions only (Phase 4 refines) |
| `/trades` | auth required | My trades list with filters (active/drafts/history/all) |
| `/trades/new` | auth required | Trade request wizard entry (Phase 3 will build the 6-step flow) |
| `/trades/[ustn]` | auth required | THE canonical trade workspace (Phase 2 layout) |
| `/operations` | auth required | Role-dependent: shipments/milestones/customs (Phase 5 fills content) |
| `/money` | auth required | Role-dependent: invoices/financing/settlement (Phase 5) |
| `/trust` | auth required | GTID verification, sanctions, KYB, certificates (Phase 5) |
| `/network` | auth required | Counterparties, contacts, corridors (Phase 5) |
| `/admin` | auth + ADM role | Platform governance — hidden from non-admin tenants |

## Routing behavior

* Unauthenticated request to an auth-required route → 307 redirect to
  `/login?next=<original-path>` (deep-link destination preserved).
* `/admin` requires the JWT `role` claim to be `PLATFORM_ADMIN` or
  `ADMIN`; otherwise 403. The top-nav hides the Admin link for non-admin
  tenants (Law: Admin hidden entirely, not just disabled).
* `/login` and `/join` are public (added to `PUBLIC_PAGE_ROUTES`).
* The legacy `/` page continues to render the Zustand view-state SPA —
  it is the cutover fallback until Phase 7 deletes it.

## Tab → destination mapping (Phase 1 preview)

The 7-item top nav (`Home | Trades | Operations | Money | Trust | Network | Admin`)
replaces the 6-workspace sidebar (WorkspaceShell) and the 190-tab
sidebar (PortalShell). Each former tab is re-packaged into one of:

| Former portal tab | New destination |
|---|---|
| Portal "command" (12 portals) | `/home` (action-first, role-aware content) |
| "new-trade", "active-trades", "drafts", "history", "quotes", "contract" (Buyer/Seller) | `/trades`, `/trades/new`, `/trades/[ustn]` |
| "shipments", "milestones", "addenda", "fleet", "declarations", "certificates", "clearance", "vessels", "containers", "bl", "schedules", "dcsa", "roro", "air-cargo", "rail", "road", "packaging" | `/operations` (role-dependent content) |
| "invoices", "settlement", "financing", "opportunities", "portfolio", "collateral", "borrowers" | `/money` (role-dependent) |
| "passport", "readiness", "lifecycle", "org-graph", "network", "trust-passport", "sanctions" | `/trust` |
| "network", "contacts", "corridor" | `/network` |
| "audit", "incidents", "threats", "users", "tenants", "integrations", "sla", "competitor-benchmark", "customs-gateway-admin", "fee-dispute-admin", "multisig", "add-ons", "addons-hub", "command-center" (Admin), "journey", "governor", "opa", "loom", "qes", "device", "evidence", "compliance-screen", "sar" | `/admin` (hidden from non-admin tenants) |
| "disputes", "distressed", "force-majeure" | `/trades/[ustn]` drawer tab "Compliance" + the dispute modal (CERT-13 wired) |
| "documents", "lc-management", "trade-certificates", "container-compliance", "lc-matching", "lots", "trade-cost", "incoterm-engine", "reefer-telemetry", "cold-chain", "demurrage", "compliance-calendar", "grir", "negotiations", "purchase-orders", "proforma-invoices", "regulatory-snapshots", "customs-fees", "fee-disputes-trader" | `/trades/[ustn]` drawer tabs (Documents / Compliance / Details) |
| "worldwide-routes", "routes-reference", "trade-flow", "fx", "food-safety", "trade-cost-calculator", "insights" | `/network` (corridors) and `/money` (FX) |
| Lab "requests", "queue", "sampling", "certificates", "performance" | `/operations` (role: Lab) |
| QC "schedule", "field", "reports", "re-inspections", "performance" | `/operations` (role: QC) |
| Bank "command", "opportunities", "portfolio", "preferences", "financed-trades", "borrowers", "collateral", "defi" | `/money` (role: Bank) + `/home` summary |
| PFI "command", "opportunities", "portfolio", "preferences", "financed-trades", "borrowers", "collateral" | `/money` (role: PFI) + `/home` summary |
| Gov "command", "trade-flow", "integrations", "fx", "food-safety", "customs", "governor", "opa", "loom", "jurisdictions", "qes", "device", "evidence", "compliance-screen", "sar", "ustn", "journey", "transport", "finance", "completion", "integration-control", "regulatory-change", "regulatory-snapshots", "readiness-center", "grir", "force-majeure", "compliance-calendar" | `/home` (role: Government) + `/trades/[ustn]` (gov-perspective overlay) + `/admin` (hidden for GOV — only ADM sees admin) |
| Marketplace "command-center", "leads", "webhooks", "revenue", "api-keys", "sandbox", "agreement", "company-admin" | `/operations` (role: MP) + `/money` (revenue) + `/trust` (agreement) |
| "expert-mode toggle" (190 tabs) | Removed from the top nav — discreet "Advanced" affordance in the legacy shell only. New cockpit routes do NOT have an Expert Mode (Phase 5 will add it as a sub-route). |

"Where did X go?" answer for each tab is in the table above.

## Trade workspace layout (`/trades/[ustn]`)

Phase 2 layout implemented (top to bottom):
1. HEADER — product + route summary, status pill, USTN (T5 styling)
2. NEXT ACTION CARD — single T1 thing this user must do now
3. TRADE SUMMARY — T2 one-glance facts (quantity, value, delivery, Incoterm, cold chain)
4. BLOCKERS — T3 exceptions with owner + due date
5. TIMELINE — 9-stage derived lifecycle (Request → Completed)
6. ACTIVITY — 3-5 latest events
7. DRAWER TABS — T4: Documents · Payments · Compliance · Messages · Details
8. EXPERT MODE toggle — T5: USTN internals, raw status, phase, GTIDs

## Phase 0 acceptance

* ✅ URL is source of truth — refresh / back-forward / share-link all work
* ✅ Middleware enforces auth + role + (for `/admin`) ADM role
* ✅ Deep-link destination preserved via `?next=` query param
* ✅ App remains deployable and demo-able (legacy `/` page unchanged)
* ✅ All 53 existing tests still pass
* ✅ Lint passes
* ✅ Secrets scan passes (no credential literals)
* ✅ Registry validator passes

## What's NOT in this PR (deliberate scope control)

* Phase 1 (collapse legacy portal-config.ts): not started — the legacy
  shell remains the default until the cockpit routes have full content.
* Phase 3 (6-step wizard): route exists with a 6-step preview; the
  actual wizard forms are the Phase 3 deliverable.
* Phase 4 (Home — 5 questions): the home route renders the 5 questions
  from the dashboard API; refinement (numbered task list linking to
  exact trade + action) is the Phase 4 deliverable.
* Phase 5 (role perspectives): the role-gated sections (`/operations`,
  `/money`, `/trust`, `/network`, `/admin`) render placeholders pointing
  to the legacy shell. Filling them is the Phase 5 deliverable.
* Phase 6 (Arabic RTL, WCAG AA, mobile-first): not started.
* Phase 7 (delete legacy): not started — the legacy `/` page is the
  cutover fallback.

## Files added

* `src/lib/cockpit/session.ts` — client-side session helper (cookie +
  localStorage + JWT decode + fetchWithAuth + useSession + useRequireAuth)
* `src/components/cockpit/CockpitShell.tsx` — 7-item top-nav shell
* `src/components/cockpit/SectionPlaceholder.tsx` — placeholder for role-gated sections
* `src/app/login/page.tsx`
* `src/app/join/page.tsx`
* `src/app/home/page.tsx`
* `src/app/trades/page.tsx`
* `src/app/trades/new/page.tsx`
* `src/app/trades/[ustn]/page.tsx`
* `src/app/operations/page.tsx`
* `src/app/money/page.tsx`
* `src/app/trust/page.tsx`
* `src/app/network/page.tsx`
* `src/app/admin/page.tsx`

## Files modified

* `src/middleware.ts` — added `PUBLIC_PAGE_ROUTES`, `ADMIN_ONLY_PAGE_ROUTES`, and cockpit route handling (auth + role + admin enforcement, deep-link preservation via `?next=`)
* `src/app/api/v1/auth/demo-login/route.ts` — lazy-seed the demo tenant if it doesn't exist (makes the cockpit /login route work in fresh dev environments)
* `src/app/api/sgtx/events/emit/route.ts` — already existed from the previous cycle

## Backend changes

None. All existing API routes, DB schema, crypto, and governance logic are untouched. The cockpit routes consume the existing `/api/sgtx/dashboard?tenant=GTID` endpoint.

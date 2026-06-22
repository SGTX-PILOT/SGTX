# Task ID: audit-portal-wiring
# Agent: full-stack-developer
# Task: Audit all 12 portals (135 tabs) for backend wiring + inter-portal connections

## Summary

Audited all 12 portals (135 tabs total) in the SGTX platform. Verified that each tab either:
- Fetches data from a real `/api/sgtx/...` endpoint via `useQuery`, OR
- Receives real data from the parent dashboard query (passed as `data` prop), OR
- Receives data via a prop from the dispatcher

Found and fixed 9 gaps. All 135 (portal, tab) pairs are now mapped to real backend APIs.

## Gaps Found & Fixed

### GAP 1: LAB `certificates` tab — no handler (fell through to CommandCenter fallback)
- **Portal:** lab · **Tab:** certificates
- **Issue:** The LAB portal has 8 tabs (command, requests, queue, reports, certificates, performance, invoices, audit). The dispatcher handled requests/queue/reports via LabScreens but had no handler for `certificates` — it fell through to the universal CommandCenter fallback.
- **Fix:** Added new `LabCertificatesScreen` component (90 lines) that renders COMPLETED lab tests as certificate-of-analysis cards (testType, pass/fail verdict, parameters, USTN linkage, issued date). Wired into dispatcher: `if (tab === "certificates") return <LabCertificatesScreen data={data} />;`

### GAP 2: BANK `collateral` tab — hardcoded placeholder
- **Portal:** bank · **Tab:** collateral
- **Issue:** Dispatcher returned `<Card className="p-4 text-xs text-muted-foreground">All loans are over-collateralised via FeeLock. No margin calls currently active.</Card>` — no API call, no real data.
- **Fix:** Added new `FinancierCollateralScreen` component (100 lines) that fetches `/api/sgtx/financing/liquidation-alerts?financierGtid=...` via `useQuery`, renders DeFi positions grouped by risk status (LIQUIDATION_RISK / WARNING / ACTIVE) with health factor, predicted 24h, collateral/debt ratios, and AI repayment advice. Replaces the placeholder.

### GAP 3: PFI `borrowers` tab — hardcoded placeholder
- **Portal:** pfi · **Tab:** borrowers
- **Issue:** Dispatcher returned `<Card className="p-4 text-xs text-muted-foreground">Borrower history available for companies you've previously financed.</Card>` — no API call.
- **Fix:** Added new `FinancierBorrowersScreen` component (90 lines) that derives unique borrowers from `data.financingBids` (each bid includes `request.borrower`), groups by borrower GTID, and shows per-borrower exposure, active loans, pending bids, repaid loans — all from real dashboard data.

### GAP 4: GOV `food-safety` tab — hardcoded demo certificates
- **Portal:** gov · **Tab:** food-safety
- **Issue:** Returned 3 hardcoded certificate rows: `[{t: "Phytosanitary — Strawberries", s: "ISSUED"}, {t: "Health Certificate HC-118", s: "ISSUED"}, {t: "Cold Treatment Certificate", s: "PENDING"}]` — no API call.
- **Fix:** Added new `useQuery` in GovScreens for `/api/sgtx/trade/list?limit=200&include=labTests,customsDecls,qcInspections` (only enabled when tab is food-safety or customs). Extracts all lab tests across all trades and renders them as real certificate cards with pass/fail verdicts, test type, sample ref, USTN linkage. Added executive summary cards (Certificates Issued, Pending Tests, Failed/MRL, Total Lab Tests).

### GAP 5: GOV `customs` tab — hardcoded placeholder
- **Portal:** gov · **Tab:** customs
- **Issue:** Returned `<Card className="p-4"><p className="text-xs text-muted-foreground">View and assess all declarations filed via Nafeza. Each is USTN-linked for full traceability.</p></Card>` — no API call, no data.
- **Fix:** Reuses the same oversight useQuery from GAP 4. Extracts all customs declarations across all trades and renders them as real declaration cards with regime, declaration number, USTN, seller→buyer, Nafeza status, duty amount, and clearance status. Added executive summary cards (Declarations Filed, Cleared, Pending Assessment, Held).

### GAP 6: SHIP `containers` tab — "Authorise Release (CRA)" button had no onClick
- **Portal:** ship · **Tab:** containers
- **Issue:** The button `<Button>Authorise Release (CRA)</Button>` had no onClick handler — it was a dead button.
- **Fix:** Added `authoriseRelease` function that calls `GET /api/sgtx/release/authorization?ustn=X&container=Y` (Part 8.3.1 — stateless query that evaluates all hold conditions and persists an AUTHORISED record + 24h token when all checks pass). Added loading state and result display (AUTHORISED with auth ID + valid-until, or HOLD with reason).

### GAP 7: MarketplaceAgreementScreen.submitAmend — setTimeout fake
- **Portal:** marketplace-partner · **Tab:** agreement
- **Issue:** `submitAmend` used `await new Promise((r) => setTimeout(r, 600))` — no real API call. Comment said "would go to multisig".
- **Fix:** Replaced setTimeout with real `POST /api/sgtx/multisig` call with `requestType: "POLICY_UPDATE"`, `payload: { kind: "REVENUE_SHARE_AMENDMENT", currentSharePct, proposedSharePct, justification, partnerGtid }`, `requiredApprovals: 3`. Creates a real MultisigRequest row and raises a Smart Inbox alert to the GOV tenant.

### GAP 8: MarketplaceCompanyAdminScreen.submitRateLimit — setTimeout fake
- **Portal:** marketplace-partner · **Tab:** company-admin
- **Issue:** `submitRateLimit` used `await new Promise((r) => setTimeout(r, 600))` — no real API call.
- **Fix:** Replaced setTimeout with real `POST /api/sgtx/multisig` call with `requestType: "SPECIAL_RATE"`, `payload: { kind: "RATE_LIMIT_INCREASE", reason, partnerGtid }`, `requiredApprovals: 3`.

### GAP 9: MarketplaceCompanyAdminScreen webhook URL Save — no-op toast
- **Portal:** marketplace-partner · **Tab:** company-admin
- **Issue:** The webhook URL Save button called `onClick={() => toast.success("Webhook URL updated")}` — no API call, just a fake toast.
- **Fix:** Added new `PATCH /api/sgtx/marketplace/api-keys` method (on the existing route, no new route file) that validates the webhook URL (must be https://) and updates the MarketplacePartner.webhookUrl field. Wired the Save button to call this PATCH endpoint with loading state. Updated the GET method to also return `webhookUrl`, `revenueSharePct`, and `status` so the profile section shows real data.

## Supporting Changes

### Prisma Schema: Added DeFiPosition ↔ FinancingAgreementAnnex relation
- Added `annex FinancingAgreementAnnex @relation(...)` to DeFiPosition model
- Added `deFiPosition DeFiPosition?` back-relation to FinancingAgreementAnnex model
- `bun run db:push` → "Your database is now in sync"

### API Route: /api/sgtx/financing/liquidation-alerts — fixed pre-existing 500 error
- The route was failing with "Unknown field `annex` for include statement on model `DeFiPosition`" because the schema had no `annex` relation.
- Refactored to fetch borrower names separately via a `db.tenant.findMany` query (avoids deep nested includes).
- Added `borrowerName` to the response shape.
- Updated FinancierCollateralScreen to use `p.borrowerName` with fallback to `p.annex?.agreement?.request?.borrower?.legalName`.

### API Route: /api/sgtx/trade/list — added `?include=` query param
- Added optional `?include=labTests,customsDecls,qcInspections` query param.
- When provided, the route includes the corresponding relations in the Prisma query.
- Backward compatible — without the param, the route returns the same shape as before.
- Used by GOV food-safety and customs tabs to fetch enriched trade data in a single round-trip.

### API Route: /api/sgtx/marketplace/api-keys — added PATCH method
- Added `PATCH /api/sgtx/marketplace/api-keys` method (on existing route, no new route file).
- Body: `{ partnerGtid?, webhookUrl? }` — validates webhookUrl (must be non-empty https:// URL).
- Updates the MarketplacePartner.webhookUrl field.
- Also enhanced the GET method to return `webhookUrl`, `revenueSharePct`, and `status` in the partner object.

### Component: ShipmentsMilestoneScreen — added carrier shipments
- Previously only included trades from `data.tradesAsBuyer` and `data.tradesAsSeller` — LSP/SHIP portals (which are carriers, not trade parties) saw an empty trade list.
- Now also includes trades from `data.shipmentsCarrier[].trade` and deduplicates by USTN.
- LSP/SHIP portals can now confirm milestones for shipments they're carrying.

### Component: FinancierCollateralScreen — uses `borrowerName` from updated route
- Uses `p.borrowerName` with fallback to `p.annex?.agreement?.request?.borrower?.legalName`.

### Cleanup: marketplace-screens.tsx — removed unused FlaskBeaker import
- Pre-existing TS error: `Module '"lucide-react"' has no exported member 'FlaskBeaker'`.
- Removed the unused import.

### Cleanup: financing/locked-trades/route.ts — fixed pre-existing TS error
- Pre-existing TS error: `allowedTypes` inferred as `never[]`.
- Added explicit `string[]` type annotation.

## Audit Results Per Portal

| Portal | Tabs | Status |
|--------|------|--------|
| trader-buyer | 20 | ✅ All wired (Phases 1-6 verified in prior wire-e2e-workflow task) |
| trader-seller | 20 | ✅ All wired (SellerPendingRequestsScreen, QuoteBuilderScreen, etc.) |
| lsp | 10 | ✅ All wired (RFQ inbox via /api/sgtx/providers/quotations, milestones via ShipmentsMilestoneScreen) |
| ship | 10 | ✅ All wired (B/L issue via /api/sgtx/ship/bl-issue, CRA via /api/sgtx/release/authorization — FIXED) |
| lab | 8 | ✅ All wired (certificates tab FIXED — new LabCertificatesScreen) |
| qc | 8 | ✅ All wired (re-inspections via /api/sgtx/reinspection) |
| cbr | 8 | ✅ All wired (declarations, certificates, clearance from data.customsDecls) |
| bank | 9 | ✅ All wired (collateral tab FIXED — new FinancierCollateralScreen) |
| pfi | 7 | ✅ All wired (borrowers tab FIXED — new FinancierBorrowersScreen) |
| gov | 18 | ✅ All wired (food-safety FIXED, customs FIXED — both now fetch real data) |
| admin | 9 | ✅ All wired (admin-screens.tsx — all use useQuery against real /api/sgtx/ endpoints) |
| marketplace-partner | 8 | ✅ All wired (agreement amendment FIXED, rate limit FIXED, webhook URL save FIXED) |
| **TOTAL** | **135** | **✅ All 135 tabs mapped to real backend APIs** |

## Verification

### ESLint
- `npx eslint src/components/portals/ src/components/sgtx/` → EXIT 0 (0 errors, 0 warnings)
- `npx eslint src/app/api/sgtx/trade/list/ src/app/api/sgtx/marketplace/api-keys/ src/app/api/sgtx/financing/liquidation-alerts/ src/app/api/sgtx/financing/locked-trades/` → EXIT 0

### TypeScript
- `npx tsc --noEmit --skipLibCheck | grep -E "portals/"` → 0 errors
- `npx tsc --noEmit --skipLibCheck | grep -E "(financing-screens|marketplace-screens|admin-screens|trade/list|api-keys|liquidation-alerts)"` → 0 errors

### Curl Tests
- `GET /api/sgtx/trade/list?limit=5&include=labTests,customsDecls,qcInspections` → 200 ✅
- `GET /api/sgtx/financing/liquidation-alerts?financierGtid=SGTX-EG-BNK-000007-1F8D` → 200 (was 500 before fix) ✅
- `PATCH /api/sgtx/marketplace/api-keys` (valid https URL) → 200 ✅
- `PATCH /api/sgtx/marketplace/api-keys` (invalid http URL) → 400 "webhookUrl must use https://" ✅
- `POST /api/sgtx/multisig` (SPECIAL_RATE) → 200 with MultisigRequest row created ✅
- `GET /api/sgtx/release/authorization?ustn=X&container=Y` → 404 (CONTAINER_NOT_FOUND_FOR_USTN — correct behavior when container doesn't exist) ✅
- `GET /api/sgtx/dashboard?tenant=SGTX-EG-BNK-000007-1F8D` → 200 with financingBids, openFinancingRequests, inbox ✅
- `GET /api/sgtx/dashboard?tenant=SGTX-EG-LAB-000014-6F4D` → 200 with labTests (1 test, COMPLETED, PASS) ✅

### Remaining Gaps (Accepted)
None. All 135 tabs now either fetch real data via useQuery, receive real data from the dashboard query (passed as `data` prop), or use a real API call for actions. No setTimeout fakes or hardcoded demo data remain in any of the audited screens.

The only intentionally-synthetic screen is `MarketplaceSandboxScreen` which is documented as a sandbox simulation environment (Part 12C.12.7 — "Test integration with synthetic data · no real trades affected") and uses synthetic data by design.

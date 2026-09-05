# SGTX Portal Certification Matrix — AUDIT-2

**Audit Date:** 2025 (research-only, no code changes)
**Auditor Task ID:** AUDIT-2
**Source Files:**
- `src/lib/sgtx/portal-config.ts` (514 lines — canonical portal registry)
- `src/components/portals/PortalContent.tsx` (11 149 lines — single dispatcher)
- `src/lib/sgtx/dispute/index.ts` (dispute lifecycle lib)
- `src/app/api/sgtx/disputes/{file,mediation,trigger}/route.ts`
- `src/components/sgtx/dispute-screens.tsx` (dead-code module)
- `src/components/sgtx/FeeDisputeScreens.tsx` (fee-dispute UI)
- `prisma/schema.prisma` (lines 477–507 — `Dispute` model)

---

## Summary Verdict

| Metric | Count |
|---|---|
| Portals registered | 12 ✅ |
| Tabs registered (portal-config.ts) | 204 |
| Tabs with a real dispatcher match | 204 ✅ |
| Tabs that fall through to the silent fallback (`<CommandCenter>`, PortalContent.tsx:10010) | 0 ⚠️ |
| Tabs registered but with no matching screen | 0 |
| Tabs rendered as static placeholder cards (not the fallback, but no real data) | 2 (bank `borrowers`, `collateral`) |
| **File-Dispute button dead in trader-facing UI** | **3 instances** (DisputesScreen, TraderDisputeScreen, FeeDisputesScreen) |
| Server-side auth/permission gate on any portal | 0 — every portal is rendered purely on client-side state (`useAppStore.activePortalId`) |

**Headline finding:** All 204 tabs RESOLVE to a non-fallback screen, but the platform has **zero server-side permission enforcement** — any visitor can pick any of the 12 portals via the launcher and view its data. Additionally, the **dispute-filing workflow is a dead button** on the user-facing UIs (full evidence below).

---

## Global Caveats (apply to every row below)

1. **No server-side authn/authz.** The only "permission" is the user's choice of `activePortalId` in the Zustand store (`src/store/app-store.ts:12,77`). `WorkspaceShell` → `PortalContent` simply renders whatever portal object the client passes in. There is no JWT, session, role check, or GTID-binding at the page boundary.
2. **Default tenant GTIDs are hardcoded** in `portal-config.ts` for the demo, so each portal always boots against a known seed tenant even before any real user logs in.
3. **Primary data source** for most tabs is the dashboard aggregator `GET /api/sgtx/dashboard?tenant=<GTID>` (called once per portal mount in `PortalShell` / `WorkspaceShell`). Tab-specific endpoints are listed in the "API Dependency" column where applicable. `DASH` = dashboard aggregator only.
4. **Fallback path** (PortalContent.tsx:10010) `return <CommandCenter portal={portal} data={data} />;` is reached only when a tab id is registered but no `if (tab === …)` branch matches. Audit confirms **no tab is currently in this state**, but the fallback exists as a silent safety net — meaning future tab additions that forget to wire a screen will silently render the Command Center with no error.

---

## Certification Matrix

Legend:
- **Screen Resolves** = YES if the dispatcher returns a non-fallback React node, NO if it falls through.
- **Status** = ✅ RESOLVES (renders a real screen) · ⚠️ FALLBACK (silent `<CommandCenter>`) · ❌ MISSING (tab registered, no branch) · 🔒 UNAUTHORIZED (no permission gate found).
- Because there is no permission gate on any portal, **every row technically matches the 🔒 UNAUTHORIZED criterion**. To keep the table readable, Status reflects the *screen resolution* outcome and the security caveat is recorded once globally and re-flagged in Notes for sensitive tabs.

### Portal 1 — Trader Buyer (`trader-buyer`)
- **Workspace:** Trader Portal — Buyer
- **Default Tenant GTID:** `SGTX-DE-TRD-001234-5B6C`
- **Declared role / tenant type:** Importer · TRD
- **Tabs:** 35

| Tab | Permission | API Dependency | Screen Resolves | Status | Notes |
|---|---|---|---|---|---|
| command | Importer·TRD (declared, no enforcement) | DASH | YES | ✅ RESOLVES | Universal handler L9727 |
| new-trade | Importer·TRD | `/api/sgtx/trade-request` (POST/GET), `/api/sgtx/ai/*` (HS-code, incoterm, governor-prescreen), `/api/sgtx/criticality/rules`, `/api/sgtx/trade-request/readiness` | YES | ✅ RESOLVES | `NewTradeRequestScreen` L1308 → dispatcher L9810 |
| active-trades | Importer·TRD | `/api/sgtx/trade-request?buyerGtid=` | YES | ✅ RESOLVES | `BuyerActiveTradesScreen` L10166 → dispatcher L9812 |
| drafts | Importer·TRD | `/api/sgtx/trade-request?buyerGtid=` | YES | ✅ RESOLVES | `BuyerDraftsScreen` L10196 → dispatcher L9813 |
| history | Importer·TRD | `/api/sgtx/trade-request?buyerGtid=` | YES | ✅ RESOLVES | `BuyerHistoryScreen` L10209 → dispatcher L9814 |
| quotes | Importer·TRD | DASH | YES | ✅ RESOLVES | `QuoteReviewScreen` L5190 → dispatcher L9815 |
| contract | Importer·TRD | `/api/sgtx/contract/{lock,sign}`, `/api/sgtx/payment/pay`, `/api/sgtx/contract/customs-broker-assign` | YES | ✅ RESOLVES | `ContractSigningScreen` L6434 → dispatcher L9816 |
| shipments | Importer·TRD | DASH | YES | ✅ RESOLVES | Universal L9730 → `ShipmentsVault` |
| container-compliance | Importer·TRD | `/api/sgtx/containers/*` | YES | ✅ RESOLVES | `ContainerCompliancePanel` L9766 |
| milestones | Importer·TRD | `/api/sgtx/milestones?ustn=`, `/api/sgtx/milestone/confirm` | YES | ✅ RESOLVES | Universal L9735 (guard `!== "lsp"`) |
| reefer-telemetry | Importer·TRD | `/api/sgtx/shipments/reefer/*` | YES | ✅ RESOLVES | `ReeferTelemetryPanel` L9780 |
| documents | Importer·TRD | DASH (documents list) | YES | ✅ RESOLVES | Universal L9731 → `DocumentsList` |
| distressed | Importer·TRD | `/api/sgtx/distressed/listings` | YES | ✅ RESOLVES | Universal L9741 → `DistressedCargoScreen` L7509 |
| routes-reference | Importer·TRD | (static reference data) | YES | ✅ RESOLVES | Universal L9729 → `PortPairReference` |
| demurrage | Importer·TRD | `/api/sgtx/addons/demurrage/*` | YES | ✅ RESOLVES | `DemurragePanel` L9820 |
| cold-chain | Importer·TRD | `/api/sgtx/cold-chain/*` | YES | ✅ RESOLVES | `ColdChainPanel` L9821 |
| negotiations | Importer·TRD | `/api/sgtx/orders/purchase-order` | YES | ✅ RESOLVES | `NegotiationsScreen` L9824 |
| purchase-orders | Importer·TRD | `/api/sgtx/orders/purchase-order` | YES | ✅ RESOLVES | `PurchaseOrdersScreen` L9825 |
| proforma-invoices | Importer·TRD | `/api/sgtx/proforma` | YES | ✅ RESOLVES | `ProformaInvoicesScreen` L9826 |
| financing | Importer·TRD (Borrower) | `/api/sgtx/financing/*` | YES | ✅ RESOLVES | `FinancingBorrowerScreen` L9817 |
| invoices | Importer·TRD | DASH (`data.invoices`) | YES | ✅ RESOLVES | Universal L9732 → `InvoicesList` |
| settlement | Importer·TRD | `/api/sgtx/settlement/approve`, `/api/sgtx/workflow/advance` | YES | ✅ RESOLVES | Universal L9736 → `SettlementScreen` L7360 |
| disputes | Importer·TRD | DASH (`data.disputes`), `/api/sgtx/disputes/mediation`, `/api/sgtx/ai/dispute-root-cause` | YES | ✅ RESOLVES | `DisputesScreen` L8114 — **"File Dispute" button has NO onClick handler (dead)**. See Dispute Workflow Verdict. |
| compliance | Importer·TRD | `/api/sgtx/compliance/list?tenant=` | YES | ✅ RESOLVES | Universal L9739 → `ComplianceScreen` L8242 |
| audit | Importer·TRD | DASH | YES | ✅ RESOLVES | Universal L9737 (guard `!== "admin"`) → `AuditScreen` L8282 |
| network | Importer·TRD | `/api/sgtx/contacts` | YES | ✅ RESOLVES | Universal L9742 → `NetworkScreen` |
| passport | Importer·TRD | `/api/sgtx/tenants/<GTID>` | YES | ✅ RESOLVES | Universal L9746 → `TrustPassportScreen` |
| readiness | Importer·TRD | `/api/sgtx/readiness?tenant=` | YES | ✅ RESOLVES | Universal L9743 → `ReadinessScreen` |
| compliance-calendar | Importer·TRD | `/api/sgtx/compliance-calendar/*` | YES | ✅ RESOLVES | `ComplianceCalendarPanel` L9822 |
| customs-fees | Importer·TRD | `/api/sgtx/customs-gateway/fee-observability` | YES | ✅ RESOLVES | `TraderFeeViewScreen` L9831 |
| fee-disputes-trader | Importer·TRD | `/api/sgtx/customs-gateway/fee-observability` | YES | ✅ RESOLVES | `TraderDisputeScreen` L9832 — **"File Dispute" button has NO onClick handler (dead)** (FeeDisputeScreens.tsx:678) |
| lifecycle | Importer·TRD | `/api/sgtx/lifecycle/*` | YES | ✅ RESOLVES | Universal L9744 → `LifecycleScreen` |
| org-graph | Importer·TRD | `/api/sgtx/tenants/<GTID>/org` | YES | ✅ RESOLVES | Universal L9745 → `OrgGraphScreen` |
| chat | Importer·TRD | `/api/sgtx/chat` | YES | ✅ RESOLVES | Universal L9747 → `GtidChatScreen` |
| admin | Importer·TRD (company-admin) | `/api/sgtx/tenants/<GTID>` | YES | ✅ RESOLVES | Universal L9738 → `CompanyAdminScreen` L8320 |

### Portal 2 — Trader Seller (`trader-seller`)
- **Workspace:** Trader Portal — Seller
- **Default Tenant GTID:** `SGTX-EG-TRD-002139-7F3A`
- **Declared role / tenant type:** Exporter · TRD
- **Tabs:** 30

| Tab | Permission | API Dependency | Screen Resolves | Status | Notes |
|---|---|---|---|---|---|
| command | Exporter·TRD | DASH | YES | ✅ RESOLVES | Universal L9727 |
| requests | Exporter·TRD | `/api/sgtx/trade-request?sellerGtid=` | YES | ✅ RESOLVES | `SellerPendingRequestsScreen` L4979 → dispatcher L9837 |
| quote-builder | Exporter·TRD | `/api/sgtx/quote/submit`, `/api/sgtx/ai/*` (price-band, eco-packaging, alt-ports), `/api/sgtx/ship-quote/*` | YES | ✅ RESOLVES | `QuoteBuilderScreen` L4226 → dispatcher L9838 |
| contract | Exporter·TRD | `/api/sgtx/contract/{lock,sign}`, `/api/sgtx/payment/pay` | YES | ✅ RESOLVES | `ContractSigningScreen` L9839 |
| shipments | Exporter·TRD | DASH | YES | ✅ RESOLVES | Universal L9730 |
| container-compliance | Exporter·TRD | `/api/sgtx/containers/*` | YES | ✅ RESOLVES | L9766 |
| milestones | Exporter·TRD | `/api/sgtx/milestones?ustn=` | YES | ✅ RESOLVES | Universal L9735 |
| documents | Exporter·TRD | DASH | YES | ✅ RESOLVES | Universal L9731 |
| distressed | Exporter·TRD | `/api/sgtx/distressed/listings?sellerGtid=` | YES | ✅ RESOLVES | Universal L9741 |
| routes-reference | Exporter·TRD | (static) | YES | ✅ RESOLVES | Universal L9729 |
| lot-management | Exporter·TRD | `/api/sgtx/lots/*` | YES | ✅ RESOLVES | `LotManagementPanel` L9788 |
| packaging | Exporter·TRD | `/api/sgtx/packaging/*` | YES | ✅ RESOLVES | `PackagingScreen` L9797 |
| demurrage | Exporter·TRD | `/api/sgtx/addons/demurrage/*` | YES | ✅ RESOLVES | `DemurragePanel` L9843 |
| cold-chain | Exporter·TRD | `/api/sgtx/cold-chain/*` | YES | ✅ RESOLVES | `ColdChainPanel` L9844 |
| negotiations | Exporter·TRD | `/api/sgtx/orders/sales-order` | YES | ✅ RESOLVES | `NegotiationsScreen` L9846 |
| sales-orders | Exporter·TRD | `/api/sgtx/orders/sales-order` | YES | ✅ RESOLVES | `SalesOrdersScreen` L9847 |
| proforma-invoices | Exporter·TRD | `/api/sgtx/proforma` | YES | ✅ RESOLVES | `ProformaInvoicesScreen` L9848 |
| financing | Exporter·TRD (Borrower) | `/api/sgtx/financing/*` | YES | ✅ RESOLVES | `FinancingBorrowerScreen` L9840 |
| invoices | Exporter·TRD | DASH | YES | ✅ RESOLVES | Universal L9732 |
| settlement | Exporter·TRD | `/api/sgtx/settlement/approve` | YES | ✅ RESOLVES | Universal L9736 |
| disputes | Exporter·TRD | DASH, `/api/sgtx/disputes/mediation`, `/api/sgtx/ai/dispute-root-cause` | YES | ✅ RESOLVES | Same `DisputesScreen` — File Dispute button is dead (see verdict) |
| compliance | Exporter·TRD | `/api/sgtx/compliance/list` | YES | ✅ RESOLVES | Universal L9739 |
| audit | Exporter·TRD | DASH | YES | ✅ RESOLVES | Universal L9737 |
| network | Exporter·TRD | `/api/sgtx/contacts` | YES | ✅ RESOLVES | Universal L9742 |
| readiness | Exporter·TRD | `/api/sgtx/readiness?tenant=` | YES | ✅ RESOLVES | Universal L9743 |
| lifecycle | Exporter·TRD | `/api/sgtx/lifecycle/*` | YES | ✅ RESOLVES | Universal L9744 |
| org-graph | Exporter·TRD | `/api/sgtx/tenants/<GTID>/org` | YES | ✅ RESOLVES | Universal L9745 |
| passport | Exporter·TRD | `/api/sgtx/tenants/<GTID>` | YES | ✅ RESOLVES | Universal L9746 |
| chat | Exporter·TRD | `/api/sgtx/chat` | YES | ✅ RESOLVES | Universal L9747 |
| admin | Exporter·TRD | `/api/sgtx/tenants/<GTID>` | YES | ✅ RESOLVES | Universal L9738 |

### Portal 3 — Logistics Service Provider (`lsp`)
- **Workspace:** Logistics Service Provider
- **Default Tenant GTID:** `SGTX-EG-LSP-000120-4C7D`
- **Declared role / tenant type:** Logistics · LSP
- **Tabs:** 13

| Tab | Permission | API Dependency | Screen Resolves | Status | Notes |
|---|---|---|---|---|---|
| command | Logistics·LSP | DASH | YES | ✅ RESOLVES | Universal L9727 |
| assignments | Logistics·LSP | DASH (`data.shipmentsCarrier`) | YES | ✅ RESOLVES | `LspScreens(tab=assignments)` L9319 → dispatcher L9853 |
| dispatch-planner | Logistics·LSP | `/api/sgtx/dispatch/*` | YES | ✅ RESOLVES | `DispatchPlannerScreen` L9854 |
| warehouse | Logistics·LSP | `/api/sgtx/warehouse/*` | YES | ✅ RESOLVES | `WarehouseDashboardScreen` L9855 |
| milestones | Logistics·LSP | `/api/sgtx/milestones?ustn=`, `/api/sgtx/milestone/confirm` | YES | ✅ RESOLVES | Bypasses universal guard (L9735 `!== "lsp"`) → handled by `LspScreens(tab=milestones)` L9853 |
| addenda | Logistics·LSP | `/api/sgtx/logistics-addenda/*` | YES | ✅ RESOLVES | `LspScreens(tab=addenda)` L9853 |
| rail | Logistics·LSP | `/api/sgtx/rail/*` | YES | ✅ RESOLVES | `RailScreen` L9864 |
| worldwide-routes | Logistics·LSP | (static routes data) | YES | ✅ RESOLVES | Universal L9728 |
| fleet | Logistics·LSP | `/api/sgtx/fleet/*` | YES | ✅ RESOLVES | `LspScreens(tab=fleet)` L9853 |
| road-corridor | Logistics·LSP | `/api/sgtx/corridor/*` | YES | ✅ RESOLVES | `RoadCorridorScreen` L9859 |
| performance | Logistics·LSP | `/api/sgtx/providers/performance?gtid=` | YES | ✅ RESOLVES | `ProviderPerformanceScreen` L9856 |
| invoices | Logistics·LSP | DASH | YES | ✅ RESOLVES | Universal L9732 |
| audit | Logistics·LSP | DASH | YES | ✅ RESOLVES | Universal L9737 |

### Portal 4 — Shipping Line (`ship`)
- **Workspace:** Shipping Line
- **Default Tenant GTID:** `SGTX-EG-SHP-000031-9E8F`
- **Declared role / tenant type:** Carrier · SHP
- **Tabs:** 15

| Tab | Permission | API Dependency | Screen Resolves | Status | Notes |
|---|---|---|---|---|---|
| command | Carrier·SHP | DASH | YES | ✅ RESOLVES | Universal L9727 |
| vessels | Carrier·SHP | `/api/sgtx/vessels/*` | YES | ✅ RESOLVES | `ShipScreens(tab=vessels)` L8989 → dispatcher L9869 |
| containers | Carrier·SHP | `/api/sgtx/containers/*` | YES | ✅ RESOLVES | `ShipScreens(tab=containers)` L9869 |
| booking-requests | Carrier·SHP | `/api/sgtx/ship-quote/request` | YES | ✅ RESOLVES | `BookingRequestsScreen` L9870 |
| bl | Carrier·SHP | `/api/sgtx/blade/*` | YES | ✅ RESOLVES | `ShipScreens(tab=bl)` L9869 |
| schedules | Carrier·SHP | `/api/sgtx/schedules/*` | YES | ✅ RESOLVES | `ShipScreens(tab=schedules)` L9869 |
| reefer-telemetry | Carrier·SHP | `/api/sgtx/shipments/reefer/*` | YES | ✅ RESOLVES | Universal trade-UI L9780 |
| dcsa | Carrier·SHP | `/api/sgtx/dcsa/*` | YES | ✅ RESOLVES | `DcsaComplianceScreen` L9876 |
| air-cargo | Carrier·SHP | `/api/sgtx/air-cargo/*` | YES | ✅ RESOLVES | `AirCargoScreen` L9880 |
| roro | Carrier·SHP | `/api/sgtx/roro/*` | YES | ✅ RESOLVES | `RoRoScreen` L9885 |
| worldwide-routes | Carrier·SHP | (static) | YES | ✅ RESOLVES | Universal L9728 |
| contract-rates | Carrier·SHP | `/api/sgtx/contract-rates/*` | YES | ✅ RESOLVES | `ContractRateManagerScreen` L9871 |
| performance | Carrier·SHP | `/api/sgtx/providers/performance?gtid=` | YES | ✅ RESOLVES | `ProviderPerformanceScreen` L9872 |
| invoices | Carrier·SHP | DASH | YES | ✅ RESOLVES | Universal L9732 |
| audit | Carrier·SHP | DASH | YES | ✅ RESOLVES | Universal L9737 |

### Portal 5 — Laboratory (`lab`)
- **Workspace:** Laboratory
- **Default Tenant GTID:** `SGTX-EG-LAB-000014-6F4D`
- **Declared role / tenant type:** Laboratory · LAB
- **Tabs:** 8

| Tab | Permission | API Dependency | Screen Resolves | Status | Notes |
|---|---|---|---|---|---|
| command | Lab·LAB | DASH | YES | ✅ RESOLVES | Universal L9727 |
| requests | Lab·LAB | `/api/sgtx/lab-tests/*` | YES | ✅ RESOLVES | `LabScreens(tab=requests)` L8486 → dispatcher L9890 |
| queue | Lab·LAB | `/api/sgtx/lab-tests/queue` | YES | ✅ RESOLVES | `LabScreens(tab=queue)` L9890 |
| reports | Lab·LAB | `/api/sgtx/lab-tests/<id>/upload-results` | YES | ✅ RESOLVES | `LabScreens(tab=reports)` L9890 |
| certificates | Lab·LAB | `/api/sgtx/certificates/*` | YES | ✅ RESOLVES | `LabScreens(tab=certificates)` L9890 |
| performance | Lab·LAB | `/api/sgtx/providers/performance?gtid=` | YES | ✅ RESOLVES | `ProviderPerformanceScreen` L9891 |
| invoices | Lab·LAB | DASH | YES | ✅ RESOLVES | Universal L9732 |
| audit | Lab·LAB | DASH | YES | ✅ RESOLVES | Universal L9737 |

### Portal 6 — Quality Control (`qc`)
- **Workspace:** Quality Control
- **Default Tenant GTID:** `SGTX-EG-QC-000022-8A1C`
- **Declared role / tenant type:** Quality Control · QC
- **Tabs:** 8

| Tab | Permission | API Dependency | Screen Resolves | Status | Notes |
|---|---|---|---|---|---|
| command | QC·QC | DASH | YES | ✅ RESOLVES | Universal L9727 |
| schedule | QC·QC | `/api/sgtx/qc-inspections/schedule` | YES | ✅ RESOLVES | `QcScreens(tab=schedule)` L8736 → dispatcher L9896 |
| field | QC·QC | `/api/sgtx/qc-inspections/field` | YES | ✅ RESOLVES | `QcScreens(tab=field)` L9896 |
| reports | QC·QC | `/api/sgtx/qc-inspections/<id>/upload-report` | YES | ✅ RESOLVES | `QcScreens(tab=reports)` L9896 |
| re-inspections | QC·QC | `/api/sgtx/qc-inspections/re-inspect` | YES | ✅ RESOLVES | `ReInspectionScreen` L9897 |
| performance | QC·QC | `/api/sgtx/providers/performance?gtid=` | YES | ✅ RESOLVES | `ProviderPerformanceScreen` L9898 |
| invoices | QC·QC | DASH | YES | ✅ RESOLVES | Universal L9732 |
| audit | QC·QC | DASH | YES | ✅ RESOLVES | Universal L9737 |

### Portal 7 — Customs Broker (`cbr`)
- **Workspace:** Customs Broker
- **Default Tenant GTID:** `SGTX-EG-CBR-000009-5E7B`
- **Declared role / tenant type:** Customs Broker · CBR
- **Tabs:** 17

| Tab | Permission | API Dependency | Screen Resolves | Status | Notes |
|---|---|---|---|---|---|
| command | CBR·CBR | DASH | YES | ✅ RESOLVES | Universal L9727 |
| declarations | CBR·CBR | `/api/sgtx/customs-declaration/list`, `/api/sgtx/clearance/<action>` | YES | ✅ RESOLVES | `CbrScreens(tab=declarations)` L8970 → dispatcher L9903 |
| certificates | CBR·CBR | `/api/sgtx/certificates/*` | YES | ✅ RESOLVES | `CbrScreens(tab=certificates)` L9903 |
| trade-certificates | CBR·CBR | `/api/sgtx/certificates/origin` | YES | ✅ RESOLVES | `CertificateOfOriginPanel` L9777 |
| clearance | CBR·CBR | `/api/sgtx/clearance/<action>` | YES | ✅ RESOLVES | `CbrScreens(tab=clearance)` L9903 |
| physical-jobs | CBR·CBR | `/api/sgtx/physical-jobs/*` | YES | ✅ RESOLVES | `PhysicalJobsScreen` L9904 |
| customs-gateway | CBR·CBR | `/api/sgtx/customs-gateway/*` | YES | ✅ RESOLVES | `CustomsGatewayScreen` L9907 |
| broker-credentials | CBR·CBR | `/api/sgtx/broker-credentials/*` | YES | ✅ RESOLVES | `BrokerCredentialsScreen` L9908 |
| submission-monitoring | CBR·CBR | `/api/sgtx/submission-monitoring/*` | YES | ✅ RESOLVES | `SubmissionMonitoringScreen` L9909 |
| broker-onboarding | CBR·CBR | `/api/sgtx/broker-onboarding/*` | YES | ✅ RESOLVES | `BrokerOnboardingScreen` L9910 |
| performance | CBR·CBR | `/api/sgtx/providers/performance?gtid=` | YES | ✅ RESOLVES | `ProviderPerformanceScreen` L9905 |
| fee-schedule | CBR·CBR | `/api/sgtx/customs-gateway/fee-schedule` | YES | ✅ RESOLVES | `FeeScheduleScreen` L9912 (FeeDisputeScreens.tsx:229) |
| fee-commitments | CBR·CBR | `/api/sgtx/customs-gateway/fee-commitments` | YES | ✅ RESOLVES | `FeeCommitmentsScreen` L9913 (FeeDisputeScreens.tsx:329) |
| additional-charges | CBR·CBR | `/api/sgtx/customs-gateway/additional-charges` | YES | ✅ RESOLVES | `AdditionalChargeRequestsScreen` L9914 — **"Submit for Trader Review" button has no onClick** (FeeDisputeScreens.tsx:456) |
| fee-disputes | CBR·CBR | `/api/sgtx/customs-gateway/fee-observability` | YES | ✅ RESOLVES | `FeeDisputesScreen` L9915 — **"File Dispute" button has NO onClick handler (dead)** (FeeDisputeScreens.tsx:678) |
| invoices | CBR·CBR | DASH | YES | ✅ RESOLVES | Universal L9732 |
| audit | CBR·CBR | DASH | YES | ✅ RESOLVES | Universal L9737 |

### Portal 8 — Financier — Bank (`bank`)
- **Workspace:** Financier — Bank
- **Default Tenant GTID:** `SGTX-EG-BNK-000007-1F8D`
- **Declared role / tenant type:** Financier · BANK
- **Tabs:** 14

| Tab | Permission | API Dependency | Screen Resolves | Status | Notes |
|---|---|---|---|---|---|
| command | Financier·BANK | DASH | YES | ✅ RESOLVES | Universal L9727 |
| opportunities | Financier·BANK | `/api/sgtx/financing/opportunities` | YES | ✅ RESOLVES | `FinancingOpportunitiesScreen` L9920 |
| portfolio | Financier·BANK | `/api/sgtx/financing/portfolio` | YES | ✅ RESOLVES | `FinancierPortfolioScreen` L9921 |
| lc-management | Financier·BANK | `/api/sgtx/lc/*`, `/api/sgtx/ucp600/*` | YES | ✅ RESOLVES | `LetterOfCreditPanel` L9774 |
| defi | Financier·BANK | `/api/sgtx/defi/pools` | YES | ✅ RESOLVES | `FinancierPortfolioScreen(initialTab="defi")` L9922 |
| preferences | Financier·BANK | `/api/sgtx/financing/preferences` | YES | ✅ RESOLVES | `FinancierPreferencesScreen` L9923 |
| financed-trades | Financier·BANK | `/api/sgtx/financing/financed-trades` | YES | ✅ RESOLVES | `FinancedTradesScreen` L9927 |
| shipments | Financier·BANK | DASH | YES | ✅ RESOLVES | Universal L9730 (collateral visibility) |
| milestones | Financier·BANK | `/api/sgtx/milestones?ustn=` | YES | ✅ RESOLVES | Universal L9735 (bank ≠ lsp) |
| documents | Financier·BANK | DASH | YES | ✅ RESOLVES | Universal L9731 |
| collateral | Financier·BANK | (none — static) | YES | ✅ RESOLVES | L9929 inline placeholder `<Card>All loans are over-collateralised via FeeLock…</Card>` — static text, no API |
| settlement | Financier·BANK | `/api/sgtx/settlement/approve` | YES | ✅ RESOLVES | Universal L9736 |
| compliance | Financier·BANK | `/api/sgtx/compliance/list` | YES | ✅ RESOLVES | Universal L9739 |
| audit | Financier·BANK | DASH | YES | ✅ RESOLVES | Universal L9737 (bank ≠ admin) |

### Portal 9 — Financier — Private (`pfi`)
- **Workspace:** Financier — Private
- **Default Tenant GTID:** `SGTX-EG-PFI-000011-3C2E`
- **Declared role / tenant type:** Private Financier · PFI
- **Tabs:** 11

| Tab | Permission | API Dependency | Screen Resolves | Status | Notes |
|---|---|---|---|---|---|
| command | Financier·PFI | DASH | YES | ✅ RESOLVES | Universal L9727 |
| opportunities | Financier·PFI | `/api/sgtx/financing/opportunities` | YES | ✅ RESOLVES | `FinancingOpportunitiesScreen` L9920 |
| portfolio | Financier·PFI | `/api/sgtx/financing/portfolio` | YES | ✅ RESOLVES | `FinancierPortfolioScreen` L9921 |
| financed-trades | Financier·PFI | `/api/sgtx/financing/financed-trades` | YES | ✅ RESOLVES | `FinancedTradesScreen` L9927 |
| shipments | Financier·PFI | DASH | YES | ✅ RESOLVES | Universal L9730 |
| milestones | Financier·PFI | `/api/sgtx/milestones?ustn=` | YES | ✅ RESOLVES | Universal L9735 |
| documents | Financier·PFI | DASH | YES | ✅ RESOLVES | Universal L9731 |
| borrowers | Financier·PFI | (none — static) | YES | ✅ RESOLVES | L9928 inline placeholder `<Card>Borrower history available…</Card>` — static text, no API |
| preferences | Financier·PFI | `/api/sgtx/financing/preferences` | YES | ✅ RESOLVES | `FinancierPreferencesScreen` L9923 |
| compliance | Financier·PFI | `/api/sgtx/compliance/list` | YES | ✅ RESOLVES | Universal L9739 |
| audit | Financier·PFI | DASH | YES | ✅ RESOLVES | Universal L9737 |

### Portal 10 — Government (`gov`)
- **Workspace:** Government Portal
- **Default Tenant GTID:** `SGTX-EG-GOV-000001-9A0B`
- **Declared role / tenant type:** Regulator · GOV
- **Tabs:** 32

| Tab | Permission | API Dependency | Screen Resolves | Status | Notes |
|---|---|---|---|---|---|
| command | Regulator·GOV | DASH | YES | ✅ RESOLVES | Universal L9727 (also branch L403 sets "Regulatory Oversight" title) |
| trade-flow | Regulator·GOV | `/api/sgtx/trade/list?limit=100` | YES | ✅ RESOLVES | `GovScreens(tab=trade-flow)` L9404 → dispatcher L9946 |
| shipments | Regulator·GOV | DASH | YES | ✅ RESOLVES | Universal L9730 |
| milestones | Regulator·GOV | `/api/sgtx/milestones?ustn=` | YES | ✅ RESOLVES | Universal L9735 (gov ≠ lsp) |
| documents | Regulator·GOV | DASH | YES | ✅ RESOLVES | Universal L9731 |
| disputes | Regulator·GOV | DASH, `/api/sgtx/disputes/mediation` | YES | ✅ RESOLVES | Universal L9740 → same `DisputesScreen` (File Dispute dead) |
| customs | Regulator·GOV | `/api/sgtx/clearance/*` | YES | ✅ RESOLVES | `GovScreens(tab=customs)` L9472 → dispatcher L9946 |
| fx | Regulator·GOV | `/api/sgtx/trade/list` (derived) | YES | ✅ RESOLVES | `GovScreens(tab=fx)` L9439 → dispatcher L9946 |
| food-safety | Regulator·GOV | `/api/sgtx/food-safety/*` | YES | ✅ RESOLVES | `GovScreens(tab=food-safety)` L9469 → dispatcher L9946 |
| integrations | Regulator·GOV | `/api/sgtx/integrations` | YES | ✅ RESOLVES | `IntegrationsFull` L9945 (note: `GovScreens` also has a branch at L9430 but is shadowed) |
| governor | Regulator·GOV | `/api/sgtx/governor/*` | YES | ✅ RESOLVES | `GovernorDecisionScreen` L9947 |
| opa | Regulator·GOV | `/api/sgtx/opa/*` | YES | ✅ RESOLVES | `OpaPolicyScreen` L9948 |
| loom | Regulator·GOV | `/api/sgtx/loom/verify` | YES | ✅ RESOLVES | `LoomVerificationScreen` L9949 |
| jurisdictions | Regulator·GOV | `/api/sgtx/jurisdictions` | YES | ✅ RESOLVES | `JurisdictionMatrixScreen` L9950 |
| qes | Regulator·GOV | `/api/sgtx/qes/*` | YES | ✅ RESOLVES | `QesScreen` L9951 |
| device | Regulator·GOV | `/api/sgtx/device-trust?tenant=` | YES | ✅ RESOLVES | `DeviceTrustScreen` L9952 |
| evidence | Regulator·GOV | `/api/sgtx/evidence-package/*` | YES | ✅ RESOLVES | `EvidencePackageScreen` L9953 |
| compliance-screen | Regulator·GOV | `/api/sgtx/compliance-screen?tenant=` | YES | ✅ RESOLVES | `ComplianceScreeningScreen` L9954 |
| sar | Regulator·GOV | `/api/sgtx/sar/*` | YES | ✅ RESOLVES | `SarScreen` L9955 |
| ustn | Regulator·GOV | `/api/sgtx/ustn/master` | YES | ✅ RESOLVES | `UstnMasterScreen` L9956 |
| journey | Regulator·GOV | `/api/sgtx/journey/*` | YES | ✅ RESOLVES | `RoleJourneyScreen` L9957 |
| audit | Regulator·GOV | DASH | YES | ✅ RESOLVES | Universal L9737 (gov ≠ admin) |
| transport | Regulator·GOV | `/api/sgtx/transport-logistics/*` | YES | ✅ RESOLVES | `TransportLogisticsScreen` L9958 |
| finance | Regulator·GOV | `/api/sgtx/financial-execution/*` | YES | ✅ RESOLVES | `FinancialExecutionScreen` L9968 |
| completion | Regulator·GOV | `/api/sgtx/completion/*` | YES | ✅ RESOLVES | `PostTradeCompletionScreen` L9969 |
| integration-control | Regulator·GOV | `/api/sgtx/integration-control/*` | YES | ✅ RESOLVES | `GlobalIntegrationControlScreen` L9942 (intentionally different from `integrations`) |
| regulatory-change | Regulator·GOV | `/api/sgtx/regulatory-change/*` | YES | ✅ RESOLVES | `RegulatoryChangeCenterScreen` L9970 |
| regulatory-snapshots | Regulator·GOV | `/api/sgtx/regulatory-snapshot/<ustn>/verify` | YES | ✅ RESOLVES | `RegulatorySnapshotsScreen` L9967 |
| readiness-center | Regulator·GOV | `/api/sgtx/production-readiness/*` | YES | ✅ RESOLVES | `ProductionReadinessCenterScreen` L9971 |
| grir | Regulator·GOV | `/api/sgtx/grir/*` | YES | ✅ RESOLVES | `GrirPanel` L9963 |
| force-majeure | Regulator·GOV | `/api/sgtx/force-majeure/*` | YES | ✅ RESOLVES | `ForceMajeurePanel` L9964 |
| compliance-calendar | Regulator·GOV | `/api/sgtx/compliance-calendar/*` | YES | ✅ RESOLVES | `ComplianceCalendarPanel` L9965 |

### Portal 11 — Platform Admin (`admin`)
- **Workspace:** Platform Admin
- **Default Tenant GTID:** `SGTX-ZZ-ADM-000001-A1B2`
- **Declared role / tenant type:** Platform Admin · ADM
- **Tabs:** 13

| Tab | Permission | API Dependency | Screen Resolves | Status | Notes |
|---|---|---|---|---|---|
| command-center | Admin·ADM | `/api/sgtx/admin/*` | YES | ✅ RESOLVES | `AdminCommandCenter` L9976 (intentionally different from universal `command`) |
| metrics | Admin·ADM | `/api/sgtx/admin/metrics` | YES | ✅ RESOLVES | `AdminMetricsScreen` L9977 |
| incidents | Admin·ADM | `/api/sgtx/admin/incidents` | YES | ✅ RESOLVES | `AdminIncidentsScreen` L9978 |
| threats | Admin·ADM | `/api/sgtx/admin/threats` | YES | ✅ RESOLVES | `AdminThreatsScreen` L9979 |
| multisig | Admin·ADM | `/api/sgtx/admin/multisig` | YES | ✅ RESOLVES | `AdminMultisigScreen` L9980 |
| add-ons | Admin·ADM | `/api/sgtx/addons/library` | YES | ✅ RESOLVES | `AdminAddOnsScreen` L9984 |
| addons-hub | Admin·ADM | `/api/sgtx/addons/*` | YES | ✅ RESOLVES | `AddOnsHubScreen` L9983 (deliberately before `add-ons`) |
| competitor-benchmark | Admin·ADM | `/api/sgtx/competitor-benchmark/*` | YES | ✅ RESOLVES | `CompetitorBenchmark` L9987 |
| customs-gateway-admin | Admin·ADM | `/api/sgtx/customs-gateway/admin/*` | YES | ✅ RESOLVES | `CustomsGatewayAdminScreen` L9988 |
| fee-dispute-admin | Admin·ADM | `/api/sgtx/customs-gateway/fee-observability` (admin scope) | YES | ✅ RESOLVES | `FeeDisputeAdminScreen` L9992 (read-only governance view) |
| integrations | Admin·ADM | `/api/sgtx/admin/integrations` | YES | ✅ RESOLVES | `AdminIntegrationsScreen` L9985 |
| sla | Admin·ADM | `/api/sgtx/admin/sla` | YES | ✅ RESOLVES | `AdminSlaScreen` L9993 |
| audit | Admin·ADM | `/api/sgtx/admin/audit` | YES | ✅ RESOLVES | `AdminAuditScreen` L9994 (overrides universal audit at L9737 via the `!== "admin"` guard) |

### Portal 12 — Marketplace Partner (`marketplace-partner`)
- **Workspace:** Marketplace Partner
- **Default Tenant GTID:** `SGTX-ZZ-MKT-000001-C3D4`
- **Declared role / tenant type:** Marketplace Partner · MKT
- **Tabs:** 8

| Tab | Permission | API Dependency | Screen Resolves | Status | Notes |
|---|---|---|---|---|---|
| command-center | MKT·MKT | `/api/sgtx/marketplace/dashboard` | YES | ✅ RESOLVES | `MarketplaceCommandCenter` L9999 |
| leads | MKT·MKT | `/api/sgtx/marketplace/leads` | YES | ✅ RESOLVES | `MarketplaceLeadsScreen` L10000 |
| webhooks | MKT·MKT | `/api/sgtx/marketplace/webhooks` | YES | ✅ RESOLVES | `MarketplaceWebhooksScreen` L10001 |
| revenue | MKT·MKT | `/api/sgtx/marketplace/revenue` | YES | ✅ RESOLVES | `MarketplaceRevenueScreen` L10002 |
| api-keys | MKT·MKT | `/api/sgtx/marketplace/api-keys` | YES | ✅ RESOLVES | `MarketplaceApiKeysScreen` L10003 |
| sandbox | MKT·MKT | `/api/sgtx/marketplace/sandbox` | YES | ✅ RESOLVES | `MarketplaceSandboxScreen` L10004 |
| agreement | MKT·MKT | `/api/sgtx/marketplace/agreement` | YES | ✅ RESOLVES | `MarketplaceAgreementScreen` L10005 |
| company-admin | MKT·MKT | `/api/sgtx/tenants/<GTID>` | YES | ✅ RESOLVES | `MarketplaceCompanyAdminScreen` L10006 |

---

## Dispute Workflow Verdict

### ❌ The user-facing "File Dispute" button is a DEAD BUTTON.

**Evidence (file:line):**

1. **`DisputesScreen` (used by the `disputes` tab on trader-buyer, trader-seller, AND gov portals) — `src/components/portals/PortalContent.tsx:8114`**
   - **Line 8163** — the SectionHeader `action` prop renders a gold "File Dispute" button:
     ```tsx
     action={<Button size="sm" className="bg-gold-gradient text-sovereign"><Gavel className="w-3.5 h-3.5 mr-1.5" />File Dispute</Button>}
     ```
     There is **NO `onClick` attribute** on this `<Button>`. Clicking it produces zero effect.
   - **Line 8165** — when the dispute list is empty, an `EmptyState` "File a Dispute" button is rendered with:
     ```tsx
     actionLabel="File a Dispute" onAction={() => {/* opens dispute modal */}}
     ```
     The arrow function body is **literally empty** — only a comment. (`EmptyState` in `src/components/sgtx/premium-ui.tsx:108–144` renders a button with `onClick={onAction}`, so the click does fire the empty function — i.e. nothing happens.)
   - **The mediation modal (lines 8199–8236) only renders an existing message log** — there is **no input field, no send button, no POST to `/api/sgtx/disputes/mediation`**. The user can *read* mediation messages but cannot *post* one from this UI.
   - The only live API calls in `DisputesScreen` are:
     - `GET /api/sgtx/disputes/mediation?disputeId=` (line 8145) — read-only mediation log
     - `POST /api/sgtx/ai/dispute-root-cause` (line 8128) — AI causal analysis

2. **`TraderDisputeScreen` (used by trader-buyer `fee-disputes-trader` tab) — `src/components/sgtx/FeeDisputeScreens.tsx:658`**
   - **Line 678** — same dead pattern:
     ```tsx
     action={<Button size="sm" className="bg-gold-gradient text-sovereign"><Gavel className="w-3.5 h-3.5 mr-1.5" />File Dispute</Button>}
     ```
     No `onClick`. Dead button.

3. **`FeeDisputesScreen` (used by cbr `fee-disputes` tab) — `src/components/sgtx/FeeDisputeScreens.tsx:501`**
   - Re-uses the same dead "File Dispute" header pattern as `TraderDisputeScreen` (same export file, same component template).
   - The "Submit for Trader Review" button inside `AdditionalChargeRequestsScreen` (line 456) **also has no `onClick`** — the additional-charge form is rendered but cannot actually be submitted.

4. **The backend, however, is fully real and wired:**
   - `POST /api/sgtx/disputes/file` — `src/app/api/sgtx/disputes/file/route.ts:7` — calls `fileDispute(body)` from `src/lib/sgtx/dispute/index.ts:16`.
   - `fileDispute` performs governor pre-check (`governorDecide`), validates the USTN against `db.trade.findUnique`, creates a `db.dispute.create` record (status `FILED`), increments `Trade.phase` to 8, and freezes FeeLock.
   - `Dispute` Prisma model exists at `prisma/schema.prisma:477` with full relations: `arbitrationCases`, `causalAttributions`, `evidence`, `experts`, `mediation`, `prediction`, `qcOverrideFlags`, `proposals`.
   - Mediation GET/POST endpoint at `src/app/api/sgtx/disputes/mediation/route.ts` is real and tested (lines 7–62 GET, 54+ POST).

5. **The working `FileDisputeModal` exists — but is dead code:**
   - `src/components/sgtx/dispute-screens.tsx:124` defines `FileDisputeModal` with a real `await jfetch("/api/sgtx/disputes/file", { method: "POST", … })` call (line 137).
   - It is rendered only inside `DisputeResolutionScreen` (line 47 of the same file).
   - **`DisputeResolutionScreen` is exported but never imported anywhere in the codebase** — confirmed by exhaustive ripgrep (`src/components/sgtx/dispute-screens.tsx:47:export function DisputeResolutionScreen()` is the only match). It is orphaned dead code.
   - The portals use `DisputesScreen` from `PortalContent.tsx` instead, which has the dead button.

### Net verdict on the dispute workflow

| Capability | Status | Evidence |
|---|---|---|
| View existing disputes | ✅ Works | `DisputesScreen` reads `data.disputes` from dashboard aggregator |
| Open mediation log (read) | ✅ Works | `GET /api/sgtx/disputes/mediation?disputeId=` at `PortalContent.tsx:8145` |
| Post a mediation message | ❌ NO UI | Mediation modal (`PortalContent.tsx:8199–8236`) has no input field or send button — only a read-only list |
| Run AI root-cause analysis | ✅ Works | `POST /api/sgtx/ai/dispute-root-cause` at `PortalContent.tsx:8128` |
| **File a new dispute from any portal UI** | **❌ DEAD BUTTON** | "File Dispute" buttons at `PortalContent.tsx:8163`, `PortalContent.tsx:8165` (EmptyState), `FeeDisputeScreens.tsx:678` have no `onClick` / empty handler. The real `FileDisputeModal` in `dispute-screens.tsx:124` is never imported. |
| Backend `POST /api/sgtx/disputes/file` | ✅ Real | `disputes/file/route.ts:7` → `fileDispute` (`dispute/index.ts:16`) creates `Dispute` Prisma record |
| Prisma `Dispute` model | ✅ Real | `prisma/schema.prisma:477` with 9 relations and 4 indexes |

**Conclusion:** The dispute *lifecycle backend* is fully implemented and operational (file, mediation GET, mediation POST, AI root-cause, Prisma model, governor gate, FeeLock freeze). However, the *user-facing file-dispute entry point is a dead button* on every portal where it appears. Users cannot file a new dispute from any of the 12 portals — they can only view disputes that have been filed via some other path (e.g., directly calling the API, or via the orphaned `DisputeResolutionScreen` component that no portal renders). The orphaned working modal in `src/components/sgtx/dispute-screens.tsx` needs to be wired into `DisputesScreen` (replacing the dead `action={<Button…/>File Dispute</Button>}` at `PortalContent.tsx:8163` with `<Button onClick={() => setFileModal(true)} …>File Dispute</Button>` plus the modal JSX) to make the workflow end-to-end live.

---

## Cross-cutting findings (outside the per-tab matrix)

1. **Zero permission enforcement.** `src/app/page.tsx:14–69` renders `WorkspaceShell` purely on `useAppStore.activePortalId`. No Next.js middleware, no server session check, no JWT. Anyone with a browser can switch to the `admin` portal or the `gov` portal by setting the store. This is a critical security gap if the platform is ever deployed beyond the demo.
2. **Hardcoded demo GTIDs** in `portal-config.ts` (e.g., `SGTX-EG-GOV-000001-9A0B` for gov, `SGTX-ZZ-ADM-000001-A1B2` for admin). All dashboard queries are scoped to these GTIDs in the demo. Production would need real auth-bound tenant selection.
3. **Silent fallback risk.** `PortalContent.tsx:10010` returns `<CommandCenter>` for any unmatched tab id. Adding a new tab to `portal-config.ts` without adding a dispatcher branch will silently render the Command Center — no error, no warning. There is no exhaustive `switch`/`assertNever` guard.
4. **Shadowed dispatcher branches.** `GovScreens` (`PortalContent.tsx:9404`) has an internal `if (tab === "integrations")` at L9430 that is shadowed by the outer `if (tab === "integrations") return <IntegrationsFull />` at L9945. Dead code, not a bug — but confusing.
5. **Static placeholder screens** that "resolve" but are not real:
   - `bank.collateral` → inline `<Card>` placeholder (`PortalContent.tsx:9929`)
   - `pfi.borrowers` → inline `<Card>` placeholder (`PortalContent.tsx:9928`)
   - These count as ✅ RESOLVES in the matrix because they render real JSX, but they are content-light and have no API dependency.

---

## Audit method (reproducible)

```bash
# 1. Extract canonical portal + tab registry
rg -n '^    id: "|^\s+\{ id: "[a-z0-9-]+", label:' src/lib/sgtx/portal-config.ts

# 2. Extract dispatcher branches
rg -n 'portal\.id === |if \(tab === ' src/components/portals/PortalContent.tsx

# 3. Verify dispute UI dead-button
rg -n 'File Dispute|fileDispute|disputes/file|FileDisputeModal' src/components/

# 4. Confirm dispute-screens.tsx is dead code
rg -rn 'DisputeResolutionScreen|from "@/components/sgtx/dispute-screens"' src/

# 5. Verify backend dispute lifecycle exists
cat src/app/api/sgtx/disputes/file/route.ts
rg -n 'model Dispute\b|fileDispute|postMediationMessage|triggerAdvisoryDispute' src/lib/sgtx/dispute/index.ts prisma/schema.prisma
```

— End of matrix —

# SGTX Blueprint — v16.1 Comprehensive Executive Modifications Patch

**Applied:** September 5, 2026
**Base version:** v16 (Canonical Full End-to-End AI Developer Master Implementation Prompt)
**Patch version:** v16.1
**Commit:** (this commit)

---

## Modification Summary

| Mod ID | Modification | Rationale |
|---|---|---|
| M1 | Phase 1 Step Reordering | Transport Mode must precede Container Configuration; Incoterm + Settlement merged; AI Container Advisor moved after Transport Mode. |
| M2 | Explicit Lab Test Requirements | Mandatory vs Optional tests with pricing transparency ("pesticides free for buyer"). |
| M3 | Geographically-Aware QC Inspection | Provider coverage validation, seller contact status advisory, historical price ranges. |
| M4 | Financing Data Sovereignty | Buyer only declares Buyer financing; Seller declares Seller financing (Phase 2). Removed "Seller/Either/None" from Phase 1. |
| M5 | Two-Phase Financing Pre-Clearance | Conditional Financing Reference (CFR) required BEFORE contract lock; auto-converts to formal Phase 4 request after lock. |
| M6 | Service Provider Capability Model | Replace rigid lsp_subtype with flexible service_capabilities array; unified Service Provider Portal; Logistics Builder filters by capability. |

---

## Patch 1: Phase 1 Workflow (Buyer Dashboard) — Full Replacement

The trade request wizard now has 13 steps in operationally correct order:

1. Seller Selection (GTID autocomplete, sanctions pre-screen)
2. Incoterm + Commercial Foundation (MERGED: Incoterm, Settlement, Payment Timing, Credit Period, Currency, Buyer-only Financing Toggle)
3. Transport Mode & Equipment (MOVED EARLIER: Ocean/Air/Rail/Truck/RoRo/Multimodal)
4. Container/Unit & Commodity Config (MOVED AFTER TRANSPORT: mode-aware units, commodity, acceptance criteria, quantity/tolerance)
5. Lab Test Requirements (NEW: RIA-generated mandatory tests $0, recommended/optional with prices)
6. QC Inspection Request (NEW — Geo-aware: provider coverage validation, price ranges, seller contact advisory)
7. AI Container/Unit Advisor (MOVED AFTER TRANSPORT: advisory banner with optimal configuration)
8. Documentation Requirements (RIA-driven, mode-aware, includes Lab/QC report triggers)
9. Insurance Requirements
10. Delivery Window & Special Instructions
11. Trade Criticality (removed seller financing flags)
12. Draft Auto-Save (30s interval, 14-day expiry, reminders at 11 & 13 days)
13. Submit Trade Request (Governor runs G1U1-G1U36 validation gates)

## Patch 2: Financing Pre-Clearance (CFR)

Cross-phase section between Phase 1 and Phase 4:
- Step A: Pre-Clearance (before contract lock) — borrower selects financier, system compiles trade digest, financier issues CFR with max amount, APR, conditions, validity
- Step B: Formal Execution (after contract lock) — auto-creates financing_requests from CFR, financier disburses via PSP split

Governor gate G3U12 checks for valid CFR before contract lock.

## Patch 3: Service Provider Capability Model

- `service_capabilities` TEXT[] added to Tenant
- `ServiceCapabilityDefinition` reference table with 11 initial capabilities
- `ProviderPortCoverage` table linking providers to ports for specific capabilities
- Unified Service Provider Portal with dynamic tabs based on capabilities
- Logistics Builder filters providers by capability, not legacy type

## Patch 4: New Governor Gates

| Gate ID | Check | Phase |
|---|---|---|
| G1U4 | All mandatory lab tests (RIA-determined) are selected | Phase 1 Submit |
| G1U5 | If QC requested, at least one active QC provider exists in selected port/country | Phase 1 Submit |
| G1U6 | Advisory warning if seller has no saved QC contacts in selected country | Phase 1 Submit |
| G2U22 | Selected provider must have matching service_capability | Phase 2 Submit Quote |
| G2U23 | If single GTID for multiple services, verify all capabilities | Phase 2 Submit Quote |
| G3U12 | If financing_required, valid non-expired CFR must exist before contract lock | Phase 3 Contract Lock |
| G3U13 | CFR must be from valid, active financier with corridor coverage | Phase 3 Contract Lock |

## Patch 5: Data Model Additions

New Prisma models:
- `TradeLabRequirement` (test_name, category MANDATORY/RECOMMENDED/OPTIONAL, price estimate, source regulation)
- `TradeQcRequirement` (required, location_type, port, country, sampling_plan, estimated price range)
- `FinancingPreClearanceRequest` (borrower_gtid, financier_gtid, trade_digest JSON, status, cfr_reference, conditional_amount_max, conditional_apr, validity_until)
- `ServiceCapabilityDefinition` (capability_code, capability_name, capability_group, requires_accreditation)
- `ProviderPortCoverage` (provider_gtid, service_capability, port_unlocode, country_code, is_active)
- `QcHistoricalQuote` (port, commodity_category, sampling_plan, quoted_price_usd, anonymised_provider_id)

Modified models:
- `TradeRequest` — add `buyerFinancingRequired` Boolean
- `SellerQuote` — add `sellerFinancingRequired` Boolean
- `FinancingRequest` — add `preClearanceId` and `cfrReference`
- `Tenant` — add `serviceCapabilities` String[]

## Patch 6: Portal Summary Update

Unified Service Provider Portal replaces separate LSP/SHIP/LAB/QC/CBR portals. Tabs dynamically rendered based on `service_capabilities` array. Legacy types preserved but deprecated.

---

## Implementation Checklist

| # | Action | Status |
|---|---|---|
| 1 | Replace Phase 1 workflow (Patch 1) | ✅ Implemented in /trades/new wizard |
| 2 | Insert Financing Pre-Clearance (Patch 2) | ✅ Models + API added |
| 3 | Service Capability Model (Patch 3) | ✅ Tenant field + reference table |
| 4 | Logistics Builder capability filtering (Patch 3) | ✅ API supports capability filter |
| 5 | New Governor gates (Patch 4) | ✅ Added to governor gates |
| 6 | Consolidated DDL (Patch 5) | ✅ Prisma schema updated + pushed to Turso |
| 7 | Portal summary update (Patch 6) | ✅ Documentation updated |

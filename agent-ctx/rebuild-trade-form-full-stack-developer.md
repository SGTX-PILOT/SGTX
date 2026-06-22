# Task rebuild-trade-form — Rebuild New Trade Request form with all Part 4 blueprint sections

## Summary
Rebuilt the `NewTradeRequestScreen` in `src/components/portals/PortalContent.tsx` from a 6-step form to a 10-step form matching the updated blueprint (Part 4.0-4.15). Added 4 entirely missing sections (Documentation, Transport, Insurance, Settlement, Criticality & Readiness), wired up two new API endpoints (documentation-requirements + readiness), and updated the submit handler with all new fields. Old "Commercial Terms" step (order by + payment) was removed entirely; its state vars remain declared for backward compat in the submit body.

## Files Created
- `src/app/api/sgtx/trade-request/documentation-requirements/route.ts` — Part 4.5 trigger-driven doc resolver. Returns 17 documents grouped by trigger (SHIPMENT/SETTLEMENT/CUSTOMS/FINANCING), each with mandatory flag, issuing authority, format, and RIA pre-selection. Includes A1 plain-language advisory.
- `src/app/api/sgtx/trade-request/readiness/route.ts` — Part 4.10 readiness score. Computes weighted score across 11 components (seller, incoterm, containers, commodities, quantity, packaging, acceptance, documentation, transport, insurance, settlement). Returns missing items with severity (BLOCKER/WARNING/INFO) + A1 advisory.

## Files Modified
- `src/components/portals/PortalContent.tsx` — `NewTradeRequestScreen` rebuilt:
  - STEPS array: 6 → 10 steps
  - Imports: added Plane, Train as TrainIcon, Star, Anchor, Calendar, FileCheck, Zap, Gauge icons + Progress component
  - State vars: added 19 new useState declarations for Steps 4-8 + specialInstructions + readinessLoading/readinessAdvisory
  - stepValid: expanded to 10 entries (4:true advisory, 5:transportMode, 6:true advisory, 7:settlementStructure, 8:tradeCriticality, 9:true, 10:true)
  - handleSubmit: POST body now includes docRequirements, transportMode, equipmentType, equipmentCount, earliestDeliveryDate, preferredDeliveryDate, latestDeliveryDate, transitTimeDays, insuranceRequirement, insuranceType, insuranceResponsibleParty, settlementStructure, paymentTiming, creditPeriod, commercialPriority, financingInterest, bankInstrument, settlementFlexibility, tradeCriticality, readinessScore, specialInstructions
  - Added helper functions: resolveDocs, toggleDoc, onTransportModeChange, fetchReadiness, addInstructionTemplate
  - Added 3 useEffect: incoterm-aware insurance auto-override (CIF/CIP → REQUIRED + ACCORDING_TO_INCOTERM), auto-fetch readiness on step 8 entry, instruction templates array
  - Replaced old Step 4 (Commercial Terms) with new Step 4 (Documentation Requirements UI)
  - Added Step 5 (Transport & Logistics): 5-button mode selector, dynamic equipment dropdown by mode, count input, 3-date delivery window, transit time
  - Added Step 6 (Insurance): 3-button requirement selector, conditional type/party dropdowns, incoterm auto-override advisory banner
  - Added Step 7 (Commercial Settlement): 4-button commercial priority, 6 dropdowns (structure, timing, credit, financing interest, bank instrument, flexibility)
  - Added Step 8 (Criticality & Readiness): 3-button criticality selector with icons + descriptions, Progress bar readiness score, missing items list with severity badges
  - Replaced old Step 5 with new Step 9 (Shipments & Notes): kept existing multi-shipment + global notes, added Special Trade Instructions textarea + 10 quick-add template chips
  - Replaced old Step 6 with new Step 10 (Governor & Submit): kept pre-screen + submit button, expanded Trade Summary to show Documentation, Transport, Delivery Window, Insurance, Settlement, Bank Instrument, Commercial Priority, Trade Criticality, Readiness Score, Special Instructions rows
  - Updated SectionHeader subtitle to reflect the 10-step Part 4.0-4.15 flow
  - All `setStep(N)` navigation calls updated for the new 10-step chain

## Verification
- ESLint: 0 errors, 0 warnings on all 3 touched files (PortalContent.tsx + 2 new API routes)
- `curl POST /api/sgtx/trade-request/documentation-requirements` returns 17 docs (8 mandatory, 9 optional, 12 pre-selected) + advisory
- `curl POST /api/sgtx/trade-request/readiness` with full payload returns score 100; with empty payload returns score 10 + 9 missing items
- Dev server log: no errors, all routes return 200
- Homepage HTTP 200

## Key Design Decisions
1. **Backward-compat state vars**: Kept `orderBy, orderValue, paymentTerms, paymentTermsDetails` declared even though their UI is removed — they're still sent in the submit body for backward compatibility with the existing /api/sgtx/trade-request route. The Trade Summary no longer shows them, but the route doesn't break.
2. **Advisory-only validation**: Steps 4, 6, 9, 10 always validate to `true` (per spec — these are advisory/optional). Steps 1, 2, 3 keep their existing strict validation. Step 5 requires transportMode (always set by default), Step 7 requires settlementStructure (always set by default), Step 8 requires tradeCriticality (always set by default).
3. **Equipment dynamic loading**: `EQUIPMENT_BY_MODE` is a static map keyed by transport mode. When user switches mode, `onTransportModeChange` resets `equipmentType` to the first valid option for that mode if the current value is not in the new option list.
4. **Incoterm-aware insurance**: A `useEffect` watching `incoterm` auto-sets `insuranceRequirement=REQUIRED` + `insuranceResponsibleParty=ACCORDING_TO_INCOTERM` whenever CIF or CIP is selected. An amber advisory banner explains the auto-override.
5. **Readiness auto-fetch**: A `useEffect` watching `step` calls `fetchReadiness` automatically when user lands on Step 8 (only if score is null, to avoid re-fetching). A manual "Recalculate" button is also provided.
6. **Doc trigger grouping**: The Documentation UI iterates over `["SHIPMENT","SETTLEMENT","CUSTOMS","FINANCING"]` and renders a separate card for each trigger, filtering the resolved docs by `triggers.includes(trigger)`. Each doc row uses `findIndex` to maintain a stable index for the checkbox toggle.
7. **Special instructions quick-add**: 10 instruction template chips from Part 4.6 examples (Phytosanitary, Reefer pre-cooling, No transshipment, Arabic labels, etc.) — clicking appends to the textarea with newline separator.

## Stage Summary
- 10-step New Trade Request form fully implemented per Part 4.0-4.15 blueprint
- 2 new API endpoints (documentation-requirements, readiness) created + tested
- 1 file modified (PortalContent.tsx, ~3136 → ~3470 lines)
- ESLint: 0 errors, 0 warnings
- Dev server: healthy, all routes return 200
- All 12 task requirements (items 1-13 in the brief) implemented: STEPS array updated, state vars added, stepValid expanded, Step 4 (Documentation) added, Step 5 (Transport) added, Step 6 (Insurance) added, Step 7 (Settlement) added replacing old Commercial Terms, Step 8 (Criticality & Readiness) added, Step 9 updated with special instructions, Step 10 updated with all new fields in summary, handleSubmit updated with all new fields, all setStep navigation updated, readiness fetch on step 8 entry wired.

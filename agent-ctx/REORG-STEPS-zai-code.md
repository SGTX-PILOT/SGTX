# Task ID: REORG-STEPS
# Agent: Z.ai Code (main)
# Date: 2025-01

## Task
Reorganize the 10-step New Trade Request form for the buyer portal in
`src/components/portals/PortalContent.tsx` (function `NewTradeRequestScreen`)
into an 11-step logical flow. Move sections between steps without deleting
any fields, state variables, or logic.

## What changed

### STEPS array (line ~476)
Updated from 10 entries → 11 entries:
1. Parties & Incoterm
2. Commodity & Spec
3. Containers & Cargo
4. Transport & Logistics (was step 5)
5. Documentation & B/L (was step 4 + B/L type + document language from old step 7)
6. Insurance
7. Commercial Settlement (slimmed)
8. Quality & Lab Tests (NEW — QC inspection + lab tests from old step 7)
9. Shipments & Schedule (was step 9, slimmed to multi-shipment only)
10. Criticality & Notes (was step 8 + notes/attribution from old step 9)
11. Governor & Submit (was step 10)

### stepValid map (line ~986)
- Step 4: `!!transportMode && !!equipmentType`
- Step 5: `docRequirements.length > 0`
- Step 6: `!!insuranceRequirement`
- Step 7: `!!settlementStructure && !!paymentTiming && !!settlementCurrency`
- Step 8: `true` (optional)
- Step 9: `true` (optional)
- Step 10: `!!tradeCriticality`
- Step 11: `true`

### Step blocks
- Step 4 (Transport): full old Step 5 content. Alt Ports stays with Transport.
- Step 5 (Documentation & B/L): RIA docs (old Step 4) + B/L type selector + document language moved here from old Step 7.
- Step 6 (Insurance): unchanged.
- Step 7 (Settlement, slimmed): kept order by, container sizes, commercial priority, settlement structure, payment timing, credit period, currency, financing interest, bank instrument, settlement flexibility, settlement docs (6 checkboxes). Added an explicit "Original documents required (paper, couriered)" checkbox so `originalDocsRequired` has its own visible UI in Step 7 (still also driven by the B/L type buttons in Step 5).
- Step 8 (Quality & Lab Tests): the entire "Optional Buyer-Requested Services (Part 4.9a)" section (QC inspection toggle + fee input + lab tests catalog + optional services total) moved here verbatim.
- Step 9 (Shipments & Schedule): multi-shipment toggle + shipment list only. Removed Global Notes, Special Trade Instructions, Marketplace Attribution, Dispute modal — all moved to Step 10.
- Step 10 (Criticality & Notes): AI suggested criticality, criticality selector (ROUTINE/PRIORITY/CRITICAL), readiness score, Global Notes (moved from old Step 9), Special Trade Instructions Part 4.6 (moved from old Step 9), Marketplace Attribution + Dispute modal (moved from old Step 9).
- Step 11 (Governor & Submit): unchanged content of old Step 10. Back button updated to setStep(10). Submit button unchanged (handleSubmit).

### Navigation calls (all verified)
```
Step 1  → Continue setStep(2)
Step 2  → Back setStep(1);   Continue setStep(3)
Step 3  → Back setStep(2);   Continue setStep(4)  [stepValid[3]]
Step 4  → Back setStep(3);   Continue setStep(5)  [stepValid[4]]
Step 5  → Back setStep(4);   Continue setStep(6)  [stepValid[5]]
Step 6  → Back setStep(5);   Continue setStep(7)  [stepValid[6]]
Step 7  → Back setStep(6);   Continue setStep(8)  [stepValid[7]]
Step 8  → Back setStep(7);   Continue setStep(9)  [stepValid[8]]
Step 9  → Back setStep(8);   Continue setStep(10) (no disabled, optional)
Step 10 → Back setStep(9);   Continue setStep(11) [stepValid[10]]
Step 11 → Back setStep(10);  Submit handleSubmit
```

## Verification
- `bun run lint`: clean (only 2 pre-existing errors in
  `scripts/seed-roro-schedules.cjs` and `upload/buyer.jsx`, both unrelated).
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` → 200.
- dev.log: no compile errors; server recompiled in 367-512ms after edits.
- All 30+ state variables preserved (grep confirmed 225 occurrences of the
  key state variable names across the file).
- handleSubmit payload unchanged — still POSTs originalDocsRequired,
  documentLanguage, blType, optionalQcInspection, qcInspectionType,
  qcInspectionFeeUsd, labTestsRequested, labTestsFeeUsd,
  optionalServicesTotalUsd, plus all settlement/transport/insurance/
  criticality/containers/shipments/notes fields.

## Files touched
- `src/components/portals/PortalContent.tsx` (only)
- `worklog.md` (appended work record)

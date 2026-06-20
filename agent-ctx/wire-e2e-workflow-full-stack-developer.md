# Work Record — wire-e2e-workflow

- **Task ID**: wire-e2e-workflow
- **Agent**: full-stack-developer
- **Task**: Wire full end-to-end trade workflow (Phases 1-8) — Contract Lock, Quote Accept, Milestone Confirmation, Settlement, Workflow Advance APIs + UI wiring

## Context

Read `/home/z/my-project/worklog.md` for project context. Read previous agent records in `/home/z/my-project/agent-ctx/` for established conventions:
- `impl-p6-full-stack-developer.md` — payment FeeLock state machine conventions (`releaseFeeLock` etc.)
- `fix-ui-buttons-full-stack-developer.md` — UI button wiring pattern, `data._setActiveTab` for tab switching, Sonner toast conventions, `queryClient.invalidateQueries({ queryKey: ["dashboard"] })` after mutations.

Phases 0-2 + 4 + 7 + 8 already worked. Gaps to fix: Phase 3 (contract lock + signing), Phase 2→3 transition (quote accept), Phase 5 (milestone confirmation), Phase 6 (settlement), and a convenience workflow-advance endpoint.

## API Routes Created (7 new)

### 1. `src/app/api/sgtx/contract/lock/route.ts`
- POST /api/sgtx/contract/lock — Phase 3 Contract Lock
- Body: `{ ustn, buyerSigned, sellerSigned, feePaid, releaseAcknowledged }`
- Validates all 4 conditions true (409 if any missing)
- Updates Trade.status → `CONTRACT_SIGNED`, phase → 3
- Creates Activity log `CONTRACT_LOCKED` (SUCCESS)
- Creates TimelineEvent (phase 3, completed)
- Smart Inbox to both parties (priority 75, category NEGOTIATION)
- Idempotent: returns OK if trade is already CONTRACT_SIGNED/IN_EXECUTION/SETTLED
- Returns `{ ok, ustn, tradeStatus, message, conditions }`

### 2. `src/app/api/sgtx/contract/sign/route.ts`
- POST /api/sgtx/contract/sign — Phase 3 Digital Signature
- Body: `{ ustn, signerGtid, signerRole ("BUYER"|"SELLER"), signatureType ("STANDARD"|"AES"|"QES") }`
- Validates signer matches the trade's buyer or seller (403 otherwise)
- Maps signatureType to legalEffect: QES→handwritten_equivalent, AES→integrity_presumption, STANDARD→binding
- Generates documentHash (SHA-256 of ustn|signerGtid|role|timestamp) + signatureValue (SHA-256→base64)
- Creates QesSignature record (provider ZITADEL, documentType CONTRACT)
- Creates Activity log `SIGNED_CONTRACT` (SUCCESS)
- Creates TimelineEvent (phase 3, completed)
- Returns `{ ok, signed, signerGtid, signerRole, signatureType, legalEffect, documentHash }`

### 3. `src/app/api/sgtx/quote/accept/route.ts`
- POST /api/sgtx/quote/accept — Phase 2→3 transition (buyer accepts seller's quote)
- Body: `{ ustn, deliveryPort? }`
- Validates trade exists + status is QUOTED or NEGOTIATING (409 otherwise)
- Updates Trade.status → `QUOTE_ACCEPTED`, phase → 3; if deliveryPort provided, updates destPort on Trade + all Shipments
- Creates Activity log `QUOTE_ACCEPTED` (SUCCESS)
- Creates TimelineEvent (phase 2, completed)
- Smart Inbox to seller (priority 75, NEW_OFFER, "Quote accepted by buyer") + buyer (priority 70, NEGOTIATION, "proceed to contract signing")
- Returns `{ ok, ustn, tradeStatus, message, deliveryPort }`

### 4. `src/app/api/sgtx/milestone/confirm/route.ts`
- POST /api/sgtx/milestone/confirm — Phase 5 Milestone Confirmation
- Body: `{ ustn, milestone, confirmedByGtid, metadata? }`
- milestone values: `CONTAINER_LOADED | DEPARTED | IN_TRANSIT | ARRIVED | CUSTOMS_CLEARED | DELIVERED`
- Maps milestone → shipment status (CONTAINER_LOADED→LOADED, DEPARTED→DEPARTED, IN_TRANSIT→IN_TRANSIT, ARRIVED→ARRIVED, CUSTOMS_CLEARED→RELEASED, DELIVERED→DELIVERED)
- Validates confirmedByGtid is buyer or seller (403 otherwise); determines counterparty
- Updates Shipment.status (multi-shipment aware via metadata.shipmentSequence)
- Updates Trade.status → `IN_EXECUTION`, phase → 5 (if first milestone)
- Sets departedAt/arrivedAt/releasedAt timestamps based on milestone
- Creates TimelineEvent (phase 5, completed, label `Milestone: ${milestone.replace(/_/g, " ")}`)
- Creates Activity log `CONFIRMED_MILESTONE` (SUCCESS, metadata JSON)
- Smart Inbox to counterparty (priority 70, SHIPMENT_ALERT, "Milestone confirmed: ${milestone}")
- Returns `{ ok, ustn, milestone, shipmentStatus, updatedShipmentsCount, tradeStatus }`

### 5. `src/app/api/sgtx/milestones/route.ts`
- GET /api/sgtx/milestones?ustn=... — Returns full milestone state for a trade
- Returns: `{ ok, ustn, tradeStatus, phase, shipments[], milestoneTimeline[], timelineEvents[], activities[] }`
- `milestoneTimeline` is an array of all 6 milestones with `status: "CONFIRMED" | "PENDING"`, expectedShipmentStatus, confirmedAt, confirmedByGtid, and per-shipment statuses (sequence + currentStatus + confirmed boolean)
- Uses STATUS_ORDER map to determine if a shipment has "reached" a target status (LOADED=1 < DEPARTED=2 < IN_TRANSIT=3 < ARRIVED=4 < RELEASED=5 < DELIVERED=6)
- Milestone is CONFIRMED only when ALL shipments have reached it

### 6. `src/app/api/sgtx/settlement/approve/route.ts`
- POST /api/sgtx/settlement/approve — Phase 6 Settlement Approval
- Body: `{ ustn, approverGtid, stage ("STAGE1"|"STAGE2") }`
- Imports `releaseFeeLock` from `@/lib/sgtx/payment/fealock` and calls it (non-blocking — wraps in try/catch in case FeeLock doesn't exist or is already released)
- Validates approver is buyer or seller (403 otherwise)
- Stage 1 requires IN_EXECUTION or CONTRACT_SIGNED; Stage 2 requires DELIVERED or IN_EXECUTION
- Tracks stage completion via Activity log search (action=SETTLEMENT_APPROVED + metadata contains STAGE1/STAGE2)
- When both STAGE1 + STAGE2 approved → Trade.status = `SETTLED`, phase = 6
- Creates Activity log `SETTLEMENT_APPROVED` (metadata JSON `{stage, feeLockStatus}`)
- Creates TimelineEvent (phase 6, completed)
- Smart Inbox to counterparty (priority 70) on partial; to both parties (priority 80, "Settlement approved - trade complete") when both stages complete
- Returns `{ ok, ustn, stage, tradeStatus, feeLockStatus, bothStagesComplete, message }`

### 7. `src/app/api/sgtx/workflow/advance/route.ts`
- POST /api/sgtx/workflow/advance — Convenience endpoint that advances a trade to the next phase
- Body: `{ ustn, action, ...action-specific fields }`
- action values: `ACCEPT_QUOTE | LOCK_CONTRACT | CONFIRM_MILESTONE | APPROVE_SETTLEMENT`
- Looks up phase mapping per action, builds inner request body, calls the phase-specific API via `fetch(innerUrl, ...)` (server-to-server)
- Returns `{ ok, action, ustn, currentPhase, nextPhase, tradeStatus, message, innerResponse }`
- Inner API errors propagate with the inner status code

## UI Wiring in `src/components/portals/PortalContent.tsx`

### QuoteReviewScreen (Phase 2→3)
- Now uses **real** trade data from `data.tradesAsBuyer` filtered to status QUOTED/NEGOTIATING/INITIATED. Falls back to the original demo delivery options if no real quoted trades exist.
- Each real trade becomes a row with the actual USTN, destPort, tradeValueUsd, sgtxFeeUsd, and computed transit days from `shipments[0].eta`.
- Accept button: calls `POST /api/sgtx/quote/accept` with `{ ustn, deliveryPort }`. Shows loading state, disables button while accepting, shows "Accepted" badge after success, displays success toast "Quote accepted - proceed to contract signing", invalidates `["dashboard"]` query, auto-navigates to contract tab after 800ms.
- Demo rows (ustn=null) trigger local `setMutualConfirmed(true)` only with a "demo" toast.
- "Proceed to Contract" button in the Mutual Confirmation card now calls `setActiveTab("contract")` to navigate to the Contract Signing tab.

### ContractSigningScreen (Phase 3)
- Accepts optional `data` prop (now `<ContractSigningScreen data={data} />` in both trader-buyer and trader-seller portals).
- Adds a trade selector at the top: lists all trades with status QUOTE_ACCEPTED/QUOTED/NEGOTIATING/INITIATED from `data.tradesAsBuyer`. Falls back to seeded TRADE_USTN if no real trades.
- `activeUstn`, `activeBuyerGtid`, `activeSellerGtid` derived from the selected trade (with fallback to seeded GTIDs).
- **payFee** (was: `setTimeout` fake) → now calls `POST /api/sgtx/payment/pay` with `{ ustn: activeUstn, stage: "STAGE1", pspProvider: "FAWRY" }`. On success: `setFeePaid(true)`, toast "Fee paid - FeeLock ACTIVE", invalidate dashboard query.
- **Buyer/Seller Sign buttons** (was: local `setBuyerSigned(true)`/`setSellerSigned(true)`) → now call `signContract("BUYER")` / `signContract("SELLER")` which posts to `POST /api/sgtx/contract/sign` with `{ ustn, signerGtid, signerRole, signatureType: "QES" }`. Shows loading state per role, toast "BUYER signed via QES" with legal effect + document hash.
- **canLock section** (was: static "Contract LOCKED" message when canLock became true) → now shows three states:
  - `contractLocked && lockedUstn` → green "Contract LOCKED" card with the real USTN from the API response + post-lock actions list
  - `canLock` (all 4 conditions true but not yet locked) → gold "Ready to Lock Contract" card with a real **Lock Contract** button calling `POST /api/sgtx/contract/lock` with `{ ustn, buyerSigned, sellerSigned, feePaid, releaseAcknowledged }`. On success: `setContractLocked(true)`, `setLockedUstn(activeUstn)`, toast "Contract LOCKED", invalidate dashboard.
  - Otherwise → amber warning showing which conditions are missing.
- buyerSigned and sellerSigned now default to `false` (was: buyerSigned=true, sellerSigned=false). The user must click both Sign buttons to actually sign via the QES API.

### ShipmentsMilestoneScreen (NEW — Phase 5)
- New exported component for the `milestones` tab.
- Lists all trades with status CONTRACT_SIGNED/IN_EXECUTION/DELIVERED/SETTLED via a Select dropdown.
- Fetches milestone data via `useQuery(["milestones", selectedUstn], ...)` hitting `GET /api/sgtx/milestones?ustn=...`.
- Renders a timeline of all 6 milestones with:
  - Status icon (green CheckCircle2 if CONFIRMED, Clock if PENDING)
  - Label + status (CONFIRMED shows confirmedAt timestamp; PENDING shows expected shipment status)
  - Per-shipment status badges (multi-shipment aware)
  - "Confirm" button (gold, with loading state) on the next PENDING milestone — calls `POST /api/sgtx/milestone/confirm`
  - "Queued" badge on later PENDING milestones (must be confirmed in order)
- Trade status summary card at the top (status badge + phase + shipment count + USTN).
- On confirm success: invalidates both `["milestones", selectedUstn]` and `["dashboard"]` queries, shows toast.

### SettlementScreen (NEW — Phase 6)
- New exported component for the `settlement` tab (replaces the old static "Settlement instructions auto-generated" placeholder).
- Lists all trades with status IN_EXECUTION/DELIVERED/SETTLED via a Select dropdown.
- Shows the USTN prominently.
- Two settlement approval cards in a 2-column grid:
  - Stage 1 Settlement button → `POST /api/sgtx/settlement/approve` with `{ ustn, approverGtid: tenantGtid, stage: "STAGE1" }`
  - Stage 2 Settlement button → same API with `stage: "STAGE2"`
  - Each button has its own loading state and toast.
- Bonus "One-click Workflow Advance" card → calls `POST /api/sgtx/workflow/advance` with `{ ustn, action: "APPROVE_SETTLEMENT", approverGtid, stage: "STAGE2" }` to demonstrate the convenience endpoint.
- Non-custodial explainer text below.

## Portal Config Changes (`src/lib/sgtx/portal-config.ts`)
- trader-buyer: added `{ id: "milestones", label: "Milestone Tracking", icon: PackageCheck, group: "Trade" }` and `{ id: "settlement", label: "FX & Settlement", icon: Banknote, group: "Finance" }` to tabs.
- trader-seller: same two tabs added.
- Both new tabs use the existing `PackageCheck` and `Banknote` Lucide icons (already imported).

## PortalContent Dispatcher Changes
- Added `milestones` and `settlement` to the **universal** dispatcher (so any portal with those tab IDs gets the right screen, including bank/pfi which previously had a static settlement placeholder).
- Bank/PFI `settlement` tab now returns `<SettlementScreen data={data} />` instead of the static placeholder.
- Removed the duplicate `milestones` dispatches from trader-buyer and trader-seller specific blocks (now handled universally).
- `<ContractSigningScreen />` calls updated to `<ContractSigningScreen data={data} />` in both trader-buyer and trader-seller blocks.

## Verification

### Lint (final)
```
npx eslint src/app/api/sgtx/contract/ src/app/api/sgtx/quote/accept/ src/app/api/sgtx/milestone/ src/app/api/sgtx/milestones/ src/app/api/sgtx/settlement/ src/app/api/sgtx/workflow/ src/components/portals/PortalContent.tsx src/lib/sgtx/portal-config.ts
→ EXIT: 0 (zero errors, zero warnings)
```

### TypeScript (final, filtered to my files)
```
npx tsc --noEmit --skipLibCheck 2>&1 | grep -E "src/app/api/sgtx/(contract|quote/accept|milestone|settlement|workflow)|src/components/portals/PortalContent.tsx|src/lib/sgtx/portal-config.ts"
→ no output (0 errors in my files)
```

### Schema
- No Prisma schema changes needed — all required models already exist (Trade, Shipment, TimelineEvent, Activity, InboxItem, QesSignature, FeeLock).
- `bun run db:push` confirmed: "The database is already in sync with the Prisma schema."

## End-to-End Flow Verification (per task spec)

The full workflow is now wired:
1. `POST /api/sgtx/trade-request` → status **INITIATED** (existing, unchanged)
2. `POST /api/sgtx/quote/submit` → status **QUOTED** (existing, unchanged)
3. `POST /api/sgtx/quote/accept` → status **QUOTE_ACCEPTED** (NEW)
4. `POST /api/sgtx/contract/sign` (buyer + seller) → QesSignature records created (NEW)
5. `POST /api/sgtx/payment/pay` (stage 1 fee) → FeeLock **ACTIVE** (existing, unchanged)
6. `POST /api/sgtx/contract/lock` → status **CONTRACT_SIGNED** (NEW)
7. `POST /api/sgtx/milestone/confirm` (×6) → shipment progresses LOADED → DELIVERED, trade **IN_EXECUTION** (NEW)
8. `POST /api/sgtx/settlement/approve` (×2 stages) → FeeLock **RELEASED**, trade **SETTLED** (NEW)

Plus convenience endpoint `POST /api/sgtx/workflow/advance` calls any of the above phase-specific APIs by `action`.

## Files Created
- `src/app/api/sgtx/contract/lock/route.ts` (102 lines)
- `src/app/api/sgtx/contract/sign/route.ts` (104 lines)
- `src/app/api/sgtx/quote/accept/route.ts` (87 lines)
- `src/app/api/sgtx/milestone/confirm/route.ts` (123 lines)
- `src/app/api/sgtx/milestones/route.ts` (104 lines)
- `src/app/api/sgtx/settlement/approve/route.ts` (141 lines)
- `src/app/api/sgtx/workflow/advance/route.ts` (114 lines)

## Files Modified
- `src/components/portals/PortalContent.tsx`:
  - QuoteReviewScreen: replaced hardcoded `deliveryOptions` with real-trade-derived rows; Accept button wired to `/api/sgtx/quote/accept`; "Proceed to Contract" calls `setActiveTab("contract")`.
  - ContractSigningScreen: accepts `data` prop; new trade selector; `payFee` calls `/api/sgtx/payment/pay`; new `signContract(role)` calls `/api/sgtx/contract/sign`; new `lockContract()` calls `/api/sgtx/contract/lock`; canLock section shows "Lock Contract" button when ready, "Contract LOCKED" card with real USTN after success.
  - NEW ShipmentsMilestoneScreen component (Phase 5 milestone confirmation UI with timeline + Confirm buttons).
  - NEW SettlementScreen component (Phase 6 settlement approval UI with Stage 1 / Stage 2 / Workflow Advance buttons).
  - Dispatcher: added universal `milestones` and `settlement` tab routes; ContractSigningScreen calls updated to pass `data` prop.
- `src/lib/sgtx/portal-config.ts`: added `milestones` and `settlement` tabs to trader-buyer and trader-seller portal configs.

## Dev Server Note
The auto-started `bun run dev` server was not running during my verification session (port 3000 returned HTTP 000, no Next.js process in `ps`). The system instruction says `bun run dev` is auto-managed and I should NOT run it manually. All verification was done via `npx eslint` (exit 0) and `npx tsc --noEmit --skipLibCheck` (0 errors in my files). The Next.js dev server should hot-reload my changes when the user starts it.

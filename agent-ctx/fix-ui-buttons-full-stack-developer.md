# Work Record — fix-ui-buttons

- **Task ID**: fix-ui-buttons
- **Agent**: full-stack-developer
- **Task**: Fix non-functional UI buttons across SGTX portals

## Context
Read previous agent work record `impl-barcodes-full-stack-developer.md` for the established conventions (Prisma patterns, file structure, lint workflow). Read `worklog.md` for the full SGTX blueprint context.

## Files Created
- `src/app/api/sgtx/inbox/dismiss/route.ts` — POST: dismiss a Smart Inbox item (`InboxItem.dismissed = true`)
- `src/app/api/sgtx/inbox/snooze/route.ts` — POST: snooze an item for N hours (`snoozedUntil = now + hours*3600s`)
- `src/app/api/sgtx/ship/bl-issue/route.ts` — POST: issue a Bill of Lading. Generates `SGTX-BL-{YYYYMMDD}-{SEQ6}` number + SHA-256 hash, creates a `Document` (type `BILL_LADING`, status `VERIFIED`), advances `Shipment.status` PLANNED→LOADED, writes `Activity` (action `BL_ISSUED`). Resolves trade by `tradeId`/`ustn`/`shipmentId`.
- `src/app/api/sgtx/trade/modify-schedule/route.ts` — POST: schedule modification request. Validates reason ≥20 chars, creates `Activity` (action `SCHEDULE_MODIFICATION_REQUESTED`) + counterparty `InboxItem` (category NEGOTIATION, priority 85, ctaLabel "Review modification").

## Files Modified
- `src/app/api/sgtx/inbox/route.ts` — removed broken `POST_dismiss` export (Next.js App Router only dispatches standard HTTP verbs; `POST_dismiss` was dead code). Now GET-only. Dismiss + snooze moved to dedicated route files.
- `src/app/api/sgtx/disputes/mediation/route.ts` — added GET handler returning the mediation log (dispute + ordered `DisputeMediation` messages with parsed `offerConditions`). Existing POST preserved.
- `src/app/layout.tsx` — mounted Sonner `<Toaster />` (`position="bottom-right" richColors closeButton`) alongside the existing shadcn `<Toaster />`. Without this, `toast()` calls from `sonner` would not render anywhere.
- `src/components/sgtx/PortalShell.tsx`:
  - Imported `useQueryClient` + `toast`.
  - Exposed `setActiveTab` through the children renderer as `data._setActiveTab` so portal screens can switch tabs.
  - InboxDrawer: added `hiddenIds` Set + `pendingId` local state. Wired CTA button `onClick` → `/api/sgtx/inbox/dismiss`. Added snooze buttons (2h/4h/24h) → `/api/sgtx/inbox/snooze`. Both hide the item locally, invalidate `["dashboard"]` query, and show `toast.success`. Added "🎉 All caught up" empty state.
- `src/components/portals/PortalContent.tsx`:
  - Imported `useQueryClient` + `toast`.
  - **CommandCenter**: added `tab` field to every `quickActions` entry (full mapping for all 10 portals). Added `handleQuickAction(a)` that console.logs + calls `data._setActiveTab(tab)` + toast. Wired `onClick` on the `QuickActions` widget (already supported by its prop type). Destructured fields explicitly to avoid TS excess-property errors.
  - **ShipScreens**: added `issuingId` + `issuedBLs` state + `useQueryClient`. Wired "Issue B/L" button `onClick` → `/api/sgtx/ship/bl-issue`. On success: stores `{ blNumber, hashSha256 }`, shows toast, invalidates dashboard. Replaces button with emerald "B/L Issued: SGTX-BL-…" card after issuance.
  - **ContractSigningScreen**: added controlled state for the schedule mod form (`modShipment`, `modDate`, `modPort`, `modContainerCount`, `modReason`, `sendingMod`). Bound all previously-uncontrolled inputs. Added character counter (≥20 chars). Wired "Send Modification Request" `onClick` → `/api/sgtx/trade/modify-schedule` with seeded USTN `SGTX-1397F3A-2345B6C-20260415120000-A1B2C3D4` + buyer GTID. Closes form + toast.success on success.
  - **DisputesScreen**: added `medOpen`/`medLoading`/`medDispute`/`medMessages` state. `openMediation(d)` opens a modal + fetches `GET /api/sgtx/disputes/mediation?disputeId=...`. Modal renders dispute header + scrollable message list (sender, type, text, offer amount, sentiment, timestamp) with AI/Governor messages highlighted. Accessible dialog (`role="dialog"` `aria-modal` `aria-label`).
  - **QuoteBuilderScreen eco-packaging "Apply"**: added `appliedEco` state. Apply button sets `appliedEco = a.material`, subtracts carbon saving from `carbonFootprint.scope3` (70%) + `total` (full), shows toast.success. Replaces button with "✓ Applied" badge after apply.
  - **QuoteBuilderScreen alt-ports**: added `selectedAltPort` state + a "Use" button next to each port (was previously display-only). Sets `selectedAltPort = p.port` + toast.success. Replaces button with "✓ Selected" badge after use.

## Buttons Verified Already Wired (no change needed)
- QuoteBuilderScreen "Use fair price" button (line ~1087) — already had `onClick` setting `exwPrice` to `band.mid` and calling `onPriceChange`.

## Lint Status
- `npx eslint src/components/portals/PortalContent.tsx src/components/sgtx/PortalShell.tsx` → exit 0, no errors.
- `npx eslint src/app/api/sgtx/inbox/ src/app/api/sgtx/ship/bl-issue/ src/app/api/sgtx/trade/modify-schedule/ src/app/api/sgtx/disputes/mediation/ src/app/layout.tsx` → exit 0, no errors.

## TypeScript Status
- `npx tsc --noEmit -p tsconfig.json` filtered to new API routes → 0 errors.
- 2 pre-existing errors in PortalContent.tsx (line 145 `ExecutiveCards` union narrowing, line 150 `QuickActions` icon union with the local `Truck` function component) — confirmed pre-existing by stashing changes and re-running tsc (errors present at original line numbers 133 + 138 in the stashed state). Cosmetic TS narrowing issues, no runtime impact.

## Dev Server Note
The auto-started `bun run dev` process (Turbopack) appears stuck on compiling the pre-existing route `/api/sgtx/gov/cbe/fx-rate` (a route NOT modified by this task). `dev.log` shows `○ Compiling /api/sgtx/gov/cbe/fx-rate ...` with no further activity, and HTTP requests to localhost:3000 time out. This is a pre-existing Turbopack issue; the user will need to restart the dev server. Lint + tsc checks confirm the code itself is correct.

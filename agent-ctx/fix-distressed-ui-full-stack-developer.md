# Task ID: fix-distressed-ui
**Agent**: full-stack-developer
**Task**: Fix Distressed Cargo UI to call new API endpoints

## Context
- Read `/home/z/my-project/worklog.md` for project context (SGTX platform, distressed backend already built in P12-GAP-IMPL batch).
- Located the existing 30-line hardcoded `DistressedCargoScreen` in `/home/z/my-project/src/components/portals/PortalContent.tsx` (originally lines 1826-1859).
- Audited all 5 distressed API routes (`/declare`, `/assess`, `/outreach`, `/accept-offer`, `/listings`) to learn their request/response contracts.
- Verified `DistressedCargoListing` Prisma model: `tradeId` and `sellerGtid` are plain `String` fields (no FK constraint), so a demo `tradeId="SGTX-DEMO-TRADE-001"` and the spec'd seller GTID `SGTX-EG-TRD-002139-7F3A` work without a parent Trade row.

## Implementation
### Imports added to PortalContent.tsx header
- `Slider` from `@/components/ui/slider` (condition score slider)
- `ScrollArea` from `@/components/ui/scroll-area` (long listings list)
- 4 new lucide-react icons: `HeartHandshake` (DONATE triage card), `Trash2` (ABANDON triage card), `Megaphone` (Start Outreach button), `Tag` (offer count badge)

### New `DistressedCargoScreen` (~410 lines, replacing the 30-line stub)
Module-level constant `DISTRESSED_SELLER_GTID = "SGTX-EG-TRD-002139-7F3A"`.

**Triage dashboard** (top, full-width): 3 info cards (Sell / Donate / Abandon) with role-appropriate icons + colour-coded left borders + one-sentence triage rules mirroring the API's `discountBandFor` + `recommendedAction` heuristics (≥50 → SELL, 30-49 → DONATE, <30 → ABANDON).

**Two-column layout** (`grid grid-cols-1 lg:grid-cols-2 gap-4`):

**Left card — Declare Distressed Cargo form:**
- Trade USTN input (default `SGTX-1397F3A-2345B6C-20260415120000-A1B2C3D4`)
- Commodity input (default "Frozen Strawberries IQF")
- Quantity (kg) number input (default 18000)
- Condition Score slider 0-100 (default 80) with live colour badge (green ≥80, amber ≥50, red <50)
- Condition Notes textarea (default demo cold-chain narrative)
- Original Value (USD) number input (default 24000)
- Privacy Level Select (ANONYMOUS / DISCLOSED, default ANONYMOUS)
- "Declare Distressed" gold-gradient button → `POST /api/sgtx/distressed/declare`
- On success → AI assessment result card (suggested price, discount %, band, pricing rationale, full condition narrative, listingId, privacy) + toast.success + invalidate listings query
- On failure → red AlertTriangle error block + toast.error

**Right card — Active Listings:**
- Fetched via `useQuery({ queryKey: ["distressed-listings", sellerGtid], queryFn: () => fetch("/api/sgtx/distressed/listings?sellerGtid=...") })`
- Three states: `isLoading` (Loader2 spinner), `error` (red AlertTriangle alert), empty (friendly "No distressed listings yet" card)
- Listings wrapped in `ScrollArea` (`max-h-[640px]`)

**Each listing card** (`border-l-4` coloured by condition score):
- Commodity + truncated USTN header + status badge (colour-coded)
- 4-col grid: Quantity, Condition (live colour badge), Original value, Suggested price (gold)
- Inline badges: privacy level (Lock), microUSTN (when present, monospace), offer count (Tag)
- Condition notes (truncated `line-clamp-2`)
- **Per-listing action buttons:**
  - "AI Assess" (Sparkles) → `POST /assess` → inline expanding gold-bordered section with AI narrative + 3-col action/suggested$/discount grid + rationale italic; ✕ close button; spinner during call
  - "Start Outreach" (Megaphone) → `POST /outreach` → toast.success with contacted count, or toast.warning when 0 saved contacts
  - Offer count Badge
- **Offers section** (auto-rendered when listing has offers — listings response includes them ordered by amount desc):
  - Header "Offers (top first)" + one row per offer showing amount, buyer GTID (monospace), EXPRESS flag (gold ⚡)
  - PENDING offers on non-locked listings show gold-gradient "Accept" button (CheckCircle2) → `POST /accept-offer` → spinner + toast.success with microUSTN + distressed fee + invalidate listings query
  - Non-pending offers show a status badge (ACCEPTED green, REJECTED red, others grey)

## State management
- `useState`: form fields + per-listing/per-offer action maps (`assessments`, `assessingId`, `assessError`, `assessOpenId`, `outreachPending`, `acceptPending`)
- `useQuery`: listings fetch with seller-GTID-scoped queryKey
- `useQueryClient().invalidateQueries({ queryKey: ["distressed-listings", DISTRESSED_SELLER_GTID] })` after every successful mutation
- `toast` from `sonner`: success / warning / error variants with descriptive descriptions

## Theme
Matched the existing SGTX gold/sovereign palette:
- `bg-gold-gradient text-sovereign` for primary CTAs
- `bg-gold/15 text-gold border-gold/30` for accent badges
- `bg-gold/5 border-gold/30` for AI result panels
- `font-display` for headings
- Tight `text-[0.6rem]/[0.65rem]/[0.7rem]` typography hierarchy matching the existing portal screens

## Verification
- **ESLint** (per task spec): `cd /home/z/my-project && npx eslint src/components/portals/PortalContent.tsx 2>&1 | tail -10` → EXIT 0, 0 errors, 0 warnings.
- **TypeScript** (sanity check, not required): `npx tsc --noEmit` filtered to PortalContent.tsx shows only the 2 pre-existing cosmetic union-narrowing errors at lines 148 & 153 (ExecutiveCards + QuickActions icon union with the local `Truck` function component at line 185). These were present before this task — confirmed by the fix-ui-buttons worklog entry which documented them at the original line numbers 145 & 150 (shifted by +3 because I added the Slider + ScrollArea imports). No new TS errors introduced.
- **Dev log**: server running on port 3000, responsive ("GET / 200 in 745ms"). No errors related to distressed routes or PortalContent.

## Files modified
- `/home/z/my-project/src/components/portals/PortalContent.tsx`:
  - Added 3 shadcn/ui imports (Slider, ScrollArea) + 4 lucide-react icons (HeartHandshake, Trash2, Megaphone, Tag) to header
  - Replaced the 30-line `DistressedCargoScreen` stub with a ~410-line fully functional implementation
  - Defined module-level constant `DISTRESSED_SELLER_GTID`

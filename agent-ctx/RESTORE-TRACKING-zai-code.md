# Work Record — Task RESTORE-TRACKING

**Agent:** Z.ai Code (main)
**Task ID:** RESTORE-TRACKING
**Date:** 2026-06-25

## Objective
Recreate files lost during a git rollback in the SGTX trade platform. Restore the vessel + container tracking layer (AIS Stream + Terminal49 + unified USTN tracking endpoint + PortalContent screen) and add backup/restore scripts.

## Files Created / Modified

### Created (8 new files)
1. `src/lib/sgtx/ai/container-tracking.ts` — Terminal49 container tracking library with simulation fallback.
2. `src/app/api/sgtx/vessel-tracking/route.ts` — POST refreshes vessel positions, GET lists/searches vessels.
3. `src/app/api/sgtx/vessel-tracking/[ustn]/route.ts` — GET returns full vessel tracking for a USTN.
4. `src/app/api/sgtx/container-tracking/route.ts` — POST tracks all shipments' containers (GET returns 405 with hint).
5. `src/app/api/sgtx/container-tracking/[ustn]/route.ts` — GET returns container tracking for a specific shipment by USTN.
6. `src/app/api/sgtx/ustn/[ustn]/tracking/route.ts` — Unified USTN tracking endpoint connecting ALL tracking systems.
7. `/home/z/sgtx-auto-backup.sh` — git commit + tarball snapshot + pruning.
8. `/home/z/sgtx-restore.sh` — one-command restore from latest backup with pre-restore safety backup.

### Modified (2 files)
1. `src/lib/sgtx/ai/vessel-tracking.ts` — APPENDED (lines 421-623) AIS Stream integration:
   - `AISPosition` interface
   - `fetchAISPosition(imo)` function (queries https://api.aisstream.io/v1/search?imo={imo} with `Bearer {AIS_STREAM_API_KEY}`, 8s timeout)
   - `fetchAISPositions(imos[])` batch wrapper (concurrency 5)
   - `trackVesselWithAIS(input)` — unified entry point that overlays live AIS data onto the simulated result, falls back to `trackVessel()` when API unavailable.
   - **Did NOT modify any of the existing 420 lines.**

2. `src/components/portals/PortalContent.tsx`:
   - Added imports: `ALL_COUNTRY_CODES` from `@/lib/sgtx/onboarding/countries`, `getPortStringsForCountry` from `@/lib/sgtx/onboarding/worldwide-ports`.
   - Replaced hardcoded 34-country `portsByCountry` record with derived map iterating ALL_COUNTRY_CODES.
   - Replaced both hardcoded country arrays (origin + destination selectors) with `ALL_COUNTRY_CODES` mapped to `<SelectItem value={co.code}>{co.code} · {co.name}</SelectItem>` (with `max-h-72 overflow-y-auto`).
   - Added `VesselTrackingScreen` component — pulls unified tracking payload from `/api/sgtx/ustn/[ustn]/tracking`, renders summary flags, trade meta, per-shipment panels with vessel position + AI ETA + schedule + container tracking + cold chain monitoring.
   - Added `ContainerTrackingCard` sub-component (exported) — Terminal49 container tracking display with status badges, stat grid, event timeline.
   - Added `ShipmentTrackingPanel` helper (vessel + AI ETA + schedule + container + cold chain).
   - Added `PosStat` + `SummaryFlag` stat helpers.
   - Wired the shipments tab to render `VesselTrackingScreen` above the existing `ShipmentsVault`.

## API Keys (verified in .env)
- `AIS_STREAM_API_KEY=b64bab18c2aa9c1a943e4f9d55f22f194d2745fe`
- `TERMINAL49_API_KEY=c6Xi41zN4iWXMXVx5TcA7Wwr`

## Next.js 16 Async Params Pattern
All `[ustn]` route handlers use:
```ts
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ ustn: string }> },
) {
  const { ustn } = await context.params;
  ...
}
```

## Verification
- `bun run lint`: clean (only 2 pre-existing errors in scripts/seed-roro-schedules.cjs and upload/buyer.jsx — both unrelated and present in prior worklog entries).
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` → 200.
- API smoke tests all returned 200:
  - `GET /api/sgtx/vessel-tracking` → 31 vessels.
  - `GET /api/sgtx/vessel-tracking?q=MSC OSCAR` → 1 match.
  - `POST /api/sgtx/vessel-tracking` → processed 3 of 4 in-transit shipments, persisted lat/lng/eta.
  - `GET /api/sgtx/vessel-tracking/{ustn}` → 2 shipments with vessel tracking + AI ETA.
  - `GET /api/sgtx/container-tracking/{ustn}` → 2 containers with simulated tracking + 5 events each.
  - `GET /api/sgtx/ustn/{ustn}/tracking` → unified payload: master + 2 shipments + summary.
- Outbound network to api.aisstream.io and api.terminal49.com is blocked by the sandbox; both libraries correctly fall back to simulation (source field transparently flags `SIMULATED` vs `TERMINAL49`/`AIS_STREAM`). Live paths will activate automatically when deployed to a network with internet egress.

## Worklog
Appended a detailed work record to `/home/z/my-project/worklog.md` (Task ID: RESTORE-TRACKING).

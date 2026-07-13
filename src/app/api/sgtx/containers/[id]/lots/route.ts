import { NextRequest, NextResponse } from "next/server";
import {
  assignLotToContainer,
  getLotsForContainer,
  validateLotAssignment,
  type LotAwarePackingListEntry,
} from "@/lib/sgtx/packing/lot-management";

export const dynamic = "force-dynamic";

/** Params type for the `/api/sgtx/containers/[id]/lots` dynamic segment. */
type ContainerLotsRouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/sgtx/containers/[id]/lots
 *
 * Returns all lots assigned to a container, each with its pallets. The
 * structured view is:
 *   ```
 *   {
 *     containerId: string,
 *     lots: [{ lot, pallets: [...] }]
 *   }
 *   ```
 *
 * Useful for the packing plan UI — a container may hold multiple lots (e.g.
 * lot A on pallets 1-5, lot B on pallets 6-10) and this endpoint surfaces
 * that grouping directly.
 */
export async function GET(_req: NextRequest, { params }: ContainerLotsRouteParams) {
  try {
    const { id } = await params;

    const lots = await getLotsForContainer(id);

    // Convert each lot into the structured view. Pallets are already included
    // by getLotsForContainer.
    const entries: LotAwarePackingListEntry[] = lots.map((lot) => ({
      lot: {
        id: lot.id,
        lotNumber: lot.lotNumber,
        commodity: lot.commodity,
        originCountry: lot.originCountry,
        status: lot.status,
      },
      containerId: lot.containerId,
      shipmentId: lot.shipmentId,
      pallets: lot.pallets.map((p) => ({
        id: p.id,
        sscc: p.sscc,
        palletId: p.palletId,
        totalCartons: p.totalCartons,
        netWeightKg: p.netWeightKg,
        grossWeightKg: p.grossWeightKg,
        loaded: p.loaded,
      })),
    }));

    return NextResponse.json({
      ok: true,
      containerId: id,
      lotCount: entries.length,
      lots: entries,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/sgtx/containers/[id]/lots
 *
 * Validate (and optionally assign) a lot to this container. Body:
 *   - `{ lotId, validateOnly?: boolean }`
 *
 * If `validateOnly` is true (default), only validation is performed and the
 * lot is NOT assigned. Set `validateOnly: false` to also persist the
 * assignment.
 */
export async function POST(req: NextRequest, { params }: ContainerLotsRouteParams) {
  try {
    const { id } = await params;
    const body = (await req.json()) as { lotId?: string; validateOnly?: boolean };

    if (!body.lotId) {
      return NextResponse.json({ error: "lotId is required" }, { status: 400 });
    }

    const result = await validateLotAssignment(body.lotId, id);

    if (result.valid && body.validateOnly === false) {
      const updated = await assignLotToContainer(body.lotId, id);
      return NextResponse.json({ ok: true, valid: true, assigned: true, lot: updated });
    }

    return NextResponse.json({
      ok: result.valid,
      valid: result.valid,
      assigned: false,
      errors: result.errors,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

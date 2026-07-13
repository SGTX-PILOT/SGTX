import { NextRequest, NextResponse } from "next/server";
import { getLotSummary } from "@/lib/sgtx/packing/lot-management";

export const dynamic = "force-dynamic";

/** Params type for the `/api/sgtx/lots/[id]/summary` dynamic segment. */
type LotSummaryRouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/sgtx/lots/[id]/summary
 *
 * Returns an aggregated summary of the lot: pallet count, total cartons,
 * total net/gross weight, the assigned container & shipment IDs, and the
 * list of pallets.
 */
export async function GET(_req: NextRequest, { params }: LotSummaryRouteParams) {
  try {
    const { id } = await params;
    const summary = await getLotSummary(id);
    if (!summary) {
      return NextResponse.json({ error: `Lot ${id} not found` }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

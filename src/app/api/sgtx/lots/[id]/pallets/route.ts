import { NextRequest, NextResponse } from "next/server";
import {
  bulkAssignPalletsToLot,
  getPalletsForLot,
} from "@/lib/sgtx/packing/lot-management";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Params type for the `/api/sgtx/lots/[id]/pallets` dynamic segment. */
type LotPalletsRouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/sgtx/lots/[id]/pallets
 *
 * List all pallets assigned to a lot.
 */
export async function GET(_req: NextRequest, { params }: LotPalletsRouteParams) {
  try {
    const { id } = await params;

    const lot = await db.lot.findUnique({
      where: { id },
      select: { id: true, lotNumber: true },
    });
    if (!lot) {
      return NextResponse.json({ error: `Lot ${id} not found` }, { status: 404 });
    }

    const pallets = await getPalletsForLot(id);
    return NextResponse.json({
      ok: true,
      lotId: id,
      lotNumber: lot.lotNumber,
      count: pallets.length,
      pallets,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/sgtx/lots/[id]/pallets
 *
 * Assign one or more pallets to a lot. Body may be either:
 *   - `{ palletId: string }` (single)
 *   - `{ palletIds: string[] }` (multiple — preferred for bulk operations)
 *
 * Pallets whose USTN does not match the lot's USTN are reported in `skipped`.
 */
export async function POST(req: NextRequest, { params }: LotPalletsRouteParams) {
  try {
    const { id } = await params;
    const body = (await req.json()) as {
      palletId?: string;
      palletIds?: string[];
    };

    const lot = await db.lot.findUnique({
      where: { id },
      select: { id: true, lotNumber: true, ustn: true },
    });
    if (!lot) {
      return NextResponse.json({ error: `Lot ${id} not found` }, { status: 404 });
    }

    const palletIds = Array.isArray(body.palletIds) && body.palletIds.length > 0
      ? body.palletIds
      : body.palletId
        ? [body.palletId]
        : [];

    if (palletIds.length === 0) {
      return NextResponse.json(
        { error: "Body must include `palletId` or `palletIds`" },
        { status: 400 },
      );
    }

    const result = await bulkAssignPalletsToLot(palletIds, id);
    return NextResponse.json({
      ok: true,
      lotId: id,
      lotNumber: lot.lotNumber,
      assigned: result.assigned,
      skipped: result.skipped,
      assignedCount: result.assigned.length,
      skippedCount: result.skipped.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

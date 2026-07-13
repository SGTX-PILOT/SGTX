import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bulkAssignPalletsToLot } from "@/lib/sgtx/packing/lot-management";

export const dynamic = "force-dynamic";

/** Single assignment pair: a pallet goes to a lot. */
interface BulkAssignment {
  palletId: string;
  lotId: string;
}

/** Request body for the bulk-assign endpoint. */
interface BulkAssignBody {
  assignments: BulkAssignment[];
}

/**
 * POST /api/sgtx/lots/bulk-assign
 *
 * Bulk-assign many pallets to many lots in a single request. Each
 * assignment is validated individually — failures are isolated and reported
 * in the response, so a single bad USTN match does not roll back the entire
 * batch.
 *
 * Body:
 *   ```
 *   { assignments: [{ palletId, lotId }, ...] }
 *   ```
 *
 * Response:
 *   ```
 *   {
 *     ok: true,
 *     total: number,
 *     assignedCount: number,
 *     skippedCount: number,
 *     results: [{ palletId, lotId, ok: boolean, reason?: string }]
 *   }
 *   ```
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as BulkAssignBody | { assignments?: BulkAssignment[] };

    const assignments = Array.isArray(body?.assignments) ? body.assignments : [];
    if (assignments.length === 0) {
      return NextResponse.json(
        { error: "Body must include `assignments: [{ palletId, lotId }, ...]`" },
        { status: 400 },
      );
    }

    // Group by lotId so each lot only needs a single DB lookup.
    const byLot = new Map<string, string[]>();
    for (const a of assignments) {
      if (!a.palletId || !a.lotId) {
        continue;
      }
      if (!byLot.has(a.lotId)) byLot.set(a.lotId, []);
      byLot.get(a.lotId)!.push(a.palletId);
    }

    const results: Array<{
      palletId: string;
      lotId: string;
      ok: boolean;
      reason?: string;
    }> = [];

    for (const [lotId, palletIds] of byLot.entries()) {
      // Verify the lot exists before delegating to bulkAssignPalletsToLot.
      const lotExists = await db.lot.findUnique({
        where: { id: lotId },
        select: { id: true },
      });
      if (!lotExists) {
        for (const pid of palletIds) {
          results.push({ palletId: pid, lotId, ok: false, reason: `lot ${lotId} not found` });
        }
        continue;
      }

      try {
        const r = await bulkAssignPalletsToLot(palletIds, lotId);
        const assignedSet = new Set(r.assigned);
        for (const pid of palletIds) {
          if (assignedSet.has(pid)) {
            results.push({ palletId: pid, lotId, ok: true });
          } else {
            const skip = r.skipped.find((s) => s.palletId === pid);
            results.push({
              palletId: pid,
              lotId,
              ok: false,
              reason: skip?.reason ?? "unknown reason",
            });
          }
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        for (const pid of palletIds) {
          results.push({ palletId: pid, lotId, ok: false, reason: message });
        }
      }
    }

    const assignedCount = results.filter((r) => r.ok).length;
    const skippedCount = results.length - assignedCount;

    return NextResponse.json({
      ok: true,
      total: results.length,
      assignedCount,
      skippedCount,
      results,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

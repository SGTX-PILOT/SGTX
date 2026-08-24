// @ts-nocheck
// POST /api/sgtx/jurisdiction/snapshot/[ustn]/validate
// Validates that the regulatory snapshot for this USTN is still consistent
// with the current state of the regulatory sources for its jurisdiction.
//
// Returns:
//   {
//     consistent: boolean,
//     changes: { field, snapshotValue, currentValue }[],
//     snapshot: RegulatorySnapshot | null,
//     gates: { G_J3, G_J4 }   // Governor gate results
//   }
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  validateSnapshotConsistency,
  getRegulatorySnapshot,
} from "@/lib/sgtx/jurisdiction";
import {
  gateRuleVersionConsistency,
  gateRegulatorySnapshot,
} from "@/lib/sgtx/governor/gates-jurisdiction";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ ustn: string }> },
) {
  try {
    const { ustn } = await params;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }

    const [consistency, snapshot] = await Promise.all([
      validateSnapshotConsistency(ustn),
      getRegulatorySnapshot(ustn),
    ]);

    const snapshotGate = gateRegulatorySnapshot(snapshot);
    const consistencyGate = gateRuleVersionConsistency(
      consistency.consistent,
      consistency.changes,
    );

    return NextResponse.json({
      ustn,
      consistent: consistency.consistent,
      changes: consistency.changes,
      snapshot,
      gates: {
        G_J3: snapshotGate,
        G_J4: consistencyGate,
      },
    });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/jurisdiction/snapshot/[ustn]/validate] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

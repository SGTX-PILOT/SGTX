// @ts-nocheck
// POST /api/sgtx/air/reconciliation/run
// Body: { ustn }
// Runs the air-cargo document consistency check (§37) and writes
// AirReconciliationEvent rows for any mismatches found.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { validateAirDocumentConsistency } from "@/lib/sgtx/air-cargo";

export const dynamic = "force-dynamic";

const RECON_TYPE_MAP: Record<string, string> = {
  "MAWB": "MAWB_MISMATCH",
  "HAWB": "HAWB_MISMATCH",
  "CargoPiece": "PIECE_MISMATCH",
  "FlightLeg": "FLIGHT_MISMATCH",
  "chargeableWeight": "CHARGEABLE_WEIGHT_MISMATCH",
  "shipment": "MANIFEST_MISMATCH",
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }

    // Run the consistency check
    const result = await validateAirDocumentConsistency(body.ustn);

    // Persist each mismatch as an AirReconciliationEvent
    let persisted = 0;
    for (const m of result.mismatches) {
      try {
        const fieldKey = (m.field || "").split(/[.\[]/)[0];
        const reconType = RECON_TYPE_MAP[fieldKey] || "MANIFEST_MISMATCH";
        await db.airReconciliationEvent.create({
          data: {
            ustn: body.ustn,
            reconciliationType: reconType as any,
            expectedValue: m.expected,
            actualValue: m.actual,
            status: "OPEN",
          },
        });
        persisted++;
      } catch (e: any) {
        logger.warn("[api/air/reconciliation/run] event persist failed", {
          error: e?.message,
          field: m.field,
        });
      }
    }

    logger.info("[api/air/reconciliation/run] POST complete", {
      ustn: body.ustn,
      mismatches: result.mismatches.length,
      persisted,
      consistent: result.consistent,
    });
    return NextResponse.json({
      ok: true,
      ustn: body.ustn,
      consistent: result.consistent,
      mismatchCount: result.mismatches.length,
      eventsPersisted: persisted,
      mismatches: result.mismatches,
    });
  } catch (err: any) {
    logger.error("[api/air/reconciliation/run] POST failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

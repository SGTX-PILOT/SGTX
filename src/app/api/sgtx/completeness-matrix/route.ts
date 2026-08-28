// @ts-nocheck
/**
 * SGTX Part 137 — Completeness Matrix API
 * GET /api/sgtx/completeness-matrix
 *   Returns: CompletenessMatrix (22 columns × 22 subsystems)
 * GET /api/sgtx/completeness-matrix?subsystem=<NAME>
 *   Returns: single MatrixRow
 */

import { NextRequest, NextResponse } from "next/server";
import {
  generateCompletenessMatrix,
  getMatrixRow,
  listTrackedSubsystems,
  COMPLETENESS_COLUMNS,
} from "@/lib/sgtx/completeness-matrix";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const subsystem = searchParams.get("subsystem");
    if (subsystem) {
      const row = await getMatrixRow(subsystem);
      if (!row) {
        return NextResponse.json(
          { ok: false, error: `subsystem "${subsystem}" not tracked`, tracked: listTrackedSubsystems() },
          { status: 404 },
        );
      }
      return NextResponse.json({ ok: true, row });
    }
    const matrix = await generateCompletenessMatrix();
    return NextResponse.json({
      ok: true,
      columns: COMPLETENESS_COLUMNS,
      matrix,
    });
  } catch (err: any) {
    logger.error("[api/completeness-matrix] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

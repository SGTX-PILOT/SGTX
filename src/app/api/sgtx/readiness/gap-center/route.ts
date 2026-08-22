// @ts-nocheck
// §7 Admin Gap Center — verify every non-connected catalog entry is correctly categorized.
// POST /api/sgtx/readiness/gap-center
//      → verifyAdminGapCenter() → returns GapCenterResult.
import { NextResponse } from "next/server";
import { verifyAdminGapCenter } from "@/lib/sgtx/production-readiness";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await verifyAdminGapCenter();
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error("[api/sgtx/readiness/gap-center] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

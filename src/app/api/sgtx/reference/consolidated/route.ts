// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getConsolidatedReferencePayload } from "@/lib/sgtx/reference/consolidated-reference";

export const dynamic = "force-dynamic";

// GET /api/sgtx/reference/consolidated — Internal SGTX Consolidated Reference mirror (v18 §15-§24)

export async function GET(req: NextRequest) {
  try {
    const payload = getConsolidatedReferencePayload();
    return NextResponse.json(
      {
        ...payload,
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "X-SGTX-Version": "v18.0",
        },
      },
    );
  } catch (e: any) {
    logger.error("[api/sgtx/reference/consolidated] error:", { error: e?.message || String(e) });
    return NextResponse.json({ error: "Consolidated reference metadata unavailable" }, { status: 503 });
  }
}

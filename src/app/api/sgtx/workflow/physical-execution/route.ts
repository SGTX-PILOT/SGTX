// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getPhysicalExecutionPayload } from "@/lib/sgtx/workflow/physical-execution";

export const dynamic = "force-dynamic";

// GET /api/sgtx/workflow/physical-execution — Internal SGTX Physical Execution mirror (v18 §12)

export async function GET(req: NextRequest) {
  try {
    const payload = getPhysicalExecutionPayload();
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
    logger.error("[api/sgtx/workflow/physical-execution] error:", { error: e?.message || String(e) });
    return NextResponse.json({ error: "Physical execution metadata unavailable" }, { status: 503 });
  }
}

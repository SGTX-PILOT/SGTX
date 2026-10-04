// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getCfrPayload } from "@/lib/sgtx/workflow/financing-preclearance";

export const dynamic = "force-dynamic";

// GET /api/sgtx/workflow/cfr — Internal SGTX CFR mirror (v18 §7)

export async function GET(req: NextRequest) {
  try {
    const payload = getCfrPayload();
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
    logger.error("[api/sgtx/workflow/cfr] error:", {
      error: e?.message || String(e),
    });
    return NextResponse.json(
      { error: "CFR metadata unavailable" },
      { status: 503 },
    );
  }
}

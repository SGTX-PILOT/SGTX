// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getSettlementPostTradePayload } from "@/lib/sgtx/workflow/settlement-posttrade";

export const dynamic = "force-dynamic";

// GET /api/sgtx/workflow/settlement — Internal SGTX Settlement mirror (v18 §13 + §14)

export async function GET(req: NextRequest) {
  try {
    const payload = getSettlementPostTradePayload();
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
    logger.error("[api/sgtx/workflow/settlement] error:", { error: e?.message || String(e) });
    return NextResponse.json({ error: "Settlement metadata unavailable" }, { status: 503 });
  }
}

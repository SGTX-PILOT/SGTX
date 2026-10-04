// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getSellerWorkflowPayload } from "@/lib/sgtx/workflow/seller-workflow";

export const dynamic = "force-dynamic";

// GET /api/sgtx/workflow/seller — Internal SGTX Seller Workflow mirror (v18 §8)

export async function GET(req: NextRequest) {
  try {
    const payload = getSellerWorkflowPayload();
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
    logger.error("[api/sgtx/workflow/seller] error:", { error: e?.message || String(e) });
    return NextResponse.json({ error: "Seller workflow metadata unavailable" }, { status: 503 });
  }
}

// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getBuyerWorkflowPayload } from "@/lib/sgtx/workflow/buyer-workflow";

export const dynamic = "force-dynamic";

// GET /api/sgtx/workflow/buyer — Internal SGTX Buyer Workflow mirror (v18 §6)
//
// Internal mirror of /api/v1/workflow/buyer. Auth NOT required.

export async function GET(req: NextRequest) {
  try {
    const payload = getBuyerWorkflowPayload();
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
    logger.error("[api/sgtx/workflow/buyer] error:", {
      error: e?.message || String(e),
    });
    return NextResponse.json(
      { error: "Buyer workflow metadata unavailable" },
      { status: 503 },
    );
  }
}

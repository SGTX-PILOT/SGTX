// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getNegotiationWorkflowPayload } from "@/lib/sgtx/workflow/negotiation-workflow";

export const dynamic = "force-dynamic";

// GET /api/sgtx/workflow/negotiation — Internal SGTX Negotiation mirror (v18 §9)

export async function GET(req: NextRequest) {
  try {
    const payload = getNegotiationWorkflowPayload();
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
    logger.error("[api/sgtx/workflow/negotiation] error:", { error: e?.message || String(e) });
    return NextResponse.json({ error: "Negotiation workflow metadata unavailable" }, { status: 503 });
  }
}

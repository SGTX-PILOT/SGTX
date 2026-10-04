// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getFinanceWorkflowPayload } from "@/lib/sgtx/workflow/finance-workflow";

export const dynamic = "force-dynamic";

// GET /api/sgtx/workflow/finance — Internal SGTX Finance Workflow mirror (v18 §10)

export async function GET(req: NextRequest) {
  try {
    const payload = getFinanceWorkflowPayload();
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
    logger.error("[api/sgtx/workflow/finance] error:", { error: e?.message || String(e) });
    return NextResponse.json({ error: "Finance workflow metadata unavailable" }, { status: 503 });
  }
}

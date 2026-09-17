// @ts-nocheck
// SGTX Phase 4 §5 — Multi-Agency Workflows API
//   GET /api/sgtx/government/workflows/for-trade?jurisdictionCode=X&operationType=Y&transportMode=Z
//   Calls getWorkflowForTrade({ jurisdictionCode, operationType, transportMode }).
//   Tries the most-specific match first (JC+OP+TM), then JC+OP, then JC-only.
//   Returns 404 if no workflow matches.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getWorkflowForTrade } from "@/lib/sgtx/multi-agency";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const jurisdictionCode = url.searchParams.get("jurisdictionCode") || "";
    const operationType = url.searchParams.get("operationType") || "";
    const transportMode = url.searchParams.get("transportMode") || "";
    if (!jurisdictionCode) {
      return NextResponse.json(
        { error: "jurisdictionCode query parameter required" },
        { status: 400 },
      );
    }
    if (!operationType) {
      return NextResponse.json(
        { error: "operationType query parameter required" },
        { status: 400 },
      );
    }
    const workflow = await getWorkflowForTrade({
      jurisdictionCode,
      operationType,
      transportMode: transportMode || undefined,
    });
    if (!workflow) {
      return NextResponse.json(
        {
          error:
            "no multi-agency workflow matches the supplied trade context",
          jurisdictionCode,
          operationType,
          transportMode,
        },
        { status: 404 },
      );
    }
    return NextResponse.json({ workflow });
  } catch (err: any) {
    logger.error("[api/sgtx/government/workflows/for-trade] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

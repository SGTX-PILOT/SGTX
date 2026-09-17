// @ts-nocheck
// SGTX Phase 4 §5 — Multi-Agency Workflows API
//   POST /api/sgtx/government/workflows/[id]/execute — execute the workflow
//   Body: TradeContext — { jurisdictionCode, operationType, ustn?, tradeId?,
//        transportMode?, hs6?, originCountry?, destCountry?, applicantGtid?,
//        brokerGtid?, canonicalData?, optionalSteps?, riskFlags? }
//   Calls executeWorkflow(workflowId, tradeContext).
//   Returns the WorkflowExecutionResult: { workflowId, steps, topStatus,
//   completedCount, pendingCount, rejectedCount, holdCount }.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  executeWorkflow,
  getWorkflow,
} from "@/lib/sgtx/multi-agency";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    // 404 the workflow early so callers get a clear not-found.
    const existing = await getWorkflow(id, false);
    if (!existing) {
      return NextResponse.json(
        { error: "multi-agency workflow not found", id },
        { status: 404 },
      );
    }
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "request body required (TradeContext)" },
        { status: 400 },
      );
    }
    if (!body.jurisdictionCode) {
      return NextResponse.json(
        { error: "tradeContext.jurisdictionCode required" },
        { status: 400 },
      );
    }
    if (!body.operationType) {
      return NextResponse.json(
        { error: "tradeContext.operationType required" },
        { status: 400 },
      );
    }
    const result = await executeWorkflow(id, body);
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/government/workflows/[id]/execute] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

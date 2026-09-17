// @ts-nocheck
// SGTX Phase 4 §5 — Multi-Agency Workflows API
//   POST /api/sgtx/government/workflows/[id]/steps — add a step to a workflow
//   Body: AddStepInput (without workflowId) — agency required.
//   Calls addWorkflowStep({ ...body, workflowId: id }).
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  addWorkflowStep,
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
        { error: "request body required" },
        { status: 400 },
      );
    }
    if (!body.agency) {
      return NextResponse.json(
        { error: "agency required" },
        { status: 400 },
      );
    }
    const step = await addWorkflowStep({
      ...body,
      workflowId: id,
    });
    return NextResponse.json({ step });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/government/workflows/[id]/steps] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

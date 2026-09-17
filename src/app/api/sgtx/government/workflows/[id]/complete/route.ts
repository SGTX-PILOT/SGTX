// @ts-nocheck
// SGTX Phase 4 §5 — Multi-Agency Workflows API
//   GET /api/sgtx/government/workflows/[id]/complete — is workflow complete?
//   Calls isWorkflowComplete(workflowId). Returns { complete: boolean }.
//
//   "Complete" = every non-optional step is either GOVERNMENT_RELEASED or
//   SKIPPED (skipped because its condition was false or its risk trigger was
//   not fired). Optional steps are ignored if they are PENDING (their
//   presence is by definition optional).
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  isWorkflowComplete,
  getWorkflow,
} from "@/lib/sgtx/multi-agency";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const existing = await getWorkflow(id, false);
    if (!existing) {
      return NextResponse.json(
        { error: "multi-agency workflow not found", id },
        { status: 404 },
      );
    }
    const complete = await isWorkflowComplete(id);
    return NextResponse.json({ complete, workflowId: id });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/government/workflows/[id]/complete] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

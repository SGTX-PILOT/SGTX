// @ts-nocheck
// SGTX Phase 4 §5 — Multi-Agency Workflows API
//   GET /api/sgtx/government/workflows/[id]/progress — progress summary
//   Calls getWorkflowProgress(workflowId).
//   Returns { total, completed, pending, rejected, hold, skipped, progressPct }.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  getWorkflowProgress,
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
    const progress = await getWorkflowProgress(id);
    return NextResponse.json({ progress });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/government/workflows/[id]/progress] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

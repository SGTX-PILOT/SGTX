// @ts-nocheck
// SGTX Phase 4 §5 — Multi-Agency Workflows API
//   GET    /api/sgtx/government/workflows/[id] — fetch a workflow (with steps)
//   DELETE /api/sgtx/government/workflows/[id] — soft delete (calls deleteWorkflow(id, false))
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  getWorkflow,
  deleteWorkflow,
} from "@/lib/sgtx/multi-agency";

export const dynamic = "force-dynamic";

// GET — fetch a workflow by id, include steps sorted by `order`.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const workflow = await getWorkflow(id, true);
    if (!workflow) {
      return NextResponse.json(
        { error: "multi-agency workflow not found", id },
        { status: 404 },
      );
    }
    return NextResponse.json({ workflow });
  } catch (err: any) {
    logger.error("[api/sgtx/government/workflows/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// DELETE — soft delete (§7 admin convention: hard=false marks the workflow
// inactive by setting active=false, preserving the row + its steps).
export async function DELETE(
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
    const ok = await deleteWorkflow(id, false);
    return NextResponse.json({ ok, id });
  } catch (err: any) {
    logger.error("[api/sgtx/government/workflows/[id]] DELETE failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

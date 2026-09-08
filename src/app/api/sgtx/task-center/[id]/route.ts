// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { getTask, getTaskEscalationStatus } from "@/lib/sgtx/task-center";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/sgtx/task-center/[id]                — single task
// GET /api/sgtx/task-center/[id]?escalation=true — task + escalation status + history
// PATCH /api/sgtx/task-center/[id]              — update priority/dueDate/assignee
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "task id required" }, { status: 400 });
  try {
    const task = await getTask(id);
    if (!task) return NextResponse.json({ error: "task not found" }, { status: 404 });

    if (req.nextUrl.searchParams.get("escalation") === "true") {
      const status = await getTaskEscalationStatus(id);
      return NextResponse.json({ task, escalation: status });
    }
    return NextResponse.json({ task });
  } catch (e: any) {
    logger.error("[api/task-center/[id]] GET failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "fetch failed" }, { status: 500 });
  }
}

// PATCH /api/sgtx/task-center/[id] — partial update (priority, dueDate, assigneeGtid, status, description)
import { db } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "task id required" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  try {
    const existing = await db.task.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "task not found" }, { status: 404 });

    const data: any = {};
    if (body.priority !== undefined) data.priority = Number(body.priority);
    if (body.dueDate !== undefined)  data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.assigneeGtid !== undefined) data.assignedToGtid = body.assigneeGtid || null;
    if (body.status !== undefined) data.status = body.status;
    if (body.description !== undefined) data.description = body.description;
    if (body.title !== undefined) data.title = body.title;

    const updated = await db.task.update({ where: { id }, data });
    return NextResponse.json({ ok: true, task: updated });
  } catch (e: any) {
    logger.error("[api/task-center/[id]] PATCH failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "update failed" }, { status: 500 });
  }
}

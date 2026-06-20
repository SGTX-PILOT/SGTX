import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/tasks — List tasks for a tenant (blueprint 12A.10)
export async function GET(req: NextRequest) {
  const tenantGtid = req.nextUrl.searchParams.get("tenantGtid");
  const status = req.nextUrl.searchParams.get("status");
  if (!tenantGtid) return NextResponse.json({ error: "tenantGtid required" }, { status: 400 });
  const tasks = await db.task.findMany({
    where: {
      tenantGtid,
      ...(status ? { status } : {}),
    },
    orderBy: { priority: "desc" },
    take: 50,
  });
  return NextResponse.json({ tasks });
}

// POST /api/sgtx/tasks — Create a task OR perform an action (blueprint 12A.10)
//   Body with action=complete : marks task as DONE
//   Body with action=escalate : bumps escalation_level (0→1→2→3→4)
//   Body without action        : create new task
export async function POST(req: NextRequest) {
  const body = await req.json();
  const action = body.action;

  if (action === "complete") {
    const { taskId } = body;
    if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });
    const task = await db.task.update({
      where: { id: taskId },
      data: { status: "DONE", completedAt: new Date() },
    });
    return NextResponse.json({ ok: true, task });
  }

  if (action === "escalate") {
    const { taskId } = body;
    if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });
    const existing = await db.task.findUnique({ where: { id: taskId } });
    if (!existing) return NextResponse.json({ error: "task not found" }, { status: 404 });
    const nextLevel = Math.min((existing.escalationLevel || 0) + 1, 4);
    const status = nextLevel >= 3 ? "ESCALATED" : existing.status;
    const task = await db.task.update({
      where: { id: taskId },
      data: { escalationLevel: nextLevel, status },
    });
    return NextResponse.json({ ok: true, task });
  }

  const { tenantGtid, tradeId, title, description, priority, dueDate, assignedToGtid } = body;
  if (!tenantGtid || !title) return NextResponse.json({ error: "tenantGtid and title required" }, { status: 400 });
  const task = await db.task.create({
    data: {
      tenantGtid,
      tradeId: tradeId || null,
      title,
      description: description || null,
      priority: priority || 50,
      dueDate: dueDate ? new Date(dueDate) : null,
      assignedToGtid: assignedToGtid || null,
      status: "OPEN",
    },
  });
  return NextResponse.json({ ok: true, task });
}

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

// POST /api/sgtx/tasks — Create a task
export async function POST(req: NextRequest) {
  const { tenantGtid, tradeId, title, description, priority, dueDate, assignedToGtid } = await req.json();
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

// POST /api/sgtx/tasks/complete — Complete a task
export async function POST_complete(req: NextRequest) {
  const { taskId } = await req.json();
  const task = await db.task.update({
    where: { id: taskId },
    data: { status: "DONE", completedAt: new Date() },
  });
  return NextResponse.json({ ok: true, task });
}

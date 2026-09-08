// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createTask, getTasks } from "@/lib/sgtx/task-center";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/sgtx/task-center?tenantGtid=X[&assignee=Y][&priority=P][&status=S][&category=C][&escalationLevel=L][&limit=N]
//   → { tasks, count }
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  try {
    const result = await getTasks({
      tenantGtid: sp.get("tenantGtid") || undefined,
      assignee: sp.get("assignee") || undefined,
      priority: (sp.get("priority") as any) || undefined,
      status: (sp.get("status") as any) || undefined,
      category: sp.get("category") || undefined,
      escalationLevel: sp.get("escalationLevel") ? Number(sp.get("escalationLevel")) as any : undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    });
    return NextResponse.json(result);
  } catch (e: any) {
    logger.error("[api/task-center] GET failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "fetch failed" }, { status: 500 });
  }
}

// POST /api/sgtx/task-center — create a new task.
// Body: { tenantGtid, title, description?, assigneeGtid?, priority?, deadline?, category?, tradeId? }
//   → { ok, taskId, task }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  try {
    const result = await createTask({
      tenantGtid: body.tenantGtid,
      title: body.title,
      description: body.description,
      assigneeGtid: body.assigneeGtid,
      priority: body.priority,
      deadline: body.deadline,
      category: body.category,
      tradeId: body.tradeId,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("[api/task-center] POST failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "create failed" }, { status: 400 });
  }
}

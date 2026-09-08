// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { completeTask } from "@/lib/sgtx/task-center";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/sgtx/task-center/[id]/complete — mark a task as completed.
// Body: { completionNote: string, completedBy?: string }
//   → { ok, completed, completedAt }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "task id required" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  if (!body.completionNote) {
    return NextResponse.json({ error: "completionNote required" }, { status: 400 });
  }
  try {
    const result = await completeTask(id, body.completionNote, body.completedBy || "system");
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("[api/task-center/complete] failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "complete failed" }, { status: 400 });
  }
}

// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { escalateTask } from "@/lib/sgtx/task-center";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/sgtx/task-center/[id]/escalate — escalate a task to a higher level (1..5).
// Body: { toLevel: number, reason: string, escalatedBy?: string }
//   → { ok, escalated, fromLevel, toLevel, escalatedAt }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "task id required" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const toLevel = Number(body.toLevel);
  if (!toLevel || toLevel < 1 || toLevel > 5) {
    return NextResponse.json({ error: "toLevel must be an integer 1..5" }, { status: 400 });
  }
  if (!body.reason) {
    return NextResponse.json({ error: "reason required" }, { status: 400 });
  }
  try {
    const result = await escalateTask(
      id,
      toLevel as any,
      body.reason,
      body.escalatedBy || "system",
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("[api/task-center/escalate] failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "escalate failed" }, { status: 400 });
  }
}

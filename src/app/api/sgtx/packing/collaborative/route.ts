// 5.6 — Collaborative Packing Plan Editing
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { joinPackingPlanSession, leavePackingPlanSession, getActiveEditors } from "@/lib/sgtx/packing";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, planId, editor } = body;
    if (action === "leave") { leavePackingPlanSession(planId, body.employeeGtid); return NextResponse.json({ ok: true }); }
    if (!planId || !editor) return NextResponse.json({ error: "planId and editor required" }, { status: 400 });
    const result = joinPackingPlanSession(planId, editor);
    return NextResponse.json(result);
  } catch (e: any) { logger.error("[packing/collaborative]", e); return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function GET(req: NextRequest) {
  const planId = req.nextUrl.searchParams.get("planId");
  if (!planId) return NextResponse.json({ error: "planId required" }, { status: 400 });
  return NextResponse.json({ editors: getActiveEditors(planId) });
}

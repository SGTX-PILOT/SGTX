import { NextRequest, NextResponse } from "next/server";
import { transitionLifecycle, type LifecycleState } from "@/lib/sgtx/identity";

// POST /api/sgtx/lifecycle/transition  { tenantGtid, toState, reason?, changedBy? }
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.tenantGtid || !body.toState) return NextResponse.json({ error: "tenantGtid + toState required" }, { status: 400 });
  const result = await transitionLifecycle(body as any);
  return NextResponse.json(result);
}

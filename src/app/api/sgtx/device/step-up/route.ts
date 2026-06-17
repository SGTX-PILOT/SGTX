import { NextRequest, NextResponse } from "next/server";
import { performStepUpAuth } from "@/lib/sgtx/governor/constitutional-addons";

// POST /api/sgtx/device/step-up  { tenantGtid, deviceFingerprint, action, tradeValueUsd? }
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.tenantGtid || !body.action) return NextResponse.json({ error: "tenantGtid + action required" }, { status: 400 });
  const result = await performStepUpAuth(body);
  return NextResponse.json(result);
}

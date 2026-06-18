import { NextRequest, NextResponse } from "next/server";
import { generateTenantMessage } from "@/lib/sgtx/ai/orchestrator";

// POST /api/sgtx/ai/tenant-message  { action, verdict, conditions: string[] }
export async function POST(req: NextRequest) {
  const { action, verdict, conditions } = await req.json();
  if (!action || !verdict) return NextResponse.json({ error: "action + verdict required" }, { status: 400 });
  const result = await generateTenantMessage(action, verdict, conditions || []);
  return NextResponse.json(result);
}

import { NextRequest, NextResponse } from "next/server";
import { ecologicalPackagingAdvisor } from "@/lib/sgtx/ai/orchestrator";
export async function POST(req: NextRequest) {
  const { commodity, currentPackaging, containerCount } = await req.json();
  if (!commodity) return NextResponse.json({ error: "commodity required" }, { status: 400 });
  const result = await ecologicalPackagingAdvisor(commodity, currentPackaging || "", Number(containerCount) || 1);
  return NextResponse.json(result);
}

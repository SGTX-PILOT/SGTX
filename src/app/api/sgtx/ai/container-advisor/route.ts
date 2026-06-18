import { NextRequest, NextResponse } from "next/server";
import { containerAdvisor } from "@/lib/sgtx/ai/orchestrator";

export async function POST(req: NextRequest) {
  const { palletCount, palletType } = await req.json();
  if (!palletCount) return NextResponse.json({ error: "palletCount required" }, { status: 400 });
  const result = await containerAdvisor(Number(palletCount), palletType || "EUR");
  return NextResponse.json(result);
}

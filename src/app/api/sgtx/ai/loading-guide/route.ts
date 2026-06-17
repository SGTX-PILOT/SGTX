import { NextRequest, NextResponse } from "next/server";
import { generateLoadingGuide } from "@/lib/sgtx/ai/orchestrator";

// POST /api/sgtx/ai/loading-guide  { commodity, containerCount, coldChain }
export async function POST(req: NextRequest) {
  const { commodity, containerCount, coldChain } = await req.json();
  if (!commodity) return NextResponse.json({ error: "commodity required" }, { status: 400 });
  const result = await generateLoadingGuide(commodity, Number(containerCount) || 1, Boolean(coldChain));
  return NextResponse.json(result);
}

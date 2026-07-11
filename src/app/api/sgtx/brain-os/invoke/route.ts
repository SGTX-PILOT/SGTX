import { NextRequest, NextResponse } from "next/server";
import { brainOrchestrator } from "@/lib/sgtx/brain-os/core/orchestrator";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  try {
    const { capability, input } = await req.json();
    if (!capability) return NextResponse.json({ error: "Required: { capability: string, input?: any }" }, { status: 400 });
    const result = await brainOrchestrator.invoke(capability, input || {});
    return NextResponse.json({ ok: true, capability, result });
  } catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}

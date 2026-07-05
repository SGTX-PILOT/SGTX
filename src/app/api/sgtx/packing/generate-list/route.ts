// Packing List Generation
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { generatePackingList } from "@/lib/sgtx/packing";

export async function POST(req: NextRequest) {
  try {
    const { packingPlanId } = await req.json();
    if (!packingPlanId) return NextResponse.json({ error: "packingPlanId required" }, { status: 400 });
    const result = await generatePackingList(packingPlanId);
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
    return NextResponse.json(result);
  } catch (e: any) { logger.error("[packing/generate-list]", e); return NextResponse.json({ error: e.message }, { status: 500 }); }
}

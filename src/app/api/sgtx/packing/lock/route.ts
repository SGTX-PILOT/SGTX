// 5.2.5 — Lock Packing Plan + Generate SSCCs
import { NextRequest, NextResponse } from "next/server";
import { lockPackingPlan } from "@/lib/sgtx/packing";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, tradeId, sellerGtid, planData, palletTareKg } = body;
    if (!ustn || !sellerGtid || !planData || !palletTareKg) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    const result = await lockPackingPlan({ ustn, tradeId, sellerGtid, planData, palletTareKg: +palletTareKg });
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
    return NextResponse.json(result);
  } catch (e: any) { console.error("[packing/lock]", e); return NextResponse.json({ error: e.message }, { status: 500 }); }
}

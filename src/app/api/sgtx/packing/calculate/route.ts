// 5.1.2 — Weight Calculation Engine
import { NextRequest, NextResponse } from "next/server";
import { calculateWeights } from "@/lib/sgtx/packing";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { commodities, palletTareKg } = body;
    if (!Array.isArray(commodities) || !palletTareKg) return NextResponse.json({ error: "commodities array and palletTareKg required" }, { status: 400 });
    const result = calculateWeights({ commodities, palletTareKg: +palletTareKg });
    return NextResponse.json(result);
  } catch (e: any) { console.error("[packing/calculate]", e); return NextResponse.json({ error: e.message }, { status: 500 }); }
}

// 5.2.3 — Non-Uniform Layer Validation
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { validateLayerPatterns } from "@/lib/sgtx/packing";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { patterns, maxStackingHeightMm, maxPayloadKg, netPerCartonKg, tarePerCartonKg, palletDeckHeightMm } = body;
    if (!Array.isArray(patterns) || !maxStackingHeightMm) return NextResponse.json({ error: "patterns array and maxStackingHeightMm required" }, { status: 400 });
    const result = validateLayerPatterns({ patterns, maxStackingHeightMm: +maxStackingHeightMm, maxPayloadKg: +maxPayloadKg || 1000, netPerCartonKg: +netPerCartonKg || 10, tarePerCartonKg: +tarePerCartonKg || 0.5, palletDeckHeightMm: +palletDeckHeightMm || 144 });
    return NextResponse.json(result);
  } catch (e: any) { logger.error("[packing/validate]", e); return NextResponse.json({ error: e.message }, { status: 500 }); }
}

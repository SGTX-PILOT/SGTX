// 5.1.3 — Palletisation Optimiser (ORTools CP-SAT simulated)
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { optimisePalletisation } from "@/lib/sgtx/packing";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { cartonDimensionsMm, palletDimensionsMm, maxStackingHeightMm, maxPayloadKg, netPerCartonKg, totalKg } = body;
    if (!cartonDimensionsMm || !palletDimensionsMm || !maxStackingHeightMm || !maxPayloadKg || !netPerCartonKg || !totalKg) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    const result = optimisePalletisation({ cartonDimensionsMm, palletDimensionsMm, maxStackingHeightMm: +maxStackingHeightMm, maxPayloadKg: +maxPayloadKg, netPerCartonKg: +netPerCartonKg, totalKg: +totalKg });
    return NextResponse.json(result);
  } catch (e: any) { logger.error("[packing/optimise]", e); return NextResponse.json({ error: e.message }, { status: 500 }); }
}

// 5.10 — Packing Plan Lock Validation (Governor A4)
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { validatePackingPlanLock } from "@/lib/sgtx/packing";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { totalGrossKg, maxPayloadKg, palletHeights, maxStackingHeightMm, coldTreatmentRequired, coldTreatmentCertUploaded, incompatibleCommodities } = body;
    if (totalGrossKg === undefined || !maxPayloadKg || !palletHeights) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    const result = validatePackingPlanLock({ totalGrossKg: +totalGrossKg, maxPayloadKg: +maxPayloadKg, palletHeights, maxStackingHeightMm: +maxStackingHeightMm || 1600, coldTreatmentRequired: !!coldTreatmentRequired, coldTreatmentCertUploaded: !!coldTreatmentCertUploaded, incompatibleCommodities });
    return NextResponse.json(result);
  } catch (e: any) { logger.error("[packing/lock-validate]", e); return NextResponse.json({ error: e.message }, { status: 500 }); }
}

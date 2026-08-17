// POST /api/sgtx/seller/change-impact — calculate Buyer-Change Impact
// GET  /api/sgtx/seller/change-impact — route info
import { NextRequest, NextResponse } from "next/server";
import { calculateBuyerChangeImpact } from "@/lib/sgtx/seller/change-impact";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = calculateBuyerChangeImpact(body);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("change-impact POST failed", { error: e?.message });
    return NextResponse.json({ ok: false, error: e?.message || "calculation failed" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/sgtx/seller/change-impact",
    description: "Calculate Buyer-Change Impact (amendment downstream effects)",
    states: ["UNCHANGED", "RECALCULATED", "INVALIDATED", "RECONFIRM_REQUIRED", "REQUOTE_REQUIRED", "REGENERATE_REQUIRED"],
  });
}

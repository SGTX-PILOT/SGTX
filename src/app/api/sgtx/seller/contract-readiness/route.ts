// GET  /api/sgtx/seller/contract-readiness?ustn=X — calculate Contract Readiness
// POST /api/sgtx/seller/contract-readiness — calculate with explicit input
import { NextRequest, NextResponse } from "next/server";
import { calculateContractReadiness } from "@/lib/sgtx/seller/contract-readiness";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = calculateContractReadiness(body);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("contract-readiness POST failed", { error: e?.message });
    return NextResponse.json({ ok: false, error: e?.message || "calculation failed" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/sgtx/seller/contract-readiness",
    description: "Calculate Contract Readiness (READY / ACTION_REQUIRED / BLOCKED)",
    items: ["Commercial Terms", "EXW Price", "Packing", "Logistics", "Capacity", "Required Addenda", "Documents", "QC", "LAB", "Customs", "Insurance", "Settlement"],
    states: ["READY", "ACTION_REQUIRED", "BLOCKED"],
  });
}

// POST /api/sgtx/seller/quote-viability — calculate Quote Viability
// GET  /api/sgtx/seller/quote-viability — route info
import { NextRequest, NextResponse } from "next/server";
import { calculateQuoteViability } from "@/lib/sgtx/seller/quote-viability";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = calculateQuoteViability(body);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("quote-viability POST failed", { error: e?.message });
    return NextResponse.json({ ok: false, error: e?.message || "calculation failed" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/sgtx/seller/quote-viability",
    description: "Calculate Quote Viability (VIABLE / VIABLE_WITH_CONDITIONS / BLOCKED)",
    categories: ["Commercial Fit", "Operational Fit", "Logistics Fit", "Capacity", "Compliance", "Documents", "Margin"],
    states: ["VIABLE", "VIABLE_WITH_CONDITIONS", "BLOCKED"],
  });
}

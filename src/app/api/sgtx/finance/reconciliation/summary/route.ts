// @ts-nocheck
// §9 Reconciliation — summary for a (ustn, period)
// GET /api/sgtx/finance/reconciliation/summary?ustn=X&period=Y
import { NextResponse } from "next/server";
import { getReconciliationSummary } from "@/lib/sgtx/reconciliation";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn");
    const period = url.searchParams.get("period");
    if (!ustn) {
      return NextResponse.json(
        { error: "ustn required" },
        { status: 400 },
      );
    }
    if (!period) {
      return NextResponse.json(
        { error: "period required (e.g. 2026-03)" },
        { status: 400 },
      );
    }
    const summary = await getReconciliationSummary(ustn, period);
    return NextResponse.json({ ustn, period, summary });
  } catch (err: any) {
    logger.error("[api/finance/reconciliation/summary] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

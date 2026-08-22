// @ts-nocheck
// §7 Accounting — trial balance for a period
// GET /api/sgtx/finance/accounting/trial-balance?period=X
import { NextResponse } from "next/server";
import { getTrialBalance } from "@/lib/sgtx/accounting";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const period = url.searchParams.get("period");
    if (!period) {
      return NextResponse.json(
        { error: "period required (e.g. 2026-03)" },
        { status: 400 },
      );
    }
    const trialBalance = await getTrialBalance(period);
    return NextResponse.json({ period, trialBalance });
  } catch (err: any) {
    logger.error("[api/finance/accounting/trial-balance] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// @ts-nocheck
// §7 Accounting — Profit & Loss for a period
// GET /api/sgtx/finance/accounting/pnl?period=X
import { NextResponse } from "next/server";
import { getPnl } from "@/lib/sgtx/accounting";
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
    const pnl = await getPnl(period);
    return NextResponse.json({ period, pnl });
  } catch (err: any) {
    logger.error("[api/finance/accounting/pnl] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// @ts-nocheck
// §2b Financier Relationships — check credit limit
// GET /api/sgtx/finance/financiers/credit-limit?traderGtid=X&financierGtid=Y&requestedAmountUsd=Z
import { NextResponse } from "next/server";
import { checkCreditLimit } from "@/lib/sgtx/financier-relationship";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const traderGtid = url.searchParams.get("traderGtid");
    const financierGtid = url.searchParams.get("financierGtid");
    const requestedAmountUsd = url.searchParams.get("requestedAmountUsd");
    if (!traderGtid || !financierGtid || requestedAmountUsd == null) {
      return NextResponse.json(
        {
          error:
            "traderGtid, financierGtid and requestedAmountUsd required",
        },
        { status: 400 },
      );
    }
    const amount = Number(requestedAmountUsd);
    if (isNaN(amount) || amount < 0) {
      return NextResponse.json(
        { error: "requestedAmountUsd must be a non-negative number" },
        { status: 400 },
      );
    }
    const result = await checkCreditLimit(
      traderGtid,
      financierGtid,
      amount,
    );
    return NextResponse.json(result);
  } catch (err: any) {
    logger.error("[api/finance/financiers/credit-limit] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

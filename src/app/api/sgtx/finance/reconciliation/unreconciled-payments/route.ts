// @ts-nocheck
// §9 Reconciliation — unreconciled payments for a USTN
// GET /api/sgtx/finance/reconciliation/unreconciled-payments?ustn=X
import { NextResponse } from "next/server";
import { getUnreconciledPayments } from "@/lib/sgtx/reconciliation";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn");
    if (!ustn) {
      return NextResponse.json(
        { error: "ustn required" },
        { status: 400 },
      );
    }
    const payments = await getUnreconciledPayments(ustn);
    return NextResponse.json({ ustn, payments });
  } catch (err: any) {
    logger.error(
      "[api/finance/reconciliation/unreconciled-payments] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

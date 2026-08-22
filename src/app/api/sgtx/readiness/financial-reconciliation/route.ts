// @ts-nocheck
// §5 Financial Reconciliation — verify the 8 financial flows.
// POST /api/sgtx/readiness/financial-reconciliation   body: { ustn? }
//      → verifyFinancialReconciliation(ustn) → returns FinancialReconResult.
import { NextResponse } from "next/server";
import { verifyFinancialReconciliation } from "@/lib/sgtx/production-readiness";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    let ustn: string | undefined;
    try {
      const body = await req.json();
      if (body && typeof body === "object" && typeof body.ustn === "string") {
        ustn = body.ustn;
      }
    } catch {
      // Body is optional — fall through with ustn = undefined.
      ustn = undefined;
    }
    const result = await verifyFinancialReconciliation(ustn);
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/readiness/financial-reconciliation] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

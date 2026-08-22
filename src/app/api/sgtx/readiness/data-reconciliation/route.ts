// @ts-nocheck
// §6 Data Reconciliation — verify the 9 link-integrity checks (+ orphan check).
// POST /api/sgtx/readiness/data-reconciliation   body: { ustn? }
//      → verifyDataReconciliation(ustn) → returns DataReconResult.
import { NextResponse } from "next/server";
import { verifyDataReconciliation } from "@/lib/sgtx/production-readiness";
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
      ustn = undefined;
    }
    const result = await verifyDataReconciliation(ustn);
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error("[api/sgtx/readiness/data-reconciliation] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

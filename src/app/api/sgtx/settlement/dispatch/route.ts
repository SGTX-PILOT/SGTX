// @ts-nocheck
/**
 * POST /api/sgtx/settlement/dispatch
 *
 * Body: { ustn, stage: 1 | 2 }
 *
 * Dispatches a multi-leg settlement batch (§13.4.3). Returns:
 *   { batchId, currency, legs, idempotencyKey, bankReference?, status,
 *     governorCheck: { passed, blockingFactors } }
 *
 * Golden Principle: this endpoint NEVER marks FeeLock ACTIVE — only camt.054
 * / SWIFT gpi confirmation does that.
 */
import { NextRequest, NextResponse } from "next/server";
import { dispatchMultiLegSettlement } from "@/lib/sgtx/direct-bank-settlement";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, stage } = body;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const stageNum = Number(stage);
    if (stageNum !== 1 && stageNum !== 2) {
      return NextResponse.json(
        { error: "stage must be 1 (pre-shipment) or 2 (post-departure)" },
        { status: 400 },
      );
    }
    const result = await dispatchMultiLegSettlement(ustn, stageNum);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

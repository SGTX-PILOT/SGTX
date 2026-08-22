// @ts-nocheck
// §9 Reconciliation — run reconciliation. Body: RunReconInput
// POST /api/sgtx/finance/reconciliation/run
import { NextResponse } from "next/server";
import { runReconciliation } from "@/lib/sgtx/reconciliation";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    if (!body.reconciliationType) {
      return NextResponse.json(
        { error: "reconciliationType required" },
        { status: 400 },
      );
    }
    if (!body.ustn && !body.period) {
      return NextResponse.json(
        { error: "ustn or period required to scope the reconciliation" },
        { status: 400 },
      );
    }
    const result = await runReconciliation(body);
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error("[api/finance/reconciliation/run] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

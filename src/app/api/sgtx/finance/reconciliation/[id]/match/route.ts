// @ts-nocheck
// §9 Reconciliation — manual match. Body: { targetReference }
// POST /api/sgtx/finance/reconciliation/[id]/match
import { NextResponse } from "next/server";
import { matchReconciliation } from "@/lib/sgtx/reconciliation";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const body = await req.json();
    if (!body?.targetReference) {
      return NextResponse.json(
        { error: "targetReference required" },
        { status: 400 },
      );
    }
    const reconciliation = await matchReconciliation(id, body.targetReference);
    return NextResponse.json({ reconciliation });
  } catch (err: any) {
    logger.error("[api/finance/reconciliation/[id]/match] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

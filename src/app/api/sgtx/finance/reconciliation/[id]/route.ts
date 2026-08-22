// @ts-nocheck
// §9 Reconciliation — GET single reconciliation by database id
// GET /api/sgtx/finance/reconciliation/[id]
import { NextResponse } from "next/server";
import { getReconciliation } from "@/lib/sgtx/reconciliation";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const reconciliation = await getReconciliation(id);
    if (!reconciliation) {
      return NextResponse.json(
        { error: "reconciliation not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ reconciliation });
  } catch (err: any) {
    logger.error("[api/finance/reconciliation/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

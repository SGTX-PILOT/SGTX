// @ts-nocheck
// §9 Reconciliation — resolve discrepancy. Body: { resolvedBy, notes }
// POST /api/sgtx/finance/reconciliation/[id]/resolve
import { NextResponse } from "next/server";
import { resolveDiscrepancy } from "@/lib/sgtx/reconciliation";
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
    if (!body?.resolvedBy) {
      return NextResponse.json(
        { error: "resolvedBy required" },
        { status: 400 },
      );
    }
    if (!body?.notes) {
      return NextResponse.json({ error: "notes required" }, { status: 400 });
    }
    const reconciliation = await resolveDiscrepancy(
      id,
      body.resolvedBy,
      body.notes,
    );
    return NextResponse.json({ reconciliation });
  } catch (err: any) {
    logger.error("[api/finance/reconciliation/[id]/resolve] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

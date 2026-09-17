// @ts-nocheck
// SGTX Phase 4 §1 — Customs Operations API
//   GET /api/sgtx/government/customs-operations/[id]/fees
//   Calls computeOperationFees(operationId) — returns { fees, duties, taxes, totalUsd }.
//   Uses the Phase 2 tariff engine when the declaration carries an HS code +
//   customs value; otherwise returns the manual fee/duty/tax lines.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  computeOperationFees,
  getCustomsOperation,
} from "@/lib/sgtx/customs-engine";

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
    const existing = await getCustomsOperation(id);
    if (!existing) {
      return NextResponse.json(
        { error: "customs operation not found", id },
        { status: 404 },
      );
    }
    const fees = await computeOperationFees(id);
    return NextResponse.json({ fees });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/government/customs-operations/[id]/fees] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

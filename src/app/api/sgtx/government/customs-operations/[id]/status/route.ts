// @ts-nocheck
// SGTX Phase 4 §1 — Customs Operations API
//   POST /api/sgtx/government/customs-operations/[id]/status
//   Calls checkOperationStatus(operationId) — polls the linked connector for
//   the authoritative status of the operation and transitions the operation
//   accordingly.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  checkOperationStatus,
  getCustomsOperation,
} from "@/lib/sgtx/customs-engine";

export const dynamic = "force-dynamic";

export async function POST(
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
    const result = await checkOperationStatus(id);
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/government/customs-operations/[id]/status] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

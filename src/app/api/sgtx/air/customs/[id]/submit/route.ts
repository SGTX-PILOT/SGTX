// @ts-nocheck
// POST /api/sgtx/air/customs/{id}/submit
// Body: { declarationNumber?, manifestReference?, brokerGtid? }
// Submits an AirCustomsOperation: transitions DRAFT -> SUBMITTED and records submissionTime.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "customs operation id required" }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    const op = await db.airCustomsOperation.findUnique({ where: { id } });
    if (!op) {
      return NextResponse.json({ error: "customs operation not found" }, { status: 404 });
    }
    if (op.status !== "DRAFT" && op.status !== "REJECTED") {
      return NextResponse.json(
        { error: `cannot submit customs operation in status ${op.status}` },
        { status: 400 },
      );
    }

    // Generate a placeholder government reference (real adapter integration deferred).
    const governmentReference = `SGTX-AIR-CUST-${Date.now().toString(36).toUpperCase()}`;

    const updated = await db.airCustomsOperation.update({
      where: { id },
      data: {
        status: "SUBMITTED",
        submissionTime: new Date(),
        declarationNumber: body?.declarationNumber || op.declarationNumber || governmentReference,
        manifestReference: body?.manifestReference || op.manifestReference,
        brokerGtid: body?.brokerGtid || op.brokerGtid,
        governmentReference,
      },
    });

    logger.info("[api/air/customs/[id]/submit] submitted", {
      opId: id,
      governmentReference,
    });
    return NextResponse.json({
      operation: updated,
      governmentReference,
      note: "Customs adapter filing is MANUAL_REQUIRED — government reference is a placeholder for operator reconciliation.",
    });
  } catch (err: any) {
    logger.error("[api/air/customs/[id]/submit] POST failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// @ts-nocheck
// GET /api/sgtx/air/customs/{id}/status — fetch a customs operation's current status.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "customs operation id required" }, { status: 400 });
    }
    const op = await db.airCustomsOperation.findUnique({ where: { id } });
    if (!op) {
      return NextResponse.json({ error: "customs operation not found" }, { status: 404 });
    }
    return NextResponse.json({
      id: op.id,
      ustn: op.ustn,
      country: op.country,
      operationType: op.operationType,
      status: op.status,
      declarationNumber: op.declarationNumber,
      governmentReference: op.governmentReference,
      submissionTime: op.submissionTime,
      acceptanceTime: op.acceptanceTime,
      releaseTime: op.releaseTime,
      rejectionReason: op.rejectionReason,
      amendmentStatus: op.amendmentStatus,
    });
  } catch (err: any) {
    logger.error("[api/air/customs/[id]/status] GET failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

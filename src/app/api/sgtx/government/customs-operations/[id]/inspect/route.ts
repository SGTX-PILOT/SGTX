// @ts-nocheck
// SGTX Phase 4 §1 — Customs Operations API
//   POST /api/sgtx/government/customs-operations/[id]/inspect
//   Body: { inspectionResult }
//   Calls recordInspection(operationId, inspectionResult) — records an
//   inspection result on the operation. This does NOT flip the §4
//   authoritative status; inspection results feed into the release decision.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  recordInspection,
  getCustomsOperation,
} from "@/lib/sgtx/customs-engine";

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
    const existing = await getCustomsOperation(id);
    if (!existing) {
      return NextResponse.json(
        { error: "customs operation not found", id },
        { status: 404 },
      );
    }
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "request body required" },
        { status: 400 },
      );
    }
    if (body.inspectionResult === undefined || body.inspectionResult === null) {
      return NextResponse.json(
        { error: "inspectionResult required" },
        { status: 400 },
      );
    }
    const operation = await recordInspection(id, body.inspectionResult);
    return NextResponse.json({ operation });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/government/customs-operations/[id]/inspect] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

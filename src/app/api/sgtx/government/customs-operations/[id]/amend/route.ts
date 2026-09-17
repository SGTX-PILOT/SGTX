// @ts-nocheck
// SGTX Phase 4 §1 — Customs Operations API
//   POST /api/sgtx/government/customs-operations/[id]/amend
//   Body: { amendments }
//   Calls amendCustomsOperation(operationId, amendments) — sends an amendment
//   via the gateway to the linked connector.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  amendCustomsOperation,
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
    if (body.amendments === undefined || body.amendments === null) {
      return NextResponse.json(
        { error: "amendments required" },
        { status: 400 },
      );
    }
    const result = await amendCustomsOperation(id, body.amendments);
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/government/customs-operations/[id]/amend] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

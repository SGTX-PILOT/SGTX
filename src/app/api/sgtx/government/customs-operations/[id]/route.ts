// @ts-nocheck
// SGTX Phase 4 §1 — Customs Operations API
//   GET /api/sgtx/government/customs-operations/[id] — fetch a single CustomsOperationV2
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getCustomsOperation } from "@/lib/sgtx/customs-engine";

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
    const operation = await getCustomsOperation(id);
    if (!operation) {
      return NextResponse.json(
        { error: "customs operation not found", id },
        { status: 404 },
      );
    }
    return NextResponse.json({ operation });
  } catch (err: any) {
    logger.error("[api/sgtx/government/customs-operations/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

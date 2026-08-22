// @ts-nocheck
// §1 E2E Trade Graph Validation — GET by DB id (cuid).
// GET /api/sgtx/readiness/e2e/[id]
import { NextResponse } from "next/server";
import { getE2EValidation } from "@/lib/sgtx/production-readiness";
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
    const validation = await getE2EValidation(id);
    if (!validation) {
      return NextResponse.json(
        { error: "validation not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ validation });
  } catch (err: any) {
    logger.error("[api/sgtx/readiness/e2e/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

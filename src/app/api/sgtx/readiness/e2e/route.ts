// @ts-nocheck
// §1 E2E Trade Graph Validation — list validations with optional filters.
// GET /api/sgtx/readiness/e2e?status=X&transportMode=Y
//      → listE2EValidations({ status?, transportMode? })
import { NextResponse } from "next/server";
import { listE2EValidations } from "@/lib/sgtx/production-readiness";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const filters: { status?: string; transportMode?: string } = {};
    const status = url.searchParams.get("status") || undefined;
    const transportMode = url.searchParams.get("transportMode") || undefined;
    if (status) filters.status = status;
    if (transportMode) filters.transportMode = transportMode;
    const validations = await listE2EValidations(filters);
    return NextResponse.json({ validations });
  } catch (err: any) {
    logger.error("[api/sgtx/readiness/e2e] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

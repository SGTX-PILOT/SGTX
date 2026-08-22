// @ts-nocheck
// §11 Production Readiness Report — GET by DB id (cuid).
// GET /api/sgtx/readiness/report/[id]
import { NextResponse } from "next/server";
import { getReadinessReport } from "@/lib/sgtx/production-readiness";
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
    const report = await getReadinessReport(id);
    if (!report) {
      return NextResponse.json(
        { error: "report not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ report });
  } catch (err: any) {
    logger.error("[api/sgtx/readiness/report/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

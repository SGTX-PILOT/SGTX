// @ts-nocheck
// §11 Production Readiness Report — GET latest (most recent by generatedAt).
// GET /api/sgtx/readiness/report/latest
import { NextResponse } from "next/server";
import { getLatestReadinessReport } from "@/lib/sgtx/production-readiness";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const report = await getLatestReadinessReport();
    if (!report) {
      return NextResponse.json(
        { error: "no readiness reports found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ report });
  } catch (err: any) {
    logger.error("[api/sgtx/readiness/report/latest] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

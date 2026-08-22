// @ts-nocheck
// §11-§12 Production Readiness Report — list (GET) + generate (POST).
//
// GET  /api/sgtx/readiness/report?limit=N  → listReadinessReports(limit)
//      Returns the most recent N reports (default 20).
// POST /api/sgtx/readiness/report  body: { generatedBy? }
//      → generateProductionReadinessReport(generatedBy) → persists + returns the
//        new ProductionReadinessReport row.
import { NextResponse } from "next/server";
import {
  generateProductionReadinessReport,
  listReadinessReports,
} from "@/lib/sgtx/production-readiness";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const rawLimit = url.searchParams.get("limit");
    let limit = 20;
    if (rawLimit) {
      const n = Number(rawLimit);
      if (Number.isInteger(n) && n > 0) limit = Math.min(n, 200);
    }
    const reports = await listReadinessReports(limit);
    return NextResponse.json({ reports, count: reports.length });
  } catch (err: any) {
    logger.error("[api/sgtx/readiness/report] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    let generatedBy: string | undefined;
    try {
      const body = await req.json();
      if (body && typeof body === "object" && typeof body.generatedBy === "string") {
        generatedBy = body.generatedBy;
      }
    } catch {
      generatedBy = undefined;
    }
    const report = await generateProductionReadinessReport(generatedBy);
    if (!report) {
      return NextResponse.json(
        { error: "report generation failed — see server logs" },
        { status: 500 },
      );
    }
    return NextResponse.json({ report });
  } catch (err: any) {
    logger.error("[api/sgtx/readiness/report] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

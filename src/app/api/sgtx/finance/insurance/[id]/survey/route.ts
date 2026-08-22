// @ts-nocheck
// §6 Insurance — schedule survey. Body: { surveyorGtid, surveyDate }
// POST /api/sgtx/finance/insurance/[id]/survey
import { NextResponse } from "next/server";
import { scheduleSurvey } from "@/lib/sgtx/insurance-lifecycle";
import { logger } from "@/lib/sgtx/logger";

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
    const body = await req.json();
    if (!body?.surveyorGtid) {
      return NextResponse.json(
        { error: "surveyorGtid required" },
        { status: 400 },
      );
    }
    if (!body?.surveyDate) {
      return NextResponse.json(
        { error: "surveyDate required" },
        { status: 400 },
      );
    }
    const lifecycle = await scheduleSurvey(
      id,
      body.surveyorGtid,
      body.surveyDate,
    );
    return NextResponse.json({ lifecycle });
  } catch (err: any) {
    logger.error("[api/finance/insurance/[id]/survey] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

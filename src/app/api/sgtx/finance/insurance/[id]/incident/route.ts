// @ts-nocheck
// §6 Insurance — report incident. Body: { incidentDate, description }
// POST /api/sgtx/finance/insurance/[id]/incident
import { NextResponse } from "next/server";
import { reportIncident } from "@/lib/sgtx/insurance-lifecycle";
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
    if (!body?.incidentDate) {
      return NextResponse.json(
        { error: "incidentDate required" },
        { status: 400 },
      );
    }
    if (!body?.description) {
      return NextResponse.json(
        { error: "description required" },
        { status: 400 },
      );
    }
    const lifecycle = await reportIncident(
      id,
      body.incidentDate,
      body.description,
    );
    return NextResponse.json({ lifecycle });
  } catch (err: any) {
    logger.error("[api/finance/insurance/[id]/incident] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

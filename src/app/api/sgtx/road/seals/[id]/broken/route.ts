// @ts-nocheck
// POST /api/sgtx/road/seals/{id}/broken
// Body: { reason }
// Reports a broken seal — triggers a SealTampering RoadIncident (§18).
import { NextRequest, NextResponse } from "next/server";
import { reportBrokenSeal } from "@/lib/sgtx/road-corridor";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "seal id required" }, { status: 400 });
    }
    const body = await req.json();
    if (!body?.reason) {
      return NextResponse.json({ error: "reason required" }, { status: 400 });
    }
    const seal = await reportBrokenSeal(id, body.reason);
    return NextResponse.json({ seal });
  } catch (err: any) {
    logger.error("[api/road/seals/[id]/broken] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

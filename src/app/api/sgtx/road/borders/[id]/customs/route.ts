// @ts-nocheck
// POST /api/sgtx/road/borders/{id}/customs
// Body: { declarationNumber }
// Records customs presentation at the border.
import { NextRequest, NextResponse } from "next/server";
import { recordCustomsPresentation } from "@/lib/sgtx/road-corridor";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "border id required" }, { status: 400 });
    }
    const body = await req.json();
    if (!body?.declarationNumber) {
      return NextResponse.json(
        { error: "declarationNumber required" },
        { status: 400 },
      );
    }
    const result = await recordCustomsPresentation(id, body.declarationNumber);
    return NextResponse.json({ borderId: id, ...result });
  } catch (err: any) {
    logger.error("[api/road/borders/[id]/customs] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

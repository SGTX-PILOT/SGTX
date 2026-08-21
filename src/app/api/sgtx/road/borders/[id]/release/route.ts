// @ts-nocheck
// POST /api/sgtx/road/borders/{id}/release
// Body: { releaseReference }
// Records border release + updates the linked CustomsOperation row.
import { NextRequest, NextResponse } from "next/server";
import { recordBorderRelease } from "@/lib/sgtx/road-corridor";
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
    if (!body?.releaseReference) {
      return NextResponse.json(
        { error: "releaseReference required" },
        { status: 400 },
      );
    }
    const result = await recordBorderRelease(id, body.releaseReference);
    return NextResponse.json({ borderId: id, ...result });
  } catch (err: any) {
    logger.error("[api/road/borders/[id]/release] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// @ts-nocheck
// §4 Gap Analysis — GET by DB id
// GET /api/sgtx/integrations/gaps/[id]
import { NextResponse } from "next/server";
import { getGapRecord } from "@/lib/sgtx/gap-analysis";
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
    const gap = await getGapRecord(id);
    if (!gap) {
      return NextResponse.json({ error: "gap not found" }, { status: 404 });
    }
    return NextResponse.json({ gap });
  } catch (err: any) {
    logger.error("[api/sgtx/integrations/gaps/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

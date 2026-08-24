// @ts-nocheck
// GET /api/sgtx/jurisdiction/[code]/sources — list all regulatory sources
// attached to a jurisdiction.
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getRegulatorySources } from "@/lib/sgtx/jurisdiction";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;
    if (!code) {
      return NextResponse.json({ error: "code required" }, { status: 400 });
    }
    const sources = await getRegulatorySources(code);
    return NextResponse.json({
      jurisdictionCode: code,
      sources,
      count: sources.length,
    });
  } catch (err: any) {
    logger.error("[api/sgtx/jurisdiction/[code]/sources] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

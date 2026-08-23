// @ts-nocheck
// GET /api/sgtx/jurisdiction/[code] — get a single jurisdiction by code.
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getJurisdiction } from "@/lib/sgtx/jurisdiction";

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
    const jurisdiction = await getJurisdiction(code);
    if (!jurisdiction) {
      return NextResponse.json(
        { error: "jurisdiction not found", code },
        { status: 404 },
      );
    }
    return NextResponse.json({ jurisdiction });
  } catch (err: any) {
    logger.error("[api/sgtx/jurisdiction/[code]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

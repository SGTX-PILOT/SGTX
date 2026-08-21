// @ts-nocheck
// GET /api/sgtx/jurisdiction/[code]/children — list immediate child jurisdictions.
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getChildJurisdictions } from "@/lib/sgtx/jurisdiction";

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
    const children = await getChildJurisdictions(code);
    return NextResponse.json({ code, children, count: children.length });
  } catch (err: any) {
    logger.error("[api/sgtx/jurisdiction/[code]/children] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

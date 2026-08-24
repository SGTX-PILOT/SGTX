// @ts-nocheck
// GET /api/sgtx/jurisdiction/[code]/hierarchy — get the parent chain up to root.
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getJurisdictionHierarchy } from "@/lib/sgtx/jurisdiction";

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
    const hierarchy = await getJurisdictionHierarchy(code);
    return NextResponse.json({ code, hierarchy, depth: hierarchy.length });
  } catch (err: any) {
    logger.error("[api/sgtx/jurisdiction/[code]/hierarchy] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

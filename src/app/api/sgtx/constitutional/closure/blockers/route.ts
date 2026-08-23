// @ts-nocheck
// §E Closure Policy — get machine-readable blocker codes for a USTN
// GET /api/sgtx/constitutional/closure/blockers?ustn=X
import { NextResponse } from "next/server";
import { getClosureBlockers } from "@/lib/sgtx/closure-policy";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn") || undefined;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const blockers = await getClosureBlockers(ustn);
    return NextResponse.json({
      ustn,
      blockers,
      count: blockers.length,
      canClose: blockers.length === 0,
    });
  } catch (err: any) {
    logger.error("[api/constitutional/closure/blockers] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

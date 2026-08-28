// @ts-nocheck
/**
 * SGTX Part 82 — LC Documentary Matching API
 * GET /api/sgtx/lc-matching?ustn=<USTN>&lcId=<LC_ID>
 *   Returns: MatchingResult
 */

import { NextRequest, NextResponse } from "next/server";
import { matchLCDocuments } from "@/lib/sgtx/lc-matching";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ustn = searchParams.get("ustn");
    const lcId = searchParams.get("lcId");
    if (!ustn || !lcId) {
      return NextResponse.json(
        { ok: false, error: "ustn and lcId are both required" },
        { status: 400 },
      );
    }
    const result = await matchLCDocuments(ustn, lcId);
    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    logger.error("[api/lc-matching] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

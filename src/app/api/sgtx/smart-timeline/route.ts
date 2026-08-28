// @ts-nocheck
/**
 * SGTX Part 68 — Smart Timeline API
 * GET /api/sgtx/smart-timeline?ustn=<USTN>
 *   Returns unified, chronologically sorted timeline across 11 domains.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSmartTimeline, listTimelineDomains } from "@/lib/sgtx/smart-timeline";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ustn = searchParams.get("ustn");
    if (!ustn) {
      return NextResponse.json(
        { ok: false, error: "ustn is required", domains: listTimelineDomains() },
        { status: 400 },
      );
    }
    const events = await getSmartTimeline(ustn);
    const byDomain: Record<string, number> = {};
    for (const e of events) byDomain[e.domain] = (byDomain[e.domain] || 0) + 1;
    return NextResponse.json({
      ok: true,
      ustn,
      count: events.length,
      byDomain,
      events,
    });
  } catch (err: any) {
    logger.error("[api/smart-timeline] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// GET /api/sgtx/logistics/quote/[quoteId]/feasibility
// Check route feasibility: validates pickup → loading → cutoff → sailing →
// transit → customs → inspection → arrival → delivery → deadline → buffer.
//
// Query params (all optional): pickupDate, loadingDate, portCutoff, sailingDate,
// transitTimeDays, customsLeadDays, inspectionDays, deliveryDeadline (ISO strings).
// When no params are supplied, returns the latest persisted feasibility row.

import { NextRequest, NextResponse } from "next/server";
import { getCaller } from "@/lib/sgtx/auth/caller";
import { logger } from "@/lib/sgtx/logger";
import { checkRouteFeasibility, type RouteFeasibilityInput } from "@/lib/sgtx/logistics";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function toOptDate(v: string | null): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

function toOptInt(v: string | null): number | undefined {
  if (v === null || v === "") return undefined;
  const n = parseInt(v, 10);
  return isNaN(n) ? undefined : n;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ quoteId: string }> },
) {
  try {
    const caller = getCaller(req);
    if (!caller.isAuthenticated) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const { quoteId } = await ctx.params;
    const sp = req.nextUrl.searchParams;

    const hasParams =
      sp.get("pickupDate") ||
      sp.get("loadingDate") ||
      sp.get("portCutoff") ||
      sp.get("sailingDate");

    if (!hasParams) {
      const latest = await db.logisticsRouteFeasibility.findFirst({
        where: { quoteId },
        orderBy: { checkedAt: "desc" },
      });
      return NextResponse.json({ ok: true, latest });
    }

    const input: RouteFeasibilityInput = {
      quoteId,
      pickupDate: toOptDate(sp.get("pickupDate")),
      loadingDate: toOptDate(sp.get("loadingDate")),
      portCutoff: toOptDate(sp.get("portCutoff")),
      sailingDate: toOptDate(sp.get("sailingDate")),
      transitTimeDays: toOptInt(sp.get("transitTimeDays")),
      customsLeadDays: toOptInt(sp.get("customsLeadDays")),
      inspectionDays: toOptInt(sp.get("inspectionDays")),
      deliveryDeadline: toOptDate(sp.get("deliveryDeadline")),
    };
    const result = await checkRouteFeasibility(input);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("[logistics/quote/feasibility] error:", e);
    return NextResponse.json({ error: e?.message || "Failed to check feasibility" }, { status: 500 });
  }
}

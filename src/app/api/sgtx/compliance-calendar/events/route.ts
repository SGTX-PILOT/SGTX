// GET /api/sgtx/compliance-calendar/events — List upcoming compliance events
//
// Query params:
//   ?tenantGtid=X     (required)
//   ?status=PENDING   (optional — default PENDING, or "any" for all statuses)
//   ?eventType=X      (optional — e.g., LICENSE_RENEWAL)
//   ?days=90          (optional — window in days from now, default 90)
//   ?includeOverdue=true (optional — default true)
//   ?take=100         (optional — default 100, max 500)
//
// Response: { ok, events, count, window: { from, to } }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { listUpcomingEvents } from "@/lib/sgtx/compliance-calendar";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const tenantGtid = url.searchParams.get("tenantGtid");
    const status = url.searchParams.get("status") ?? undefined;
    const eventType = url.searchParams.get("eventType") ?? undefined;
    const daysParam = url.searchParams.get("days");
    const days = daysParam ? Math.min(365, Math.max(1, parseInt(daysParam, 10) || 90)) : 90;
    const includeOverdueParam = url.searchParams.get("includeOverdue");
    const includeOverdue = includeOverdueParam === null ? true : includeOverdueParam === "true";
    const takeParam = url.searchParams.get("take");
    const take = takeParam ? Math.min(500, parseInt(takeParam, 10) || 100) : 100;

    if (!tenantGtid) {
      return NextResponse.json(
        { error: "Missing required query param: tenantGtid" },
        { status: 400 },
      );
    }

    const now = new Date();
    const to = new Date(now.getTime() + days * 86_400_000);

    const events = await listUpcomingEvents({
      tenantGtid,
      from: now,
      to,
      status: status && status !== "any" ? status : undefined,
      eventType: eventType ?? undefined,
      take,
      includeOverdue,
    });

    return NextResponse.json({
      ok: true,
      events,
      count: events.length,
      window: { from: now.toISOString(), to: to.toISOString() },
    });
  } catch (e: any) {
    logger.error("[compliance-calendar/events] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

// @ts-nocheck
/**
 * G-13 — Carrier API route
 * GET /api/sgtx/logistics/carrier?action=schedules&origin=X&destination=Y&date=Z
 * GET /api/sgtx/logistics/carrier?action=track&container=ABC1234567
 * GET /api/sgtx/logistics/carrier?action=availability&port=X&carrier=Y
 * GET /api/sgtx/logistics/carrier?action=list (no params — list carriers)
 *
 * Returns: { ok: true, ...payload }
 */

import { NextRequest, NextResponse } from "next/server";
import {
  searchCarrierSchedules,
  trackContainer,
  getContainerAvailability,
  listSupportedCarriers,
} from "@/lib/sgtx/logistics/carrier-apis";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = (searchParams.get("action") || "list").toLowerCase();

    if (action === "list") {
      const carriers = listSupportedCarriers();
      return NextResponse.json({
        ok: true,
        action: "list",
        carriers,
        count: carriers.length,
      });
    }

    if (action === "schedules") {
      const origin = searchParams.get("origin") || "";
      const destination = searchParams.get("destination") || "";
      const date = searchParams.get("date") || new Date().toISOString().slice(0, 10);
      if (!origin || !destination) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "origin and destination are required for action=schedules " +
              "(UNLOCODE or city name)",
          },
          { status: 400 },
        );
      }
      const schedules = await searchCarrierSchedules(origin, destination, date);
      return NextResponse.json({
        ok: true,
        action: "schedules",
        origin,
        destination,
        date,
        schedules,
        count: schedules.length,
      });
    }

    if (action === "track") {
      const container = searchParams.get("container") || "";
      if (!container) {
        return NextResponse.json(
          { ok: false, error: "container is required for action=track" },
          { status: 400 },
        );
      }
      const tracking = await trackContainer(container);
      return NextResponse.json({
        ok: true,
        action: "track",
        tracking,
      });
    }

    if (action === "availability") {
      const port = searchParams.get("port") || "";
      const carrier = searchParams.get("carrier") || "";
      if (!port || !carrier) {
        return NextResponse.json(
          {
            ok: false,
            error: "port and carrier are required for action=availability",
          },
          { status: 400 },
        );
      }
      const availability = await getContainerAvailability(port, carrier);
      return NextResponse.json({
        ok: true,
        action: "availability",
        availability,
      });
    }

    return NextResponse.json(
      {
        ok: false,
        error: `unknown action: ${action}. Valid: list | schedules | track | availability`,
      },
      { status: 400 },
    );
  } catch (err: any) {
    logger.error("[api/logistics/carrier] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

/** POST — same capabilities, JSON body for programmatic callers. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = (body?.action || "list").toLowerCase();

    if (action === "schedules") {
      const schedules = await searchCarrierSchedules(
        body.origin,
        body.destination,
        body.date,
      );
      return NextResponse.json({ ok: true, action, schedules, count: schedules.length });
    }
    if (action === "track") {
      const tracking = await trackContainer(body.container);
      return NextResponse.json({ ok: true, action, tracking });
    }
    if (action === "availability") {
      const availability = await getContainerAvailability(body.port, body.carrier);
      return NextResponse.json({ ok: true, action, availability });
    }
    if (action === "list") {
      return NextResponse.json({
        ok: true,
        action,
        carriers: listSupportedCarriers(),
      });
    }
    return NextResponse.json(
      { ok: false, error: `unknown action: ${action}` },
      { status: 400 },
    );
  } catch (err: any) {
    logger.error("[api/logistics/carrier] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

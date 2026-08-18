// GET /api/sgtx/demurrage/port-free-time — Get port free time
//
// Query params:
//   ?port=EGALX                    (required — UN/LOCODE)
//   ?containerType=40FT            (optional — defaults to "40FT")
//
// Lazy-seeds the PortFreeTime table from PORT_FREE_TIME constant if the
// table is empty (first-call bootstrap). After seeding, returns the row
// for the requested (port, containerType).
//
// Response:
//   {
//     port, containerType, freeTimeDays, extensionDays, extensionPolicy,
//     portInfo: { country, portName }, source
//   }
//
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import {
  PORT_FREE_TIME,
  getPortFreeTimeEntry,
  seedPortFreeTime,
} from "@/lib/sgtx/demurrage";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const port = url.searchParams.get("port");
    const containerType = url.searchParams.get("containerType") || "40FT";

    if (!port) {
      return NextResponse.json(
        { error: "Missing required query param: port" },
        { status: 400 },
      );
    }

    const portInfo = getPortFreeTimeEntry(port);

    // Try DB first (defensive — table may be unseeded)
    let row: any = null;
    try {
      // Lazy seed if empty
      const count = await (db as any).portFreeTime.count();
      if (count === 0) {
        logger.info("[demurrage/port-free-time] table empty — seeding from PORT_FREE_TIME");
        await seedPortFreeTime();
      }

      row = await (db as any).portFreeTime.findUnique({
        where: { portUnlocode_containerType: { portUnlocode: port.toUpperCase(), containerType } },
      });

      // Fallback: if the specific container type isn't seeded, try a generic lookup.
      if (!row) {
        row = await (db as any).portFreeTime.findFirst({
          where: { portUnlocode: port.toUpperCase() },
        });
      }
    } catch (e: any) {
      logger.warn("[demurrage/port-free-time] DB lookup failed, falling back to constant", {
        error: e?.message,
      });
    }

    // Compose response — prefer DB row, fall back to PORT_FREE_TIME constant,
    // finally to a sane default (7 days, no extension).
    if (row) {
      return NextResponse.json({
        port: row.portUnlocode,
        containerType,
        freeTimeDays: row.freeTimeDays,
        extensionDays: row.extensionDays,
        extensionPolicy: row.extensionPolicy,
        portInfo,
        source: row.source || "DB",
        carrierSpecific: row.carrierSpecific,
      });
    }

    // Fall back to constant
    if (portInfo) {
      return NextResponse.json({
        port: port.toUpperCase(),
        containerType,
        freeTimeDays: portInfo.freeTimeDays,
        extensionDays: portInfo.extensionDays,
        extensionPolicy: portInfo.extensionPolicy,
        portInfo,
        source: "PORT_FREE_TIME_CONSTANT",
        carrierSpecific: false,
      });
    }

    // Unknown port — return default
    return NextResponse.json({
      port: port.toUpperCase(),
      containerType,
      freeTimeDays: 7,
      extensionDays: 0,
      extensionPolicy: "NOT_AVAILABLE",
      portInfo: null,
      source: "DEFAULT_FALLBACK",
      carrierSpecific: false,
      note: `Port ${port} not in PORT_FREE_TIME — using 7-day industry default.`,
    });
  } catch (e: any) {
    logger.error("[demurrage/port-free-time] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

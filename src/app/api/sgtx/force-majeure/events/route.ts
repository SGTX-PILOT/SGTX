// GET /api/sgtx/force-majeure/events — list active force-majeure events
//
// This route reconciles two sources of force-majeure data:
//   (1) The seeded in-memory list (and any registered feeds) exposed by
//       the existing force-majeure lib at src/lib/sgtx/compliance/force-majeure.ts
//       via `getActiveForceMajeureEvents()`.
//   (2) Force-majeure events persisted in the database (`ForceMajeureEvent`
//       model, status='ACTIVE').
//
// The DB rows are the authoritative records for claim linkage (a claim
// references an `eventId` that must be a real DB row id, not an in-memory
// seed id). The in-memory events are surfaced for situational awareness
// (operational risk visibility) but cannot be referenced by claims until
// they are persisted as DB rows.
//
// Query params:
//   ?severity=minor|major|catastrophic   — optional filter
//
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { getActiveForceMajeureEvents } from "@/lib/sgtx/compliance/force-majeure";

const VALID_SEVERITY = new Set(["minor", "major", "catastrophic"]);

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const severity = url.searchParams.get("severity") || "";

    // 1) Pull persisted DB events (status=ACTIVE).
    const where: any = { status: "ACTIVE" };
    if (severity && VALID_SEVERITY.has(severity)) {
      where.severity = severity.toUpperCase();
    }
    const dbEvents = await (db as any).forceMajeureEvent.findMany({
      where,
      orderBy: { startDate: "desc" },
    });

    // 2) Pull in-memory seeded events (situational awareness only).
    let inMemoryEvents: any[] = [];
    try {
      const libEvents = await getActiveForceMajeureEvents();
      inMemoryEvents = (libEvents || []).map((e) => ({
        id: e.id,
        eventType: e.type,
        title: e.title,
        description: e.description,
        severity: e.severity.toUpperCase(),
        affectedCountries: e.affectedRegions,
        affectedPorts: e.affectedPorts,
        affectedCorridors: e.affectedCorridors,
        startDate: e.startsAt,
        endDate: e.endsAt,
        source: e.source,
        confidence: e.confidence,
        origin: "seed_lib",
      }));
      if (severity && VALID_SEVERITY.has(severity)) {
        inMemoryEvents = inMemoryEvents.filter(
          (e) => e.severity.toLowerCase() === severity.toLowerCase(),
        );
      }
    } catch (e: any) {
      // In-memory feed is best-effort — never block the DB list.
      logger.warn("[force-majeure/events] in-memory feed failed", {
        error: e?.message || String(e),
      });
    }

    return NextResponse.json({
      ok: true,
      dbEvents: dbEvents || [],
      inMemoryEvents,
      count: (dbEvents?.length || 0) + inMemoryEvents.length,
    });
  } catch (e: any) {
    logger.error("[force-majeure/events] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/status — Public status page (blueprint Part 25.5)
export async function GET(req: NextRequest) {
  const components = ["governor", "trade", "inbox", "shipment", "ai", "payment", "release"];
  const events = await db.statusPageEvent.findMany({
    where: { resolvedAt: null },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  const maintenance = await db.maintenanceWindow.findMany({
    where: { status: "SCHEDULED" },
    orderBy: { scheduledStart: "asc" },
    take: 5,
  });
  // Determine overall status
  const hasOutage = events.some(e => e.status === "major_outage");
  const hasDegraded = events.some(e => e.status === "degraded" || e.status === "partial_outage");
  const overall = hasOutage ? "major_outage" : hasDegraded ? "degraded" : "operational";

  return NextResponse.json({
    overall,
    components: components.map(c => {
      const latestEvent = events.find(e => e.component === c);
      return { component: c, status: latestEvent?.status || "operational", message: latestEvent?.message };
    }),
    activeIncidents: events.map(e => ({ id: e.id, component: e.component, status: e.status, message: e.message, createdAt: e.createdAt })),
    upcomingMaintenance: maintenance.map(m => ({ id: m.id, title: m.title, description: m.description, scheduledStart: m.scheduledStart, scheduledEnd: m.scheduledEnd })),
    lastUpdated: new Date().toISOString(),
  });
}

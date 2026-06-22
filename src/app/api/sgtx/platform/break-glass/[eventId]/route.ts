// GET /api/sgtx/platform/break-glass/[eventId] — single break-glass event details
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  // eventId here is the human-readable BG-YYYYMMDD-NNN identifier
  const event = await db.breakGlassEvent.findUnique({
    where: { eventId },
  });
  if (!event) {
    return NextResponse.json(
      { error: `Break-glass event not found: ${eventId}` },
      { status: 404 },
    );
  }

  // Look up related Governor decision, Incident, and lifecycle history for context.
  const [governorDecision, incident, lifecycleHistory, feeLocks] = await Promise.all([
    db.governorDecision.findFirst({
      where: { action: "break_glass.deny_all", payload: { contains: eventId } },
      orderBy: { createdAt: "desc" },
    }),
    db.incident.findFirst({
      where: { title: { contains: eventId } },
      orderBy: { openedAt: "desc" },
    }),
    db.tenantLifecycleHistory.findFirst({
      where: {
        tenantGtid: event.targetGtid,
        reason: { contains: eventId },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.feeLock.findMany({
      where: { frozenReason: { contains: `break-glass:${eventId}` } },
    }),
  ]);

  return NextResponse.json({
    event,
    related: {
      governorDecision,
      incident,
      lifecycleHistory,
      feeLocks,
    },
  });
}

// POST /api/sgtx/platform/break-glass/[eventId]/extend
// Body: { extendedBy, additionalHours, reason }
// Extends an ACTIVE break-glass event's expiresAt by `additionalHours` (1..168).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const MAX_EXTEND_HOURS = 168; // 7 days

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const body = await req.json().catch(() => null);
  if (!body || !body.extendedBy || typeof body.additionalHours !== "number" || !body.reason) {
    return NextResponse.json(
      { error: "extendedBy, additionalHours (number), and reason are required" },
      { status: 400 },
    );
  }

  const event = await db.breakGlassEvent.findUnique({ where: { eventId } });
  if (!event) {
    return NextResponse.json(
      { error: `Break-glass event not found: ${eventId}` },
      { status: 404 },
    );
  }
  if (event.status !== "ACTIVE") {
    return NextResponse.json(
      { error: `Cannot extend a ${event.status} break-glass event (only ACTIVE).` },
      { status: 409 },
    );
  }

  const addHours = Math.max(1, Math.min(MAX_EXTEND_HOURS, Math.floor(body.additionalHours)));
  const previousExpiresAt = event.expiresAt;
  // Extension starts from max(now, current expiry) so an already-expired event
  // can be revived back to ACTIVE for `addHours` from now.
  const base = previousExpiresAt.getTime() > Date.now() ? previousExpiresAt : new Date();
  const newExpiresAt = new Date(base.getTime() + addHours * 3600 * 1000);

  // Append extension record to the actions JSON
  const previousActions: any[] = event.actions ? JSON.parse(event.actions) : [];
  const extensionEntry = {
    type: "EXTEND",
    extendedBy: body.extendedBy,
    additionalHours: addHours,
    reason: body.reason,
    previousExpiresAt: previousExpiresAt.toISOString(),
    newExpiresAt: newExpiresAt.toISOString(),
    at: new Date().toISOString(),
  };
  previousActions.push(extensionEntry);

  const updated = await db.breakGlassEvent.update({
    where: { id: event.id },
    data: {
      expiresAt: newExpiresAt,
      actions: JSON.stringify(previousActions),
    },
  });

  // Activity log
  await db.activity.create({
    data: {
      actorGtid: body.extendedBy,
      action: "BREAK_GLASS_EXTENDED",
      description: `Break-glass ${eventId} extended by ${addHours}h by ${body.extendedBy}. New expiry: ${newExpiresAt.toISOString()}. Reason: ${body.reason}`,
      type: "WARNING",
      metadata: JSON.stringify({ eventId, additionalHours: addHours, previousExpiresAt: previousExpiresAt.toISOString(), newExpiresAt: newExpiresAt.toISOString() }),
    },
  });

  // Smart Inbox notification
  await db.inboxItem.create({
    data: {
      tenantGtid: "SGTX-ZZ-ADM-000001-A1B2",
      category: "COMPLIANCE",
      priority: 95,
      title: `Break-Glass ${eventId} Extended +${addHours}h`,
      description: `Extended by ${body.extendedBy}. New expiry: ${newExpiresAt.toISOString()}. Reason: ${body.reason}`,
      ctaLabel: "View Break-Glass",
      deadline: newExpiresAt,
    },
  });
  await db.inboxItem.create({
    data: {
      tenantGtid: event.targetGtid,
      category: "COMPLIANCE",
      priority: 95,
      title: `Break-Glass Suspension Extended — ${eventId}`,
      description: `Your account suspension has been extended by ${addHours}h. New expiry: ${newExpiresAt.toISOString()}. Reason: ${body.reason}. Please contact compliance.`,
      deadline: newExpiresAt,
    },
  });

  return NextResponse.json({
    ok: true,
    event: updated,
    extension: extensionEntry,
  });
}

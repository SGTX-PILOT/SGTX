import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { freshDb } from "@/lib/db-fresh";

const _db = (freshDb ?? db) as typeof db;

// POST /api/sgtx/platform/break-glass/[eventId]/resolve — Resolve break-glass
export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const body = await req.json().catch(() => ({}));
  const { resolvedBy, resolution } = body;

  if (!resolvedBy) return NextResponse.json({ error: "resolvedBy required" }, { status: 400 });

  const event = await _db.breakGlassEvent.findUnique({ where: { eventId } });
  if (!event) return NextResponse.json({ error: "Break-glass event not found" }, { status: 404 });
  if (event.status !== "ACTIVE") return NextResponse.json({ error: `Break-glass already ${event.status}` }, { status: 409 });

  // Resolve
  const updated = await _db.breakGlassEvent.update({
    where: { eventId },
    data: {
      status: "RESOLVED",
      resolvedAt: new Date(),
      resolvedBy,
      resolution: resolution || "Resolved without additional notes",
    },
  });

  // Unfreeze the tenant — restore previous lifecycle state
  const restoreState = event.previousLifecycleState || "VERIFIED";
  await _db.tenant.update({
    where: { gtid: event.targetGtid },
    data: { lifecycleState: restoreState },
  }).catch(() => null);

  // Activity log
  await _db.activity.create({
    data: {
      actorGtid: resolvedBy,
      action: "BREAK_GLASS_RESOLVED",
      type: "SUCCESS",
      description: `Break-glass ${eventId} resolved for ${event.targetGtid}. Tenant restored to ${restoreState}. Resolution: ${resolution || "N/A"}`,
    },
  }).catch(() => null);

  // Smart Inbox
  await _db.inboxItem.create({
    data: { tenantGtid: "SGTX-EG-GOV-000001-9A0B", category: "COMPLIANCE", priority: 80, title: `Break-Glass Resolved: ${eventId}`, description: `Tenant ${event.targetGtid} restored to ${restoreState}.`, ctaLabel: "View" },
  }).catch(() => null);
  await _db.inboxItem.create({
    data: { tenantGtid: event.targetGtid, category: "GENERAL", priority: 70, title: `Account Restored`, description: `Your account has been restored to ${restoreState}. Break-glass ${eventId} resolved.`, ctaLabel: "Continue" },
  }).catch(() => null);

  return NextResponse.json({ ok: true, event: updated, message: `Break-glass resolved. Tenant restored to ${restoreState}.` });
}

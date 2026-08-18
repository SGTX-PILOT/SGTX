// SGTX Add-On 18 — Trade Compliance Calendar
//
// Per-tenant calendar of upcoming trade compliance events: license renewals,
// certificate expirations, regulatory filing deadlines, audit windows, and
// sanctions-screening refresh cycles. The calendar is the tenant's single
// view of "what compliance obligation is coming due in the next N days".
//
// Model (already in schema.prisma — Add-On 18):
//   ComplianceCalendarEvent — one row per obligation, with reminderDays JSON
//                              array (e.g., [30,14,7,1]) for staged reminders
//
// What this module does:
//   1. listUpcomingEvents(tenantGtid, opts) — fetch events sorted by date,
//      with optional filters for status, eventType, and a `from`/`to` window.
//      Default window is "next 90 days" (most useful for the dashboard view).
//   2. createComplianceEvent(input) — register a new event.
//   3. markEventCompleted(eventId) — flip status to COMPLETED + stamp
//      completedAt. Idempotent — re-marking a completed event returns the
//      existing row without error.
//
// All DB calls wrapped in try/catch (defensive). The library never throws.

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ Types ============

export interface ComplianceEventInput {
  tenantGtid: string;
  eventType: string;        // LICENSE_RENEWAL | CERTIFICATE_EXPIRY | FILING_DEADLINE | AUDIT | SANCTIONS_REFRESH | INSPECTION | OTHER
  title: string;
  description?: string | null;
  eventDate: Date | string;  // ISO date string or Date object
  reminderDays?: number[] | null;   // e.g., [30, 14, 7, 1]
  linkedUstn?: string | null;
}

export interface ComplianceEventListOptions {
  tenantGtid: string;
  from?: Date;              // default: now
  to?: Date;                // default: now + 90 days
  status?: string;          // PENDING | COMPLETED | OVERDUE | CANCELLED
  eventType?: string;
  take?: number;            // default 100, max 500
  includeOverdue?: boolean; // include events where eventDate < now (default true)
}

// ============ Public functions ============

/**
 * List upcoming compliance calendar events for a tenant. Defensive — returns
 * [] on failure.
 *
 * By default returns events in the next 90 days that are PENDING. Pass
 * `includeOverdue=true` to also include events whose date has passed but are
 * still PENDING (the dashboard typically wants this).
 */
export async function listUpcomingEvents(
  opts: ComplianceEventListOptions,
): Promise<any[]> {
  try {
    const now = new Date();
    const from = opts.from ?? now;
    const to = opts.to ?? new Date(now.getTime() + 90 * 86_400_000);

    const where: any = { tenantGtid: opts.tenantGtid };
    if (opts.status) where.status = opts.status.toUpperCase();
    if (opts.eventType) where.eventType = opts.eventType.toUpperCase();

    // Date window: events occurring between `from` and `to`. If includeOverdue
    // is true (default), also include overdue PENDING events whose eventDate
    // is before `from`.
    if (opts.includeOverdue !== false) {
      where.OR = [
        { eventDate: { gte: from, lte: to } },
        { eventDate: { lt: from }, status: "PENDING" },
      ];
    } else {
      where.eventDate = { gte: from, lte: to };
    }

    return await (db as any).complianceCalendarEvent.findMany({
      where,
      orderBy: { eventDate: "asc" },
      take: Math.min(500, opts.take ?? 100),
    });
  } catch (e: any) {
    logger.warn("[compliance-calendar] listUpcomingEvents failed", {
      error: e?.message || String(e),
    });
    return [];
  }
}

/**
 * Create a new compliance calendar event. Defensive — returns null on failure.
 */
export async function createComplianceEvent(
  input: ComplianceEventInput,
): Promise<{ id: string; status: string } | null> {
  try {
    const eventDate = input.eventDate instanceof Date
      ? input.eventDate
      : new Date(input.eventDate);
    if (isNaN(eventDate.getTime())) {
      logger.warn("[compliance-calendar] invalid eventDate", { input });
      return null;
    }

    const reminderDaysJson = Array.isArray(input.reminderDays)
      ? JSON.stringify(input.reminderDays)
      : null;

    const row = await (db as any).complianceCalendarEvent.create({
      data: {
        tenantGtid: input.tenantGtid,
        eventType: input.eventType.toUpperCase(),
        title: input.title,
        description: input.description ?? null,
        eventDate,
        reminderDays: reminderDaysJson,
        status: "PENDING",
        linkedUstn: input.linkedUstn ?? null,
      },
    });
    return { id: row.id, status: row.status };
  } catch (e: any) {
    logger.error("[compliance-calendar] createComplianceEvent failed", {
      error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Mark an event as completed. Idempotent — if already COMPLETED, returns the
 * existing row without error. Defensive — returns null on failure.
 */
export async function markEventCompleted(
  eventId: string,
  completedAt: Date = new Date(),
): Promise<{ id: string; status: string; completedAt: Date } | null> {
  try {
    // Check current state first — idempotent if already completed.
    const existing = await (db as any).complianceCalendarEvent.findUnique({
      where: { id: eventId },
    });
    if (!existing) {
      logger.warn("[compliance-calendar] markEventCompleted — event not found", { eventId });
      return null;
    }
    if (existing.status === "COMPLETED" && existing.completedAt) {
      return {
        id: existing.id,
        status: existing.status,
        completedAt: existing.completedAt,
      };
    }

    const row = await (db as any).complianceCalendarEvent.update({
      where: { id: eventId },
      data: {
        status: "COMPLETED",
        completedAt,
      },
    });
    return { id: row.id, status: row.status, completedAt: row.completedAt };
  } catch (e: any) {
    logger.error("[compliance-calendar] markEventCompleted failed", {
      eventId, error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Convenience: derive whether a PENDING event is overdue (eventDate < now).
 */
export function isEventOverdue(event: { eventDate: Date | string; status: string }): boolean {
  if (event.status !== "PENDING") return false;
  const d = event.eventDate instanceof Date ? event.eventDate : new Date(event.eventDate);
  return !isNaN(d.getTime()) && d.getTime() < Date.now();
}

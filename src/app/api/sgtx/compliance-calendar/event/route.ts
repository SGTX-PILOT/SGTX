// POST /api/sgtx/compliance-calendar/event — Create a compliance calendar event
//
// Body:
//   {
//     tenantGtid: string,
//     eventType: "LICENSE_RENEWAL"|"CERTIFICATE_EXPIRY"|"FILING_DEADLINE"|"AUDIT"|"SANCTIONS_REFRESH"|"INSPECTION"|"OTHER",
//     title: string,
//     description?: string,
//     eventDate: string (ISO),
//     reminderDays?: number[],  // e.g., [30, 14, 7, 1]
//     linkedUstn?: string
//   }
//
// Response: { ok, eventId, status }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { createComplianceEvent } from "@/lib/sgtx/compliance-calendar";

const VALID_EVENT_TYPES = new Set([
  "LICENSE_RENEWAL", "CERTIFICATE_EXPIRY", "FILING_DEADLINE",
  "AUDIT", "SANCTIONS_REFRESH", "INSPECTION", "OTHER",
]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      tenantGtid,
      eventType,
      title,
      description,
      eventDate,
      reminderDays,
      linkedUstn,
    } = body || {};

    const missing: string[] = [];
    if (!tenantGtid) missing.push("tenantGtid");
    if (!eventType) missing.push("eventType");
    if (!title) missing.push("title");
    if (!eventDate) missing.push("eventDate");
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 },
      );
    }

    if (!VALID_EVENT_TYPES.has(String(eventType).toUpperCase())) {
      return NextResponse.json(
        { error: `Invalid eventType. Must be one of: ${[...VALID_EVENT_TYPES].join(", ")}` },
        { status: 400 },
      );
    }

    if (reminderDays !== undefined && reminderDays !== null) {
      if (!Array.isArray(reminderDays) || !reminderDays.every((d) => typeof d === "number" && d >= 0)) {
        return NextResponse.json(
          { error: "reminderDays must be an array of non-negative numbers" },
          { status: 400 },
        );
      }
    }

    const created = await createComplianceEvent({
      tenantGtid,
      eventType,
      title,
      description: description ?? null,
      eventDate,
      reminderDays: reminderDays ?? null,
      linkedUstn: linkedUstn ?? null,
    });

    if (!created) {
      return NextResponse.json(
        { ok: false, error: "Failed to persist compliance calendar event (see server logs)" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      eventId: created.id,
      status: created.status,
    });
  } catch (e: any) {
    logger.error("[compliance-calendar/event] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

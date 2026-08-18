// POST /api/sgtx/security/incident — Report a new maritime security incident
//
// Body:
//   {
//     incidentType: "PIRACY"|"ARMED_ROBBERY"|"CONFLICT"|"WEATHER"|"STOWAWAY"|"CYBER"|"OTHER",
//     latitude?: number,
//     longitude?: number,
//     description?: string,
//     severity: "LOW"|"MEDIUM"|"HIGH"|"CRITICAL",
//     occurredAt?: string (ISO),
//     source?: string  (e.g., "GOG:MDAT" for corridor-coded attribution)
//   }
//
// Persists a MaritimeSecurityIncident row. The `source` field is used to
// attribute the incident to a corridor (e.g., "GOG:MDAT-GoG-2025-Q1" → the
// engine matches it against corridorCode "GOG" via substring).
//
// Response: { ok, incidentId }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { reportMaritimeSecurityIncident } from "@/lib/sgtx/security";

const VALID_INCIDENT_TYPES = new Set([
  "PIRACY", "ARMED_ROBBERY", "CONFLICT", "WEATHER", "STOWAWAY", "CYBER", "OTHER",
]);
const VALID_SEVERITIES = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      incidentType,
      latitude,
      longitude,
      description,
      severity,
      occurredAt,
      source,
    } = body || {};

    const missing: string[] = [];
    if (!incidentType) missing.push("incidentType");
    if (!severity) missing.push("severity");
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 },
      );
    }

    if (!VALID_INCIDENT_TYPES.has(String(incidentType).toUpperCase())) {
      return NextResponse.json(
        { error: `Invalid incidentType. Must be one of: ${[...VALID_INCIDENT_TYPES].join(", ")}` },
        { status: 400 },
      );
    }
    if (!VALID_SEVERITIES.has(String(severity).toUpperCase())) {
      return NextResponse.json(
        { error: `Invalid severity. Must be one of: ${[...VALID_SEVERITIES].join(", ")}` },
        { status: 400 },
      );
    }

    if (latitude !== undefined && latitude !== null && (typeof latitude !== "number" || latitude < -90 || latitude > 90)) {
      return NextResponse.json(
        { error: "latitude must be a number between -90 and 90" },
        { status: 400 },
      );
    }
    if (longitude !== undefined && longitude !== null && (typeof longitude !== "number" || longitude < -180 || longitude > 180)) {
      return NextResponse.json(
        { error: "longitude must be a number between -180 and 180" },
        { status: 400 },
      );
    }

    const created = await reportMaritimeSecurityIncident({
      incidentType,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      description: description ?? null,
      severity,
      occurredAt: occurredAt ?? null,
      source: source ?? null,
    });

    if (!created) {
      return NextResponse.json(
        { ok: false, error: "Failed to persist maritime security incident (see server logs)" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, incidentId: created.id });
  } catch (e: any) {
    logger.error("[security/incident] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

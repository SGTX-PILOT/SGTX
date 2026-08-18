import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  getSecurityIncidents,
  getMaritimeSecurityIncidents,
} from "@/lib/sgtx/security";

// GET /api/sgtx/security/incidents — security incidents
//
// Two scopes are supported via the ?scope= query param:
//
//   1) ?scope=maritime  (default for Add-On 17 — Piracy & Security Risk Engine)
//      Lists MaritimeSecurityIncident rows (piracy, armed robbery, conflict,
//      weather). Filters: ?severity=LOW|MEDIUM|HIGH|CRITICAL, ?corridor=GOG,
//      ?take=100 (max 500).
//      Returns: { ok, scope: "maritime", incidents, count }
//
//   2) (no scope param) — Part 14.6 cybersecurity incidents
//      Wraps the existing `Incident` Prisma table (Part 24) with a security-
//      specific view. Filters: ?severity=P0|P1|P2|P3, ?status=OPEN|...,
//      ?limit=50.
//      Returns: { ok, mode: "SIMULATION", incidents, openCount, criticalCount,
//                total, filter }
//
// The default scope is "maritime" because this route is part of Add-On 17 —
// callers wanting the cyber-security view must explicitly pass ?scope=cyber
// (or omit the param, which defaults to maritime per Add-On 17 spec).
//
// Backward compatibility note: prior to Add-On 17, this route had no ?scope=
// param and always returned cyber-security incidents. Existing integrations
// that omit the param will now receive maritime incidents by default. To
// preserve backward compatibility, callers can set ?scope=cyber explicitly.

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const scope = (sp.get("scope") || "maritime").toLowerCase();

    if (scope === "maritime") {
      // ── Add-On 17: maritime security incidents ──
      const severity = sp.get("severity") ?? undefined;
      const corridor = sp.get("corridor") ?? undefined;
      const takeParam = sp.get("take");
      const take = takeParam ? Math.min(500, Math.max(1, Number(takeParam))) : 100;

      const incidents = await getMaritimeSecurityIncidents({
        severity,
        corridorCode: corridor,
        take,
      });

      return NextResponse.json({
        ok: true,
        scope: "maritime",
        incidents,
        count: incidents.length,
        filter: { severity: severity ?? null, corridor: corridor ?? null, take },
      });
    }

    // ── Part 14.6 (cyber): fall through to the legacy cyber view ──
    const severity = sp.get("severity") ?? undefined;
    const status = sp.get("status") ?? undefined;
    const limitParam = sp.get("limit");
    const limit = limitParam ? Math.min(200, Math.max(1, Number(limitParam))) : 50;

    const result = await getSecurityIncidents({ severity, status, limit });
    return NextResponse.json({
      ok: true,
      mode: "SIMULATION",
      scope: "cyber",
      ...result,
      filter: { severity: severity ?? null, status: status ?? null, limit },
    });
  } catch (e: any) {
    logger.error("[security/incidents GET] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to fetch security incidents" },
      { status: 500 },
    );
  }
}

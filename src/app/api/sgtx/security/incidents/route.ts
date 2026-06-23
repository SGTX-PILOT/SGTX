import { NextRequest, NextResponse } from "next/server";
import { getSecurityIncidents } from "@/lib/sgtx/security";

// GET /api/sgtx/security/incidents — security incidents
//
// Blueprint Part 14.6 — security incident tracker. Wraps the existing
// `Incident` Prisma table (Part 24) with a security-specific view.
//
// Query params (all optional):
//   ?severity=P0|P1|P2|P3  — filter by severity
//   ?status=OPEN|INVESTIGATING|RESOLVED|CLOSED  — filter by status
//   ?limit=50              — max results (default 50)
//
// Returns:
//   { incidents, openCount, criticalCount, total }
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const severity = sp.get("severity") ?? undefined;
    const status = sp.get("status") ?? undefined;
    const limitParam = sp.get("limit");
    const limit = limitParam ? Math.min(200, Math.max(1, Number(limitParam))) : 50;

    const result = await getSecurityIncidents({ severity, status, limit });
    return NextResponse.json({
      ok: true,
      mode: "SIMULATION",
      ...result,
      filter: { severity: severity ?? null, status: status ?? null, limit },
    });
  } catch (e: any) {
    console.error("[security/incidents GET] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to fetch security incidents" },
      { status: 500 },
    );
  }
}

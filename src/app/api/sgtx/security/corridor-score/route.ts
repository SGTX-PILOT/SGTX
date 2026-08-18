// GET /api/sgtx/security/corridor-score — Get corridor security score
//
// Query params:
//   ?corridor=GOG     (required — corridor code, e.g., GOG / GOA / SOMALIA / SCS)
//   ?forceRefresh=true (optional — bypass the 24h cache and recompute)
//
// Returns the CorridorSecurityScore for the corridor. Uses a 24h cache —
// if a recent score exists in the CorridorSecurityScore table, it's returned
// directly; otherwise the engine recomputes from MaritimeSecurityIncident
// rows and persists a new score.
//
// Response: { ok, result }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { assessCorridorRisk } from "@/lib/sgtx/security";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const corridor = url.searchParams.get("corridor");
    const forceRefresh = url.searchParams.get("forceRefresh") === "true";

    if (!corridor) {
      return NextResponse.json(
        { error: "Missing required query param: corridor" },
        { status: 400 },
      );
    }

    const result = await assessCorridorRisk(corridor, { forceRefresh });

    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    logger.error("[security/corridor-score] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

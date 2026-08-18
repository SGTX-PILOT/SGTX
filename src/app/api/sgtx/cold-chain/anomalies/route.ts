// GET /api/sgtx/cold-chain/anomalies?ustn=X
//
// List cold chain anomalies for a USTN, ordered by most recent first.
//
// Query params:
//   ?ustn=USTN-...         (required)
//   ?resolved=false        (optional — filter by resolved flag)
//   ?severity=HIGH         (optional — filter by severity)
//
// Response:
//   { ustn, anomalies: [...], count }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { listAnomalies } from "@/lib/sgtx/cold-chain";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn");
    if (!ustn) {
      return NextResponse.json({ error: "Missing required query param: ustn" }, { status: 400 });
    }

    const resolvedParam = url.searchParams.get("resolved");
    const severity = url.searchParams.get("severity") || undefined;
    const resolved = resolvedParam === null
      ? undefined
      : resolvedParam === "true";

    const anomalies = await listAnomalies(ustn, { resolved, severity });

    return NextResponse.json({ ustn, anomalies, count: anomalies.length });
  } catch (e: any) {
    logger.error("[cold-chain/anomalies] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

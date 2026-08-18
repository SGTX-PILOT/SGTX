// GET /api/sgtx/fta/claims — List FTA preference claims for a shipment
//
// Query params:
//   ?ustn=X     (required — USTN of the shipment)
//   ?take=50    (optional — default 50, max 500)
//
// Response: { ok, claims, count }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { listFtaClaims } from "@/lib/sgtx/fta";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn");
    const takeParam = url.searchParams.get("take");
    const take = takeParam ? Math.min(500, parseInt(takeParam, 10) || 50) : 50;

    if (!ustn) {
      return NextResponse.json(
        { error: "Missing required query param: ustn" },
        { status: 400 },
      );
    }

    const claims = await listFtaClaims(ustn, take);

    return NextResponse.json({
      ok: true,
      claims,
      count: claims.length,
    });
  } catch (e: any) {
    logger.error("[fta/claims] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

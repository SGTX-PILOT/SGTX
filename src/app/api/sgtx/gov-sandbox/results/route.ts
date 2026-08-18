// GET /api/sgtx/gov-sandbox/results — Get test results for a sandbox API
//
// Query params:
//   ?apiId=X    (required — GovernmentApiSandbox row id)
//   ?take=50    (optional — default 50, max 500)
//
// Response: { ok, results, count }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getTestResults } from "@/lib/sgtx/gov-sandbox";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const apiId = url.searchParams.get("apiId");
    const takeParam = url.searchParams.get("take");
    const take = takeParam ? Math.min(500, parseInt(takeParam, 10) || 50) : 50;

    if (!apiId) {
      return NextResponse.json(
        { error: "Missing required query param: apiId" },
        { status: 400 },
      );
    }

    const results = await getTestResults(apiId, take);

    return NextResponse.json({
      ok: true,
      results,
      count: results.length,
    });
  } catch (e: any) {
    logger.error("[gov-sandbox/results] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

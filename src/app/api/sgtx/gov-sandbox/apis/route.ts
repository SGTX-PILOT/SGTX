// GET /api/sgtx/gov-sandbox/apis — List government APIs per country
//
// Query params:
//   ?countryCode=EG  (optional — filter to a single country)
//   ?seed=true       (optional — lazy-seed well-known sandbox endpoints)
//
// Response: { ok, apis, count, seeded }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  listGovernmentApis,
  seedWellKnownSandboxes,
} from "@/lib/sgtx/gov-sandbox";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const countryCode = url.searchParams.get("countryCode") ?? undefined;
    const shouldSeed = url.searchParams.get("seed") === "true";

    let seeded = 0;
    if (shouldSeed) {
      seeded = await seedWellKnownSandboxes();
    }

    const apis = await listGovernmentApis(countryCode);

    return NextResponse.json({
      ok: true,
      apis,
      count: apis.length,
      seeded,
    });
  } catch (e: any) {
    logger.error("[gov-sandbox/apis] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

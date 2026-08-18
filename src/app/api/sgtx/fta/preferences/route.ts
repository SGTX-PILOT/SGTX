// GET /api/sgtx/fta/preferences — List FTA preferences
//
// Query params (all optional, but at least origin/destination recommended):
//   ?origin=EG          (ISO 3166-1 alpha-2)
//   ?destination=SA
//   ?hsCode=080510
//   ?take=100           (default 100, max 500)
//   ?check=true         (optional — run checkFtaPreference() and return
//                        the structured result instead of a flat list)
//
// When ?check=true is set, the endpoint runs the engine (HS prefix match +
// validity window filter) and returns { ok, result }. Otherwise it returns
// a flat list of matching FtaPreference rows.
//
// Response (list mode):    { ok, preferences, count }
// Response (check mode):   { ok, result }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  checkFtaPreference,
  listFtaPreferences,
} from "@/lib/sgtx/fta";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const origin = url.searchParams.get("origin") ?? undefined;
    const destination = url.searchParams.get("destination") ?? undefined;
    const hsCode = url.searchParams.get("hsCode") ?? undefined;
    const takeParam = url.searchParams.get("take");
    const take = takeParam ? Math.min(500, parseInt(takeParam, 10) || 100) : 100;
    const shouldCheck = url.searchParams.get("check") === "true";

    if (shouldCheck) {
      if (!origin || !destination || !hsCode) {
        return NextResponse.json(
          { error: "check=true requires origin, destination, and hsCode query params" },
          { status: 400 },
        );
      }
      const result = await checkFtaPreference({
        originCountry: origin,
        destinationCountry: destination,
        hsCode,
      });
      return NextResponse.json({ ok: true, result });
    }

    const preferences = await listFtaPreferences({
      originCountry: origin,
      destinationCountry: destination,
      hsCode,
      take,
    });

    return NextResponse.json({
      ok: true,
      preferences,
      count: preferences.length,
    });
  } catch (e: any) {
    logger.error("[fta/preferences] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

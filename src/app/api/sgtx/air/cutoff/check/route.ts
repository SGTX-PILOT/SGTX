// @ts-nocheck
// POST /api/sgtx/air/cutoff/check
// Body: { flightDeparture, documentCutoffMins, customsCutoffMins,
//         securityCutoffMins, airlineCutoffMins, acceptanceCutoffMins,
//         buildupCutoffMins }
// Checks all cutoff deadlines against the flight departure time (§18).
// Optionally looks up the airport's defaults if `airport` is provided.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { checkCutoffs } from "@/lib/sgtx/air-cargo";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.flightDeparture) {
      return NextResponse.json({ error: "flightDeparture required" }, { status: 400 });
    }

    // If airport code is provided, look up the airport's default cutoffs.
    let airportDefaults: any = null;
    if (body.airport) {
      try {
        const airport = await db.airport.findUnique({
          where: { iataCode: String(body.airport).toUpperCase() },
        });
        if (airport) {
          airportDefaults = {
            documentCutoffMins: airport.cargoCutoffMins,
            customsCutoffMins: airport.customsCutoffMins,
            securityCutoffMins: airport.securityCutoffMins,
            airlineCutoffMins: airport.airlineCutoffMins,
            acceptanceCutoffMins: airport.cargoCutoffMins,
            buildupCutoffMins: airport.buildupCutoffMins,
          };
        }
      } catch (e: any) {
        logger.warn("[api/air/cutoff/check] airport lookup failed", { error: e?.message });
      }
    }

    const result = checkCutoffs({
      flightDeparture: new Date(body.flightDeparture),
      documentCutoffMins: Number(body.documentCutoffMins ?? airportDefaults?.documentCutoffMins ?? 240),
      customsCutoffMins: Number(body.customsCutoffMins ?? airportDefaults?.customsCutoffMins ?? 180),
      securityCutoffMins: Number(body.securityCutoffMins ?? airportDefaults?.securityCutoffMins ?? 120),
      airlineCutoffMins: Number(body.airlineCutoffMins ?? airportDefaults?.airlineCutoffMins ?? 360),
      acceptanceCutoffMins: Number(body.acceptanceCutoffMins ?? airportDefaults?.acceptanceCutoffMins ?? 180),
      buildupCutoffMins: Number(body.buildupCutoffMins ?? airportDefaults?.buildupCutoffMins ?? 90),
    });

    return NextResponse.json({
      flightDeparture: new Date(body.flightDeparture).toISOString(),
      airportDefaultsUsed: !!airportDefaults,
      airport: body.airport || null,
      ...result,
    });
  } catch (err: any) {
    logger.error("[api/air/cutoff/check] POST failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

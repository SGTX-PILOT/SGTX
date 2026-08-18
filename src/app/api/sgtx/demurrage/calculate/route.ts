// POST /api/sgtx/demurrage/calculate — Calculate demurrage for a container
//
// Pure calculation endpoint — runs calculateDemurrage() and optionally persists
// the result. The calculation engine itself is pure (no DB); persistence is
// opt-in via `persist: true` in the body.
//
// Body:
//   {
//     containerType, carrier, port,
//     releaseDate (ISO), gateOutDate? (ISO),
//     freeTimeDays?            // optional — auto-resolved from PORT_FREE_TIME
//     carrierTariff?: { demurrageRates, detentionRates }  // optional
//     persist?: boolean         // default false
//     ustn?, containerNumber?, currency?, governorDecisionId?  // required if persist=true
//     asOf? (ISO)               // optional — for forecast-style projection
//   }
//
// Response:
//   { ok, calc, persisted? }
//
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  calculateDemurrage,
  getPortFreeTime,
  persistDemurrageTracking,
} from "@/lib/sgtx/demurrage";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      containerType,
      carrier,
      port,
      releaseDate,
      gateOutDate,
      freeTimeDays,
      carrierTariff,
      persist = false,
      ustn,
      containerNumber,
      currency = "USD",
      governorDecisionId,
      asOf,
    } = body || {};

    // Validate required fields
    const missing: string[] = [];
    if (!containerType) missing.push("containerType");
    if (!carrier) missing.push("carrier");
    if (!port) missing.push("port");
    if (!releaseDate) missing.push("releaseDate");
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 },
      );
    }

    const releaseDateObj = new Date(releaseDate);
    if (isNaN(releaseDateObj.getTime())) {
      return NextResponse.json({ error: "Invalid releaseDate" }, { status: 400 });
    }

    const gateOutDateObj = gateOutDate ? new Date(gateOutDate) : undefined;
    if (gateOutDate && isNaN(gateOutDateObj!.getTime())) {
      return NextResponse.json({ error: "Invalid gateOutDate" }, { status: 400 });
    }

    const asOfObj = asOf ? new Date(asOf) : undefined;
    if (asOf && isNaN(asOfObj!.getTime())) {
      return NextResponse.json({ error: "Invalid asOf" }, { status: 400 });
    }

    // Resolve free time: explicit > port lookup > default 7
    const resolvedFreeTime = typeof freeTimeDays === "number"
      ? freeTimeDays
      : getPortFreeTime(port, containerType);

    // Run pure calculation
    const calc = calculateDemurrage(
      {
        containerType,
        carrier,
        port,
        releaseDate: releaseDateObj,
        gateOutDate: gateOutDateObj,
        freeTimeDays: resolvedFreeTime,
        carrierTariff,
      },
      asOfObj,
    );

    // Optionally persist
    let persisted: { id: string; created: boolean } | null = null;
    if (persist) {
      if (!ustn || !containerNumber) {
        return NextResponse.json(
          { error: "ustn and containerNumber are required when persist=true" },
          { status: 400 },
        );
      }
      persisted = await persistDemurrageTracking({
        ustn,
        containerNumber,
        carrierGtid: carrier,
        portUnlocode: port,
        containerType,
        freeTimeDays: resolvedFreeTime,
        releaseDate: releaseDateObj,
        gateOutDate: gateOutDateObj,
        calc,
        currency,
        governorDecisionId,
      });
    }

    return NextResponse.json({
      ok: true,
      calc,
      persisted: persisted ? { id: persisted.id, created: persisted.created } : null,
    });
  } catch (e: any) {
    logger.error("[demurrage/calculate] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

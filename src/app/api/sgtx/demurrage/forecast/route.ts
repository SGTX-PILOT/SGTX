// GET /api/sgtx/demurrage/forecast — Forecast demurrage for a container
//
// Projects the demurrage calculation forward to a hypothetical release date,
// useful for "what-if" planning before the container actually arrives.
//
// Query params (all required):
//   ?ustn=X&containerType=40FT&carrier=MSC&port=EGALX&releaseDate=2026-06-20
//   &gateOutDate=2026-06-25            (optional)
//   &freeTimeDays=5                    (optional — defaults to PORT_FREE_TIME[port])
//   &asOf=2026-06-30                   (optional — defaults to Date.now())
//
// Response:
//   { ok, calc: DemurrageCalculation, inputs: {...} }
//
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import {
  calculateDemurrage,
  getPortFreeTime,
  getPortFreeTimeEntry,
} from "@/lib/sgtx/demurrage";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn");
    const containerType = url.searchParams.get("containerType");
    const carrier = url.searchParams.get("carrier");
    const port = url.searchParams.get("port");
    const releaseDateStr = url.searchParams.get("releaseDate");
    const gateOutDateStr = url.searchParams.get("gateOutDate");
    const freeTimeDaysParam = url.searchParams.get("freeTimeDays");
    const asOfStr = url.searchParams.get("asOf");

    // Validate required params
    const missing: string[] = [];
    if (!ustn) missing.push("ustn");
    if (!containerType) missing.push("containerType");
    if (!carrier) missing.push("carrier");
    if (!port) missing.push("port");
    if (!releaseDateStr) missing.push("releaseDate");
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required query params: ${missing.join(", ")}` },
        { status: 400 },
      );
    }

    const releaseDate = new Date(releaseDateStr!);
    if (isNaN(releaseDate.getTime())) {
      return NextResponse.json({ error: "Invalid releaseDate" }, { status: 400 });
    }

    const gateOutDate = gateOutDateStr ? new Date(gateOutDateStr) : undefined;
    if (gateOutDate && isNaN(gateOutDate.getTime())) {
      return NextResponse.json({ error: "Invalid gateOutDate" }, { status: 400 });
    }

    const asOf = asOfStr ? new Date(asOfStr) : new Date();
    if (isNaN(asOf.getTime())) {
      return NextResponse.json({ error: "Invalid asOf" }, { status: 400 });
    }

    // Resolve free time: explicit param > port lookup > default 7
    const freeTimeDays = freeTimeDaysParam
      ? parseInt(freeTimeDaysParam, 10)
      : getPortFreeTime(port!, containerType!);

    if (isNaN(freeTimeDays) || freeTimeDays < 0) {
      return NextResponse.json({ error: "Invalid freeTimeDays" }, { status: 400 });
    }

    // Look up carrier-specific tariff (defensive)
    let carrierTariff: { demurrageRates: Record<string, number>; detentionRates: Record<string, number> } | undefined;
    try {
      const tariff = await (db as any).carrierDemurrageTariff.findFirst({
        where: { carrierGtid: carrier!, portUnlocode: port!, containerType: containerType!, isActive: true },
        orderBy: { validFrom: "desc" },
      });
      if (tariff) {
        carrierTariff = {
          demurrageRates: safeParse(tariff.demurrageRates) || {},
          detentionRates: safeParse(tariff.detentionRates) || {},
        };
      }
    } catch (e: any) {
      logger.warn("[demurrage/forecast] carrier tariff lookup failed", { error: e?.message });
    }

    const calc = calculateDemurrage(
      {
        containerType: containerType!,
        carrier: carrier!,
        port: port!,
        releaseDate,
        gateOutDate,
        freeTimeDays,
        carrierTariff,
      },
      asOf,
    );

    return NextResponse.json({
      ok: true,
      calc,
      inputs: {
        ustn,
        containerType,
        carrier,
        port,
        releaseDate: releaseDate.toISOString(),
        gateOutDate: gateOutDate ? gateOutDate.toISOString() : null,
        freeTimeDays,
        asOf: asOf.toISOString(),
        portInfo: getPortFreeTimeEntry(port!),
      },
    });
  } catch (e: any) {
    logger.error("[demurrage/forecast] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

function safeParse(s: string | null): any {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

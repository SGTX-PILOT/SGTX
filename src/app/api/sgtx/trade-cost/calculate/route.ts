// POST /api/sgtx/trade-cost/calculate — Calculate the trade cost breakdown
// for a trade (USTN + declared value + incoterm + transport mode).
//
// Body:
//   {
//     ustn, origin, destination, hsCode,
//     declaredValue, incoterm, transportMode, currency,
//     coldChain?, containerCount?, logisticsCostUSD?,
//     persist?: boolean   // default false
//   }
//
// Response:
//   { ok, breakdown, persisted? }
//
// Pure calculation is done by `calculateTradeCosts()`. The calculation engine
// awaits GRiRE's async tariff lookup. When `persist=true`, the resulting
// obligations are written to TradeCostObligation rows via `persistObligations()`.

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { calculateTradeCosts, persistObligations } from "@/lib/sgtx/trade-cost";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      ustn,
      origin,
      destination,
      hsCode,
      declaredValue,
      incoterm,
      transportMode,
      currency,
      coldChain,
      containerCount,
      logisticsCostUSD,
      persist = false,
    } = body || {};

    // Validate required fields
    const missing: string[] = [];
    if (!ustn) missing.push("ustn");
    if (!origin) missing.push("origin");
    if (!destination) missing.push("destination");
    if (!hsCode) missing.push("hsCode");
    if (typeof declaredValue !== "number" || declaredValue <= 0) missing.push("declaredValue");
    if (!incoterm) missing.push("incoterm");
    if (!transportMode) missing.push("transportMode");
    if (!currency) missing.push("currency");
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 },
      );
    }

    // Run calculation (async — awaits GRiRE tariff lookup)
    const breakdown = await calculateTradeCosts({
      ustn,
      origin,
      destination,
      hsCode,
      declaredValue,
      incoterm,
      transportMode,
      currency,
      coldChain,
      containerCount,
      logisticsCostUSD,
    });

    // Optionally persist
    let persisted: { persisted: number; ids: string[] } | null = null;
    if (persist) {
      try {
        persisted = await persistObligations(breakdown);
      } catch (e: any) {
        logger.error("[trade-cost/calculate] persist failed", { error: e?.message });
        return NextResponse.json(
          { ok: true, breakdown, persisted: null, error: "Calculation succeeded but persistence failed" },
          { status: 200 },
        );
      }
    }

    return NextResponse.json({ ok: true, breakdown, persisted });
  } catch (e: any) {
    logger.error("[trade-cost/calculate] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

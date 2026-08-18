// POST /api/sgtx/currency-risk/exposure — Create a currency exposure record
//
// Body:
//   {
//     ustn?: string,
//     baseCurrency: string,        // e.g. "USD"
//     exposureCurrency: string,    // e.g. "EGP"
//     exposureAmount: number,      // amount in exposureCurrency
//     lockedRate?: number,         // contract rate (base/quote)
//     hedgeType?: "FORWARD"|"OPTION"|"NATURAL"|"NONE",
//     hedgedPercentage?: number,   // 0..100
//     persist?: boolean            // default true
//   }
//
// Runs `calculateCurrencyExposure()` (which reads the latest FxRate row from
// the FxRate table) and persists a CurrencyExposure row.
//
// Response: { ok, exposureId, calc }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  calculateCurrencyExposure,
  persistCurrencyExposure,
} from "@/lib/sgtx/currency-risk";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      ustn,
      baseCurrency,
      exposureCurrency,
      exposureAmount,
      lockedRate,
      hedgeType,
      hedgedPercentage,
      persist = true,
    } = body || {};

    const missing: string[] = [];
    if (!baseCurrency) missing.push("baseCurrency");
    if (!exposureCurrency) missing.push("exposureCurrency");
    if (exposureAmount === undefined || exposureAmount === null) missing.push("exposureAmount");
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 },
      );
    }

    if (typeof exposureAmount !== "number" || exposureAmount < 0) {
      return NextResponse.json(
        { error: "exposureAmount must be a non-negative number" },
        { status: 400 },
      );
    }

    const calc = await calculateCurrencyExposure({
      ustn: ustn ?? null,
      baseCurrency,
      exposureCurrency,
      exposureAmount,
      lockedRate: typeof lockedRate === "number" ? lockedRate : null,
      hedgeType: hedgeType ?? null,
      hedgedPercentage: typeof hedgedPercentage === "number" ? hedgedPercentage : null,
    });

    let exposureId: string | null = null;
    if (persist) {
      const persisted = await persistCurrencyExposure(
        {
          ustn: ustn ?? null,
          baseCurrency,
          exposureCurrency,
          exposureAmount,
          lockedRate: typeof lockedRate === "number" ? lockedRate : null,
          hedgeType: hedgeType ?? null,
          hedgedPercentage: typeof hedgedPercentage === "number" ? hedgedPercentage : null,
        },
        calc,
      );
      if (!persisted) {
        return NextResponse.json(
          { ok: false, error: "Calculation succeeded but persistence failed (see server logs)", calc },
          { status: 500 },
        );
      }
      exposureId = persisted.id;
    }

    return NextResponse.json({ ok: true, exposureId, calc });
  } catch (e: any) {
    logger.error("[currency-risk/exposure] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

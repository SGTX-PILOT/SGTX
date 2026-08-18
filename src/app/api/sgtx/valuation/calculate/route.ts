// POST /api/sgtx/valuation/calculate
//
// Calculate customs duty estimate + market price deviation analysis for a
// (hsCode, originCountry, destinationCountry, declaredValue) tuple.
//
// Body:
//   {
//     hsCode, originCountry, destinationCountry, declaredValue,
//     currency? = "USD", ustn?, quantity?, unit?,
//     persist? = false    // optional — save to CustomsValuation table
//   }
//
// Response:
//   { ok, valuation, valuationId? }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { calculateValuation, persistValuation } from "@/lib/sgtx/valuation";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      hsCode,
      originCountry,
      destinationCountry,
      declaredValue,
      ustn,
      persist = false,
    } = body || {};

    const missing: string[] = [];
    if (!hsCode) missing.push("hsCode");
    if (!originCountry) missing.push("originCountry");
    if (!destinationCountry) missing.push("destinationCountry");
    if (typeof declaredValue !== "number" || declaredValue <= 0) missing.push("declaredValue (must be positive number)");
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing or invalid fields: ${missing.join(", ")}` },
        { status: 400 },
      );
    }

    const valuationInput = {
      hsCode,
      originCountry,
      destinationCountry,
      declaredValue,
      ustn,
    };

    const valuation = await calculateValuation(valuationInput);

    let valuationId: string | null = null;
    if (persist) {
      const persisted = await persistValuation(valuationInput, valuation);
      valuationId = persisted?.id ?? null;
    }

    return NextResponse.json({
      ok: true,
      valuation,
      valuationId,
    });
  } catch (e: any) {
    logger.error("[valuation/calculate] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

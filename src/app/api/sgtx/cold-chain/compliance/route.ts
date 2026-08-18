// GET /api/sgtx/cold-chain/compliance?hsCode=X&destination=Y
//
// Check cold chain compliance for a (hsCode, destination) pair. Looks up the
// required temperature/humidity range from GRiRE and validates the supplied
// readings against it.
//
// Query params:
//   ?hsCode=030221                (required)
//   ?destination=EG               (required — ISO 3166-1 alpha-2)
//   ?ustn=USTN-...                (optional — for tracking)
//   ?containerNumber=CONT1234567  (optional)
//   ?readings=<JSON>              (optional — JSON-encoded array of
//                                  { temperature, humidity?, recordedAt? })
//                                  If omitted, returns only the requirement
//                                  and PTI-required flag.
//
// Response:
//   { ok, compliance: ComplianceResult }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { checkColdChainCompliance } from "@/lib/sgtx/cold-chain";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const hsCode = url.searchParams.get("hsCode");
    const destination = url.searchParams.get("destination") || url.searchParams.get("destinationCountry");
    const ustn = url.searchParams.get("ustn") || undefined;
    const containerNumber = url.searchParams.get("containerNumber") || undefined;
    const readingsParam = url.searchParams.get("readings");

    if (!hsCode) {
      return NextResponse.json({ error: "Missing required query param: hsCode" }, { status: 400 });
    }
    if (!destination) {
      return NextResponse.json({ error: "Missing required query param: destination" }, { status: 400 });
    }

    // Parse readings JSON (defensive).
    let readings: Array<{ temperature: number; humidity?: number; recordedAt?: string }> = [];
    if (readingsParam) {
      try {
        const parsed = JSON.parse(readingsParam);
        if (!Array.isArray(parsed)) {
          return NextResponse.json({ error: "readings param must be a JSON array" }, { status: 400 });
        }
        // Validate each reading has a numeric temperature.
        for (const r of parsed) {
          if (typeof r?.temperature !== "number") {
            return NextResponse.json(
              { error: "Each reading must have a numeric 'temperature' field" },
              { status: 400 },
            );
          }
        }
        readings = parsed;
      } catch (e: any) {
        return NextResponse.json(
          { error: `Invalid readings JSON: ${e?.message || "parse error"}` },
          { status: 400 },
        );
      }
    }

    const compliance = await checkColdChainCompliance({
      ustn,
      hsCode,
      destinationCountry: destination,
      containerNumber,
      readings,
    });

    return NextResponse.json({ ok: true, compliance });
  } catch (e: any) {
    logger.error("[cold-chain/compliance] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

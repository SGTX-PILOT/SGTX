// POST /api/sgtx/cold-chain/reading
//
// Record a cold chain temperature reading. If the reading is out of the
// required range (looked up via GRiRE), an anomaly is auto-detected and
// persisted.
//
// Body:
//   {
//     ustn, containerNumber, temperature, humidity?, recordedAt? (ISO),
//     hsCode?, destinationCountry?  // optional — used to look up requirement
//                                   // from GRiRE for in-line anomaly detection
//   }
//
// Response:
//   { ok, readingId, anomalyId?, anomaly?: { deviationCelsius, severity } }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { recordColdChainReading } from "@/lib/sgtx/cold-chain";
import { getColdChainRequirement } from "@/lib/sgtx/grire";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      ustn,
      containerNumber,
      temperature,
      humidity,
      recordedAt,
      hsCode,
      destinationCountry,
    } = body || {};

    const missing: string[] = [];
    if (!ustn) missing.push("ustn");
    if (!containerNumber) missing.push("containerNumber");
    if (typeof temperature !== "number") missing.push("temperature");
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 },
      );
    }

    // Defensive: look up requirement if (hsCode, destinationCountry) supplied.
    let requirement: { temperatureMin: number | null; temperatureMax: number | null } | undefined;
    if (hsCode && destinationCountry) {
      try {
        const req = await getColdChainRequirement(hsCode, destinationCountry);
        if (req) {
          requirement = {
            temperatureMin: req.temperatureMin,
            temperatureMax: req.temperatureMax,
          };
        }
      } catch (e: any) {
        logger.warn("[cold-chain/reading] requirement lookup failed (non-blocking)", {
          hsCode, destinationCountry, error: e?.message,
        });
      }
    }

    const result = await recordColdChainReading(
      { ustn, containerNumber, temperature, humidity, recordedAt },
      requirement,
    );

    if (!result) {
      return NextResponse.json(
        { ok: false, error: "Persistence failed (see server logs)" },
        { status: 500 },
      );
    }

    // If an anomaly was detected, also surface the deviation info.
    let anomaly: { deviationCelsius: number; severity: string } | null = null;
    if (result.anomalyId && requirement) {
      const deviation = requirement.temperatureMin != null && temperature < requirement.temperatureMin
        ? +(requirement.temperatureMin - temperature).toFixed(2)
        : requirement.temperatureMax != null
          ? +(temperature - requirement.temperatureMax).toFixed(2)
          : 0;
      const severity = classify(deviation);
      anomaly = { deviationCelsius: deviation, severity };
    }

    return NextResponse.json({
      ok: true,
      readingId: result.readingId,
      anomalyId: result.anomalyId,
      anomaly,
    });
  } catch (e: any) {
    logger.error("[cold-chain/reading] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

// Local mirror of classifyDeviationSeverity (avoids importing extra helper for the route).
function classify(deviationCelsius: number): string {
  if (deviationCelsius <= 0.5) return "LOW";
  if (deviationCelsius <= 2.0) return "MEDIUM";
  if (deviationCelsius <= 5.0) return "HIGH";
  return "CRITICAL";
}

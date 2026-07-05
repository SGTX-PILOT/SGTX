// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";

// POST /api/sgtx/customs/cbam
// Body: { hsCode, destCountry, carbonIntensityKgCO2e, weightTonnes, embeddedEmissions }
// Returns CBAM certificate obligation for EU imports
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { hsCode, destCountry = "DE", carbonIntensityKgCO2e = 0, weightTonnes = 0 } = body;

    // CBAM applies to EU imports of: cement, iron, steel, aluminium, fertilisers, electricity, hydrogen
    const CBAM_HS_CHAPTERS = ["25", "26", "28", "31", "72", "73", "76", "78"];
    const hsChapter = (hsCode || "").substring(0, 2);

    const isCBAMApplicable = CBAM_HS_CHAPTERS.includes(hsChapter) && ["DE", "FR", "IT", "ES", "NL", "BE", "AT", "PL", "SE", "FI", "DK", "IE", "PT", "GR", "CZ", "RO", "BG", "HR", "SK", "LT", "SI", "LV", "EE", "LU", "MT", "CY"].includes(destCountry);

    if (!isCBAMApplicable) {
      return NextResponse.json({
        ok: true,
        cbamApplicable: false,
        message: "CBAM not applicable for this HS code / destination combination.",
      });
    }

    // EU ETS carbon price (approximate, EUR/tonne CO2)
    const euEtsPriceEur = 85; // Approximate 2024-2025 price
    const usdEurRate = 0.92;

    // Calculate embedded emissions
    const totalEmissionsTonnesCO2e = carbonIntensityKgCO2e * weightTonnes / 1000; // kg→tonnes
    const cbamObligationEur = totalEmissionsTonnesCO2e * euEtsPriceEur;
    const cbamObligationUsd = cbamObligationEur / usdEurRate;

    // Default intensity benchmarks (EU best-in-class)
    const BENCHMARKS: Record<string, number> = {
      "72": 0.5, // Steel: 0.5 tCO2e/t
      "76": 1.5, // Aluminium: 1.5 tCO2e/t
      "25": 0.8, // Cement: 0.8 tCO2e/t
      "31": 1.2, // Fertilisers: 1.2 tCO2e/t
    };
    const benchmark = BENCHMARKS[hsChapter] || 1.0;
    const exceedsBenchmark = carbonIntensityKgCO2e / 1000 > benchmark;

    return NextResponse.json({
      ok: true,
      cbamApplicable: true,
      calculation: {
        hsCode,
        hsChapter,
        destCountry,
        weightTonnes,
        carbonIntensityKgCO2e,
        totalEmissionsTonnesCO2e,
        euEtsPriceEur,
        cbamObligationEur,
        cbamObligationUsd,
        benchmarkIntensity: benchmark,
        exceedsBenchmark,
        additionalCostPerTonneUsd: cbamObligationUsd / weightTonnes,
      },
      reportingRequired: true,
      transitionPeriodEnds: "2025-12-31",
      definitivePeriodStarts: "2026-01-01",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

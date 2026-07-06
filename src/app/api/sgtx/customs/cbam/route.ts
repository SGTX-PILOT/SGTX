// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";

// EU CBAM applicable goods per Regulation (EU) 2023/956 Annex I.
// Match by first 4 digits of HS code (heading level).
// Legal deadline: transitional period ends 2025-12-31; definitive period
// (financial obligation) begins 2026-01-01.
//
// NOTE: EUDR (EU Deforestation Regulation, Reg (EU) 2023/1115) applies to the
// 7 forest-risk commodities — cattle, cocoa, coffee, palm oil, rubber, soy,
// wood — and requires geolocation of plot of land + Due Diligence Statement.
// EUDR is NOT implemented here; it lives in a separate EUDR module.
const CBAM_GOODS: Array<{ chapter?: string; chapters?: string[]; name: string }> = [
  { chapter: "2523", name: "Cement clinker" },
  { chapter: "2814", name: "Ammonia" },
  { chapter: "2845", name: "Hydrogen" },
  { chapter: "3102", name: "Nitrogen fertilisers" },
  { chapter: "3103", name: "Phosphatic fertilisers" },
  { chapter: "3104", name: "Potassic fertilisers" },
  { chapter: "3105", name: "Mixed fertilisers" },
  { chapter: "2716", name: "Electricity" },
  {
    chapters: [
      "7201","7202","7203","7204","7205","7206","7207","7208","7209","7210",
      "7211","7212","7213","7214","7215","7216","7217","7218","7219","7220",
      "7221","7222","7223","7224","7225","7226","7227","7228","7229","7230",
    ],
    name: "Iron and steel",
  },
  {
    chapters: [
      "7301","7302","7303","7304","7305","7306","7307","7308","7309","7310",
      "7311","7312","7313","7314","7315","7316","7317","7318","7319","7320",
      "7321","7322","7323","7324","7325","7326",
    ],
    name: "Iron/steel articles",
  },
  {
    chapters: [
      "7601","7602","7603","7604","7605","7606","7607","7608","7609","7610",
      "7611","7612","7613","7614","7615","7616",
    ],
    name: "Aluminium",
  },
];

// EU member states (CBAM applies to imports INTO the EU customs territory).
// EEA-EFTA states (NO, IS, LI) are part of the EEA but are NOT in CBAM scope
// unless they voluntarily join — they are excluded here per the Regulation.
// UK has its own UK CBAM regime (effective 2027) and is NOT in EU CBAM.
const EU_COUNTRIES = [
  "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE",
  "IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE",
];

// EU best-in-class benchmarks (default values per CBAM Implementing Regulation;
// 10% most efficient installations, tCO2e per tonne of product). Used as the
// reference intensity to flag imports that exceed the benchmark (and therefore
// owe the full CBAM certificate price rather than the differential).
const BENCHMARKS: Record<string, number> = {
  "Cement clinker": 0.7,
  "Ammonia": 1.5,
  "Hydrogen": 0.5,
  "Nitrogen fertilisers": 1.5,
  "Phosphatic fertilisers": 0.5,
  "Potassic fertilisers": 0.4,
  "Mixed fertilisers": 1.0,
  "Electricity": 0.3,
  "Iron and steel": 1.5,
  "Iron/steel articles": 1.5,
  "Aluminium": 1.5,
};

// Match an HS code to a CBAM good by first-4-digit heading.
export function matchCbamGood(hsCode: string): { name: string } | null {
  const head4 = (hsCode || "").replace(/[^0-9]/g, "").substring(0, 4);
  if (head4.length < 4) return null;
  for (const g of CBAM_GOODS) {
    if (g.chapter && g.chapter === head4) return { name: g.name };
    if (g.chapters && g.chapters.includes(head4)) return { name: g.name };
  }
  return null;
}

// POST /api/sgtx/customs/cbam
// Body: { hsCode, destCountry, carbonIntensityKgCO2ePerTonne, weightTonnes }
// (legacy alias `carbonIntensityKgCO2e` still accepted for backward compat)
// Returns CBAM certificate obligation for EU imports.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      hsCode,
      destCountry = "DE",
      carbonIntensityKgCO2ePerTonne,
      carbonIntensityKgCO2e,
      weightTonnes = 0,
    } = body;

    // Production carbon intensity (kg CO2e per tonne of product) — this is the
    // MANUFACTURING emissions intensity (Scope 1+2 of production), NOT transport.
    const intensityKg =
      typeof carbonIntensityKgCO2ePerTonne === "number"
        ? carbonIntensityKgCO2ePerTonne
        : typeof carbonIntensityKgCO2e === "number"
          ? carbonIntensityKgCO2e
          : 0;

    const cbamGood = matchCbamGood(hsCode || "");
    const isEU = EU_COUNTRIES.includes((destCountry || "").toUpperCase());

    if (!cbamGood || !isEU) {
      return NextResponse.json({
        ok: true,
        cbamApplicable: false,
        cbamGood: cbamGood?.name ?? null,
        destCountry,
        message:
          "CBAM not applicable — HS code is not a CBAM good under EU Reg 2023/956 Annex I, or destination is outside the EU customs territory.",
      });
    }

    // EU ETS carbon price (approximate, EUR/tonne CO2)
    const euEtsPriceEur = 85; // Approximate 2024-2025 price
    const usdEurRate = 0.92;

    // Embedded (production) emissions — Scope 1+2 of manufacturing the goods.
    const totalEmissionsTonnesCO2e = (intensityKg * weightTonnes) / 1000; // kg→tonnes
    const cbamObligationEur = totalEmissionsTonnesCO2e * euEtsPriceEur;
    const cbamObligationUsd = cbamObligationEur / usdEurRate;

    const benchmark = BENCHMARKS[cbamGood.name] ?? 1.0;
    const actualIntensityTonne = intensityKg / 1000;
    const exceedsBenchmark = actualIntensityTonne > benchmark;

    return NextResponse.json({
      ok: true,
      cbamApplicable: true,
      cbamGood: cbamGood.name,
      calculation: {
        hsCode,
        hsHeading: (hsCode || "").replace(/[^0-9]/g, "").substring(0, 4),
        destCountry,
        weightTonnes,
        carbonIntensityKgCO2ePerTonne: intensityKg,
        totalEmissionsTonnesCO2e,
        euEtsPriceEur,
        cbamObligationEur,
        cbamObligationUsd,
        benchmarkIntensity: benchmark,
        exceedsBenchmark,
        additionalCostPerTonneUsd: weightTonnes > 0 ? cbamObligationUsd / weightTonnes : 0,
      },
      reportingRequired: true,
      transitionPeriodEnds: "2025-12-31",
      definitivePeriodStarts: "2026-01-01",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";

// POST /api/sgtx/customs/duty-calculator
// Body: { hsCode, originCountry, destCountry, customsValueUsd, freightUsd, insuranceUsd, incoterm }
// Returns: { cifValue, dutyRate, dutyAmount, vatRate, vatAmount, totalTaxes, otherFees }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { hsCode, originCountry, destCountry, customsValueUsd, freightUsd = 0, insuranceUsd = 0, incoterm = "CIF" } = body;

    if (!hsCode || !destCountry || !customsValueUsd) {
      return NextResponse.json({ error: "hsCode, destCountry, customsValueUsd required" }, { status: 400 });
    }

    // Calculate CIF value (Cost + Insurance + Freight)
    const cifValue = customsValueUsd + freightUsd + insuranceUsd;

    // HS-code-based duty rates (simplified WTO rates)
    const hsChapter = hsCode.substring(0, 2);
    const DUTY_RATES: Record<string, number> = {
      "08": 0.20, // Edible fruit — 20%
      "09": 0.15, // Coffee, tea — 15%
      "10": 0.05, // Cereals — 5%
      "17": 0.30, // Sugar — 30%
      "18": 0.20, // Cocoa — 20%
      "20": 0.25, // Vegetable preparations — 25%
      "21": 0.20, // Misc food preparations — 20%
      "22": 0.50, // Beverages — 50%
      "30": 0.05, // Pharmaceutical — 5%
      "39": 0.10, // Plastics — 10%
      "61": 0.15, // Apparel (knit) — 15%
      "62": 0.15, // Apparel (woven) — 15%
      "72": 0.05, // Iron and steel — 5%
      "73": 0.10, // Iron articles — 10%
      "84": 0.05, // Machinery — 5%
      "85": 0.05, // Electronics — 5%
      "87": 0.10, // Vehicles — 10%
      "90": 0.05, // Optical/medical instruments — 5%
      "94": 0.20, // Furniture — 20%
    };

    // Country-specific adjustments (FTA preferences)
    const FTA_PREFERENCES: Record<string, Record<string, number>> = {
      EG: { EU: 0.0, TR: 0.0, MA: 0.0, TN: 0.0, JO: 0.0, IL: 0.0 }, // Egypt FTAs
      DE: { EG: 0.0, TR: 0.0, MA: 0.0, TN: 0.0 }, // Germany (EU) FTAs
    };

    const baseDutyRate = DUTY_RATES[hsChapter] || 0.10; // Default 10%
    const ftaReduction = FTA_PREFERENCES[destCountry]?.[originCountry] ?? 0;
    const effectiveDutyRate = Math.max(0, baseDutyRate - ftaReduction);
    const dutyAmount = cifValue * effectiveDutyRate;

    // VAT rates by country
    const VAT_RATES: Record<string, number> = {
      EG: 0.14, DE: 0.19, FR: 0.20, GB: 0.20, AE: 0.05, SA: 0.15,
      VN: 0.10, IN: 0.18, CN: 0.13, US: 0.0, BR: 0.17, ZA: 0.15,
    };
    const vatRate = VAT_RATES[destCountry] ?? 0.15;
    const vatAmount = (cifValue + dutyAmount) * vatRate;

    // Other fees
    const customsProcessingFee = Math.max(25, cifValue * 0.0025); // 0.25% min $25
    const portHandlingFee = 50;

    const totalTaxes = dutyAmount + vatAmount + customsProcessingFee + portHandlingFee;

    return NextResponse.json({
      ok: true,
      calculation: {
        hsCode,
        originCountry,
        destCountry,
        incoterm,
        customsValueUsd,
        freightUsd,
        insuranceUsd,
        cifValue,
        dutyRate: effectiveDutyRate,
        dutyAmount,
        vatRate,
        vatAmount,
        customsProcessingFee,
        portHandlingFee,
        totalTaxes,
        totalLandedCost: cifValue + totalTaxes,
      },
      ftaApplied: ftaReduction > 0,
      ftaReduction,
      source: "internal-calculator",
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

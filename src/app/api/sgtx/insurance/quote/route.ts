// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";

// POST /api/sgtx/insurance/quote
// Body: { ustn, goodsValueUsd, hsCode, originPort, destPort, incoterm, coldChain }
// Returns: { premium, coverage, deductible, providerOptions[] }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { goodsValueUsd, hsCode, originPort, destPort, incoterm, coldChain } = body;

    if (!goodsValueUsd) {
      return NextResponse.json({ error: "goodsValueUsd required" }, { status: 400 });
    }

    // Base rate: 0.3% - 1.5% of goods value depending on risk factors
    let baseRate = 0.005; // 0.5% default

    // HS code risk adjustment
    const hsChapter = (hsCode || "").substring(0, 2);
    if (["08", "09", "20", "21"].includes(hsChapter)) baseRate += 0.003; // Perishable food
    if (["30", "90"].includes(hsChapter)) baseRate += 0.002; // Pharma
    if (["71", "91"].includes(hsChapter)) baseRate += 0.005; // Valuables
    if (["22"].includes(hsChapter)) baseRate += 0.004; // Beverages (breakage)

    // Cold chain adds risk
    if (coldChain) baseRate += 0.002;

    // Incoterm adjustment
    if (incoterm === "CIF" || incoterm === "CIP") baseRate += 0.001; // Seller arranges
    if (incoterm === "EXW" || incoterm === "FCA") baseRate += 0.001; // Buyer bears more

    const premium = Math.round(goodsValueUsd * baseRate * 100) / 100;
    const deductible = Math.round(goodsValueUsd * 0.01 * 100) / 100; // 1% deductible

    // Provider options
    const providers = [
      {
        provider: "SGTX Cargo Insurance Pool",
        premium: premium,
        coverage: goodsValueUsd,
        deductible,
        coverageType: "All Risks",
        waitingPeriod: "24h",
        rating: "A+",
      },
      {
        provider: "Lloyd's Syndicate (via SGTX)",
        premium: Math.round(premium * 1.15 * 100) / 100,
        coverage: goodsValueUsd * 1.1, // 110% coverage
        deductible: Math.round(deductible * 0.5 * 100) / 100, // Lower deductible
        coverageType: "All Risks + War + Strikes",
        waitingPeriod: "12h",
        rating: "A++",
      },
      {
        provider: "Egyptian Insurance Federation",
        premium: Math.round(premium * 0.9 * 100) / 100,
        coverage: goodsValueUsd,
        deductible: Math.round(deductible * 1.5 * 100) / 100, // Higher deductible
        coverageType: "Institute Cargo Clauses (B)",
        waitingPeriod: "48h",
        rating: "A",
      },
    ];

    return NextResponse.json({
      ok: true,
      quote: {
        goodsValueUsd,
        baseRate,
        premium,
        deductible,
        providers,
        recommended: providers[0], // SGTX pool
      },
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

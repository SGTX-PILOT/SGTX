// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { analyzeMarket, validateQuotePrice } from "@/lib/sgtx/ai/brain";

// POST /api/sgtx/brain/market-analysis
// Body: { commodity, hsCode?, quotedPriceUsd?, port?, unit? }
// If quotedPriceUsd is provided, also validates the quote against market data.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { commodity, hsCode, quotedPriceUsd, port, unit } = body;

    if (!commodity) {
      return NextResponse.json({ error: "commodity required" }, { status: 400 });
    }

    const analysis = await analyzeMarket(commodity, hsCode);

    let quoteValidation = null;
    if (quotedPriceUsd && port && unit) {
      quoteValidation = await validateQuotePrice({ commodity, hsCode, quotedPriceUsd, port, unit });
    }

    return NextResponse.json({
      ok: true,
      commodity,
      analysis,
      quoteValidation,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

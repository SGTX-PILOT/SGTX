// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { searchCommodityPrices } from "@/lib/sgtx/ai/brain";

// GET /api/sgtx/brain/search?commodity=frozen+strawberries&port=EGALX&country=EG
// Searches for real-time commodity prices at a specific port
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const commodity = sp.get("commodity");
    const port = sp.get("port") || "GLOBAL";
    const country = sp.get("country") || "US";

    if (!commodity) {
      return NextResponse.json({ error: "commodity required" }, { status: 400 });
    }

    const prices = await searchCommodityPrices(commodity, port, country);

    return NextResponse.json({
      ok: true,
      commodity,
      port,
      country,
      prices,
      count: prices.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getGlobalMarketStats } from "@/lib/sgtx/compliance/global-market-intelligence";
export const dynamic = "force-dynamic";
export async function GET() {
  const stats = await getGlobalMarketStats();
  return NextResponse.json({
    ok: true, stats,
    sources: {
      europe: { url: "https://www.fresh-market.info/", markets: ["Warsaw (Bronisze)", "Italy", "Netherlands", "Spain", "Germany", "Belgium", "France"] },
      australia: { url: "https://www.vpfruit.com.au/ + https://www.freshmarkets.com.au/", markets: ["Melbourne", "Sydney"] },
      usa: { url: "https://agmarketnews.com/produce-markets/", markets: ["Baltimore", "New York", "Philadelphia"] },
      worldwide_ai: { url: "AI inference (ZAI + HuggingFace + Groq)", coverage: "Frozen + fresh at major ports worldwide" },
    },
  });
}

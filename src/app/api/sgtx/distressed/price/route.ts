// 3B.8.4 — Dynamic AI Pricing
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { computeDynamicPricing } from "@/lib/sgtx/distressed";

export async function POST(req: NextRequest) {
  try {
    const { listingId } = await req.json();
    if (!listingId) return NextResponse.json({ error: "listingId required" }, { status: 400 });
    const result = await computeDynamicPricing(listingId);
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
    return NextResponse.json(result);
  } catch (e: any) { logger.error("[distressed/price]", e); return NextResponse.json({ error: e.message }, { status: 500 }); }
}

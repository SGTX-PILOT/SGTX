import { NextRequest, NextResponse } from "next/server";
import { syncGlobalMarketPrices } from "@/lib/sgtx/compliance/global-market-intelligence";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function POST() {
  try {
    const result = await syncGlobalMarketPrices();
    return NextResponse.json({ ok: true, result });
  } catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}
export async function GET() {
  const { getGlobalMarketStats } = await import("@/lib/sgtx/compliance/global-market-intelligence");
  return NextResponse.json({ ok: true, stats: await getGlobalMarketStats() });
}

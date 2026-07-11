import { NextResponse } from "next/server";
import { getAgMarketStats } from "@/lib/sgtx/compliance/agmarket-integration";
export const dynamic = "force-dynamic";
export async function GET() {
  const stats = await getAgMarketStats();
  return NextResponse.json({ ok: true, stats, source: "https://agmarketnews.com/produce-markets/" });
}

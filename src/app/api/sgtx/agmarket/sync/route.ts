import { NextRequest, NextResponse } from "next/server";
import { syncAgMarketPrices } from "@/lib/sgtx/compliance/agmarket-integration";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await syncAgMarketPrices();
    return NextResponse.json({ ok: true, result });
  } catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}

export async function GET() {
  const { getAgMarketStats } = await import("@/lib/sgtx/compliance/agmarket-integration");
  const stats = await getAgMarketStats();
  return NextResponse.json({ ok: true, stats });
}

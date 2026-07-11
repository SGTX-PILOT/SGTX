import { NextResponse } from "next/server";
import { syncGulfAsiaMarketPrices } from "@/lib/sgtx/compliance/gulf-asia-market";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST() {
  try { return NextResponse.json({ ok: true, result: await syncGulfAsiaMarketPrices() }); }
  catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}

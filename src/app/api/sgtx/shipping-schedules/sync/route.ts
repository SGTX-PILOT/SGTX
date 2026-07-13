import { NextResponse } from "next/server";
import { syncShippingSchedules } from "@/lib/sgtx/compliance/shipping-lines-scraper";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function POST() {
  try { return NextResponse.json({ ok: true, result: await syncShippingSchedules() }); }
  catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}

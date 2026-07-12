import { NextResponse } from "next/server";
import { getShippingLineStats, SHIPPING_LINES } from "@/lib/sgtx/compliance/shipping-lines-scraper";
export const dynamic = "force-dynamic";
export async function GET() {
  const stats = await getShippingLineStats();
  return NextResponse.json({ ok: true, lines: SHIPPING_LINES, stats });
}

import { NextRequest, NextResponse } from "next/server";
import { getSailingSchedules, getNextSailing } from "@/lib/sgtx/compliance/shipping-lines-scraper";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const origin = searchParams.get("origin") || undefined;
  const dest = searchParams.get("dest") || undefined;
  const next = searchParams.get("next") === "true";
  if (next && origin && dest) {
    const sailing = await getNextSailing(origin, dest);
    return NextResponse.json({ ok: true, sailing });
  }
  const schedules = await getSailingSchedules(origin, dest);
  return NextResponse.json({ ok: true, count: schedules.length, schedules });
}

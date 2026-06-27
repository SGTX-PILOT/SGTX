import { NextRequest, NextResponse } from "next/server";
const prefs = new Map<string, any>();
export async function GET(req: NextRequest) {
  const tenantGtid = req.nextUrl.searchParams.get("tenantGtid");
  if (!tenantGtid) return NextResponse.json({ error: "tenantGtid required" }, { status: 400 });
  return NextResponse.json({ ok: true, preferences: prefs.get(tenantGtid) || { quietHours: { start: "22:00", end: "07:00" }, digestFrequency: "DAILY", categoryFilters: [] } });
}
export async function POST(req: NextRequest) {
  try {
    const { tenantGtid, preferences } = await req.json();
    if (!tenantGtid) return NextResponse.json({ error: "tenantGtid required" }, { status: 400 });
    prefs.set(tenantGtid, preferences);
    return NextResponse.json({ ok: true, preferences });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

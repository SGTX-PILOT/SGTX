import { NextRequest, NextResponse } from "next/server";
import { getFtaPreferences } from "@/lib/sgtx/grire";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const origin = url.searchParams.get("origin");
  const destination = url.searchParams.get("destination");
  const hsCode = url.searchParams.get("hsCode") || undefined;
  if (!origin || !destination) return NextResponse.json({ ok: false, error: "origin and destination required" }, { status: 400 });
  const preferences = await getFtaPreferences(origin, destination, hsCode);
  return NextResponse.json({ ok: true, preferences, count: preferences.length });
}

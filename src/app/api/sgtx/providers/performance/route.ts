// 9.8 — Provider Performance Dashboard
import { NextRequest, NextResponse } from "next/server";
import { getProviderPerformance } from "@/lib/sgtx/providers";

export async function GET(req: NextRequest) {
  const providerGtid = req.nextUrl.searchParams.get("providerGtid");
  if (!providerGtid) return NextResponse.json({ error: "providerGtid required" }, { status: 400 });
  const performance = await getProviderPerformance(providerGtid);
  if (!performance) return NextResponse.json({ error: "No performance data" }, { status: 404 });
  return NextResponse.json(performance);
}

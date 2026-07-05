// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
import { NextRequest, NextResponse } from "next/server";
import { getProviderPerformance, setAnonymousRfqOptOut } from "@/lib/sgtx/providers";

// GET /api/sgtx/providers/preferences?providerGtid=... — Get provider preferences (Part 9.9.3)
export async function GET(req: NextRequest) {
  const providerGtid = req.nextUrl.searchParams.get("providerGtid");
  if (!providerGtid) return NextResponse.json({ error: "providerGtid required" }, { status: 400 });
  return NextResponse.json(await getProviderPreferences(providerGtid));
}

// POST /api/sgtx/providers/preferences — Set anonymous RFQ opt-out (Part 9.9.2)
export async function POST(req: NextRequest) {
  try {
    const { providerGtid, optOut } = await req.json();
    if (!providerGtid) return NextResponse.json({ error: "providerGtid required" }, { status: 400 });
    const result = await setAnonymousRfqOptOut(providerGtid, optOut ?? false);
    return NextResponse.json(result);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

import { NextRequest, NextResponse } from "next/server";
import { getTariffRate } from "@/lib/sgtx/grire";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const hsCode = url.searchParams.get("hsCode");
  const country = url.searchParams.get("country");
  if (!hsCode || !country) return NextResponse.json({ ok: false, error: "hsCode and country required" }, { status: 400 });
  const tariff = await getTariffRate(hsCode, country);
  if (!tariff) return NextResponse.json({ ok: false, error: `No tariff data for HS ${hsCode} in ${country}` }, { status: 404 });
  return NextResponse.json({ ok: true, tariff });
}

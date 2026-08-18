import { NextRequest, NextResponse } from "next/server";
import { getFullRegulatoryReport } from "@/lib/sgtx/grire";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const country = url.searchParams.get("country");
  const hsCode = url.searchParams.get("hsCode") || undefined;
  const origin = url.searchParams.get("origin") || undefined;
  const dutyAmount = url.searchParams.get("dutyAmount") ? parseFloat(url.searchParams.get("dutyAmount")!) : undefined;
  if (!country) return NextResponse.json({ ok: false, error: "country required" }, { status: 400 });
  const report = await getFullRegulatoryReport(country, hsCode, origin, dutyAmount);
  return NextResponse.json({ ok: true, report });
}

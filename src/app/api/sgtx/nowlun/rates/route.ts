import { NextRequest, NextResponse } from "next/server";
import { getFreightRate, getAllFreightRates } from "@/lib/sgtx/compliance/nowlun-integration";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const origin = searchParams.get("origin");
  const destination = searchParams.get("destination");
  const containerType = searchParams.get("containerType") || undefined;
  if (origin && destination) {
    const rate = await getFreightRate(origin, destination, containerType);
    return NextResponse.json({ ok: true, rate });
  }
  const rates = await getAllFreightRates();
  return NextResponse.json({ ok: true, count: rates.length, rates });
}

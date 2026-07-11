import { NextRequest, NextResponse } from "next/server";
import { getTransitTime } from "@/lib/sgtx/compliance/nowlun-integration";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const origin = searchParams.get("origin");
  const destination = searchParams.get("destination");
  const containerType = searchParams.get("containerType") || undefined;
  if (!origin || !destination) {
    return NextResponse.json({ error: "Required: ?origin=CHN&destination=EGY[&containerType=20ST]" }, { status: 400 });
  }
  const transit = await getTransitTime(origin, destination, containerType);
  return NextResponse.json({ ok: true, transit });
}

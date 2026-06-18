import { NextRequest, NextResponse } from "next/server";
import { enrollQes } from "@/lib/sgtx/governor/constitutional-addons";

export async function POST(req: NextRequest) {
  const { tenantGtid, tsp } = await req.json();
  if (!tenantGtid || !tsp) return NextResponse.json({ error: "tenantGtid + tsp required" }, { status: 400 });
  const result = await enrollQes(tenantGtid, tsp);
  return NextResponse.json(result);
}

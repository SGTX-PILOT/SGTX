import { NextResponse } from "next/server";
import { getAllCommodities } from "@/lib/sgtx/compliance/agmarket-integration";
export const dynamic = "force-dynamic";
export async function GET() {
  const commodities = await getAllCommodities();
  return NextResponse.json({ ok: true, count: commodities.length, commodities });
}

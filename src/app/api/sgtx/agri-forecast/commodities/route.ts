import { NextResponse } from "next/server";
import { getAllAgriCommodities } from "@/lib/sgtx/compliance/agri-commodity-forecast";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json({ ok: true, commodities: await getAllAgriCommodities() });
}

import { NextResponse } from "next/server";
import { syncAgriCommodities } from "@/lib/sgtx/compliance/agri-commodity-forecast";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST() {
  try { return NextResponse.json({ ok: true, result: await syncAgriCommodities() }); }
  catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}

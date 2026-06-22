import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";
export async function POST(req: NextRequest) {
  try {
    const { ustn, blType } = await req.json();
    if (!ustn || !blType) return NextResponse.json({ error: "ustn and blType required" }, { status: 400 });
    if (!["EB_L", "ORIGINAL"].includes(blType)) return NextResponse.json({ error: "blType must be EB_L or ORIGINAL" }, { status: 400 });
    const trade = await db.trade.findUnique({ where: { ustn } });
    if (!trade) return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    const prev = trade.blType;
    await db.trade.update({ where: { ustn }, data: { blType } });
    return NextResponse.json({ ok: true, ustn, blType, courierRequired: blType === "ORIGINAL", previousBlType: prev });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

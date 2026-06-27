import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
export async function POST(req: NextRequest) {
  try {
    const { ustn, approvedByGtid, notes } = await req.json();
    if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });
    await db.customsDeclaration.updateMany({ where: { trade: { ustn } }, data: { status: "CLEARED", clearedAt: new Date() } });
    return NextResponse.json({ ok: true, ustn, status: "CLEARED", clearedAt: new Date().toISOString() });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

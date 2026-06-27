import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
export async function POST(req: NextRequest) {
  try {
    const { ustn, rejectedByGtid, reason } = await req.json();
    if (!ustn || !reason) return NextResponse.json({ error: "ustn and reason required" }, { status: 400 });
    await db.customsDeclaration.updateMany({ where: { trade: { ustn } }, data: { status: "REJECTED" } });
    return NextResponse.json({ ok: true, ustn, status: "REJECTED", reason });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

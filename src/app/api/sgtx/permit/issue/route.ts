import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
export async function POST(req: NextRequest) {
  try {
    const { ustn, permitType, issuedByGtid, validUntil } = await req.json();
    if (!ustn || !permitType) return NextResponse.json({ error: "ustn and permitType required" }, { status: 400 });
    const trade = await db.trade.findUnique({ where: { ustn } });
    if (!trade) return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    const doc = await db.document.create({ data: { tradeId: trade.id, type: "PERMIT", title: `${permitType} Permit — ${ustn.slice(0, 20)}…`, status: "VERIFIED", uploadedBy: issuedByGtid || "system", hashSha256: `permit-${ustn}-${Date.now()}` } });
    return NextResponse.json({ ok: true, permitId: doc.id, permitType, validUntil: validUntil || null });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

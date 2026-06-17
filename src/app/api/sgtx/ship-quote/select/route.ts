import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/sgtx/ship-quote/select — select a ship quote (lock cost for that service)
export async function POST(req: NextRequest) {
  const { quoteId } = await req.json();
  if (!quoteId) return NextResponse.json({ error: "quoteId required" }, { status: 400 });
  await db.shipQuote.update({ where: { id: quoteId }, data: { selected: true } });
  return NextResponse.json({ success: true });
}

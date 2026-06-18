import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/ship-quote/list?seller=GTID — list all ship quote requests for a seller
export async function GET(req: NextRequest) {
  const seller = req.nextUrl.searchParams.get("seller");
  if (!seller) return NextResponse.json({ error: "seller required" }, { status: 400 });
  const requests = await db.shipQuoteRequest.findMany({ where: { sellerGtid: seller }, orderBy: { createdAt: "desc" }, include: { } });
  const quotes = await db.shipQuote.findMany({ where: { requestId: { in: requests.map(r => r.id) } } });
  return NextResponse.json({ requests, quotes });
}

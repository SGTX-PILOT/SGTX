import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/ship-quote/list?seller=GTID — list all ship quote requests for a given seller
// GET /api/sgtx/ship-quote/list?shipper=GTID — list all ship quote requests targeting a given shipping line
//   (SHIP portal "Booking Requests" view — Part 9 gap-fix)
export async function GET(req: NextRequest) {
  const seller = req.nextUrl.searchParams.get("seller");
  const shipper = req.nextUrl.searchParams.get("shipper");

  if (!seller && !shipper) {
    return NextResponse.json({ error: "seller or shipper required" }, { status: 400 });
  }

  let requests: any[] = [];
  if (seller) {
    requests = await db.shipQuoteRequest.findMany({
      where: { sellerGtid: seller },
      orderBy: { createdAt: "desc" },
    });
  } else if (shipper) {
    // targetLines is a JSON array stored as a string. SQLite doesn't support a
    // native JSON contains, so we use Prisma's string contains on the encoded
    // representation — searching for the shipper GTID substring.
    requests = await db.shipQuoteRequest.findMany({
      where: { targetLines: { contains: shipper } },
      orderBy: { createdAt: "desc" },
    });
  }

  const quotes = await db.shipQuote.findMany({
    where: { requestId: { in: requests.map((r) => r.id) } },
    orderBy: { submittedAt: "desc" },
  });
  return NextResponse.json({ requests, quotes });
}

// 3B.5.3/3B.5.4 — List open RFQs for a financier (with match scores)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { findMatchingFinanciers } from "@/lib/sgtx/financing";

export async function GET(req: NextRequest) {
  const financierGtid = req.nextUrl.searchParams.get("financierGtid");
  if (!financierGtid) return NextResponse.json({ error: "financierGtid required" }, { status: 400 });

  // All open RFQs this financier received
  const rfqLogs = await db.financingRfqLog.findMany({
    where: { financierGtid },
    include: {
      request: {
        include: {
          borrower: true,
          trade: { include: { buyer: true, seller: true, shipments: true } },
          bids: { where: { financierGtid } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Filter to only active (BIDDING_OPEN) requests
  const open = rfqLogs
    .filter((l) => ["BIDDING_OPEN", "RFQ_BROADCAST"].includes(l.request.status))
    .map((l) => ({
      rfqLogId: l.id,
      matchScore: l.matchScore,
      deliveredVia: l.deliveredVia,
      status: l.status,
      requestId: l.request.requestId,
      request: l.request,
      alreadyBid: (l.request.bids || []).length > 0,
      myBid: (l.request.bids || [])[0] || null,
    }));

  return NextResponse.json({ rfqs: open, total: open.length });
}

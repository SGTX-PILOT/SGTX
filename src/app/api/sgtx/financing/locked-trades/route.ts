// 3B.5.4 — Locked trades eligible for financing (helper for borrower UI)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const borrowerGtid = req.nextUrl.searchParams.get("borrowerGtid");
  if (!borrowerGtid) return NextResponse.json({ error: "borrowerGtid required" }, { status: 400 });

  // Find trades where borrower is buyer or seller, status allows financing
  const trades = await db.trade.findMany({
    where: {
      OR: [{ buyerGtid: borrowerGtid }, { sellerGtid: borrowerGtid }],
      status: { in: ["LOCKED", "IN_EXECUTION", "SETTLED"] },
      sgtxFeeUsd: { gt: 0 },
    },
    include: { buyer: true, seller: true, shipments: true, financing: true },
    orderBy: { createdAt: "desc" },
  });

  // Annotate eligibility
  const eligible = trades.map((t) => {
    const isSeller = t.sellerGtid === borrowerGtid;
    const isBuyer = t.buyerGtid === borrowerGtid;
    const allowedTypes = [];
    if (isSeller) allowedTypes.push("PRE_SHIPMENT");
    if (isBuyer) allowedTypes.push("POST_SHIPMENT", "INVOICE_FINANCING");
    if (isSeller || isBuyer) allowedTypes.push("STRUCTURED");
    return {
      ...t,
      borrowerRole: isSeller ? "SELLER" : "BUYER",
      allowedFinancingTypes: allowedTypes,
      existingRequests: t.financing.length,
    };
  });

  return NextResponse.json({ trades: eligible });
}

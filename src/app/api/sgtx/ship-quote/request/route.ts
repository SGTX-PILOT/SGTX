import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/sgtx/ship-quote/request — create Mode C ship quote request (Part 3B.3.5.3)
export async function POST(req: NextRequest) {
  const { ustn, sellerGtid, baseServiceType, originPort, destinationPort, containerDetails, addOnServices, targetLines } = await req.json();
  if (!sellerGtid || !baseServiceType) return NextResponse.json({ error: "sellerGtid + baseServiceType required" }, { status: 400 });
  const req2 = await db.shipQuoteRequest.create({
    data: { ustn: ustn || null, sellerGtid, baseServiceType, originPort: originPort || "", destinationPort: destinationPort || "",
      containerDetails: JSON.stringify(containerDetails || {}), addOnServices: JSON.stringify(addOnServices || []),
      targetLines: JSON.stringify(targetLines || []) },
  });
  // Simulate shipping line responses
  for (const lineGtid of (targetLines || []).slice(0, 2)) {
    const baseFee = Math.round(3000 + Math.random() * 3000);
    const addons: Record<string, number> = {};
    for (const svc of (addOnServices || [])) addons[svc] = Math.round(100 + Math.random() * 500);
    const totalFee = baseFee + Object.values(addons).reduce((s: number, v) => s + v, 0);
    await db.shipQuote.create({ data: { requestId: req2.id, shipperLineGtid: lineGtid, baseFee, addOnFees: JSON.stringify(addons), totalFee, validityHours: 48 } });
  }
  const quotes = await db.shipQuote.findMany({ where: { requestId: req2.id } });
  return NextResponse.json({ request: req2, quotes });
}

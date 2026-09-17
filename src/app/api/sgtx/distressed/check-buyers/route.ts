// 3B.8.6 — Check Buyers Advisory
import { NextRequest, NextResponse } from "next/server";
import { checkBuyers } from "@/lib/sgtx/distressed";

export async function GET(req: NextRequest) {
  const listingId = req.nextUrl.searchParams.get("listingId");
  const sellerGtid = req.nextUrl.searchParams.get("sellerGtid");
  if (!listingId || !sellerGtid) return NextResponse.json({ error: "listingId and sellerGtid required" }, { status: 400 });
  const result = await checkBuyers(listingId, sellerGtid);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
  return NextResponse.json(result);
}

// Packing plan list (by seller or USTN)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const sellerGtid = req.nextUrl.searchParams.get("sellerGtid");
  const ustn = req.nextUrl.searchParams.get("ustn");
  const where: any = {};
  if (sellerGtid) where.sellerGtid = sellerGtid;
  if (ustn) where.ustn = ustn;
  const plans = await db.packingPlan.findMany({ where, include: { pallets: true, packingList: true }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ plans, total: plans.length });
}

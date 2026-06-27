import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
export async function GET(req: NextRequest) {
  try {
    const commodity = req.nextUrl.searchParams.get("commodity") || undefined;
    const originCountry = req.nextUrl.searchParams.get("originCountry") || undefined;
    const where: any = { type: "TRD", traderMode: { in: ["SELL", "DUAL"] }, lifecycleState: "VERIFIED", sanctionsCleared: true };
    if (originCountry) where.country = originCountry.toUpperCase();
    if (commodity) where.sector = { contains: commodity };
    const suppliers = await db.tenant.findMany({ where, take: 50, orderBy: [{ trustScore: "desc" }, { kybTier: "desc" }], select: { gtid: true, legalName: true, country: true, traderMode: true, trustScore: true, kybTier: true, sector: true, city: true } });
    return NextResponse.json({ ok: true, count: suppliers.length, suppliers });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

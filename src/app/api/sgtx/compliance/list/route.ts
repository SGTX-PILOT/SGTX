import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/compliance/list?tenant=GTID
export async function GET(req: NextRequest) {
  const tenant = req.nextUrl.searchParams.get("tenant");
  if (!tenant) return NextResponse.json({ error: "tenant required" }, { status: 400 });
  const screenings = await db.complianceScreening.findMany({ where: { tenantGtid: tenant }, orderBy: { createdAt: "desc" }, take: 30 });
  return NextResponse.json(screenings);
}

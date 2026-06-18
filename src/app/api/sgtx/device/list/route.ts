import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/device/list?tenant=GTID
export async function GET(req: NextRequest) {
  const tenant = req.nextUrl.searchParams.get("tenant");
  if (!tenant) return NextResponse.json({ error: "tenant required" }, { status: 400 });
  const devices = await db.deviceTrust.findMany({ where: { tenantGtid: tenant }, orderBy: { lastSeenAt: "desc" } });
  const events = await db.sessionRiskEvent.findMany({ where: { tenantGtid: tenant }, orderBy: { createdAt: "desc" }, take: 20 });
  return NextResponse.json({ devices, events });
}

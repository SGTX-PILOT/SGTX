import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
export async function POST(req: NextRequest) {
  try {
    const { tenantGtid } = await req.json();
    if (!tenantGtid) return NextResponse.json({ error: "tenantGtid required" }, { status: 400 });
    await db.tenant.update({ where: { gtid: tenantGtid }, data: { kybTier: 2 } });
    return NextResponse.json({ ok: true, kycRequestId: `kyc-${Date.now()}`, status: "PENDING_REVIEW" });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

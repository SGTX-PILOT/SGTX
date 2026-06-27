import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
export async function GET(_req: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  try {
    const { tenantId } = await params;
    const tenant = await db.tenant.findUnique({ where: { gtid: tenantId }, select: { gtid: true, kybTier: true, lifecycleState: true, sanctionsCleared: true } });
    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    const kycStatus = tenant.lifecycleState === "VERIFIED" ? "VERIFIED" : tenant.kybTier >= 2 ? "PENDING" : "REJECTED";
    return NextResponse.json({ ok: true, tenantGtid: tenant.gtid, kybTier: tenant.kybTier, lifecycleState: tenant.lifecycleState, sanctionsCleared: tenant.sanctionsCleared, kycStatus });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

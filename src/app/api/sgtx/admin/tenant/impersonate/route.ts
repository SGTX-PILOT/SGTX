import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
export async function POST(req: NextRequest) {
  try {
    const { targetTenantGtid, adminGtid, reason, durationMinutes } = await req.json();
    if (!targetTenantGtid || !adminGtid || !reason) return NextResponse.json({ error: "targetTenantGtid, adminGtid, reason required" }, { status: 400 });
    if (reason.length < 20) return NextResponse.json({ error: "reason must be ≥20 chars" }, { status: 400 });
    const sessionId = `imp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const expiresAt = new Date(Date.now() + (durationMinutes || 30) * 60 * 1000);
    await db.activity.create({ data: { actorGtid: adminGtid, action: "TENANT_IMPERSONATION", type: "WARNING", description: `Admin ${adminGtid} started impersonation session ${sessionId} for tenant ${targetTenantGtid}. Reason: ${reason}. Expires: ${expiresAt.toISOString()}.` } });
    return NextResponse.json({ ok: true, sessionId, targetTenantGtid, expiresAt: expiresAt.toISOString() });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
export async function GET(req: NextRequest) {
  try {
    const tenantGtid = req.nextUrl.searchParams.get("tenantGtid");
    const activities = await db.activity.findMany({ where: { action: "DPIA_ASSESSMENT", ...(tenantGtid ? { actorGtid: tenantGtid } : {}) }, orderBy: { createdAt: "desc" }, take: 20 });
    return NextResponse.json({ ok: true, dpias: activities });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
export async function POST(req: NextRequest) {
  try {
    const { tenantGtid, processingActivity, riskLevel, mitigationMeasures } = await req.json();
    if (!tenantGtid || !processingActivity) return NextResponse.json({ error: "tenantGtid and processingActivity required" }, { status: 400 });
    const activity = await db.activity.create({ data: { actorGtid: tenantGtid, action: "DPIA_ASSESSMENT", type: "INFO", description: `DPIA: ${processingActivity} (risk: ${riskLevel || "MEDIUM"}, mitigation: ${mitigationMeasures || "—"})` } });
    return NextResponse.json({ ok: true, dpiaId: activity.id, status: "PENDING_REVIEW" });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

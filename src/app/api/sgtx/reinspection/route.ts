import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/sgtx/reinspection — Request re-inspection (Part 9.4)
export async function POST(req: NextRequest) {
  try {
    const { ustn, originalInspectionId, requestedByGtid, reason } = await req.json();
    if (!ustn || !requestedByGtid || !reason) return NextResponse.json({ error: "ustn, requestedByGtid, reason required" }, { status: 400 });
    const request = await db.reInspectionRequest.create({
      data: { ustn, originalInspectionId: originalInspectionId || "", requestedByGtid, reason, status: "PENDING" },
    });
    await db.inboxItem.create({ data: { tenantGtid: "SGTX-EG-QC-000022-8A1C", category: "GENERAL", priority: 70, title: "Re-inspection Request", description: `Re-inspection requested for ${ustn}. Reason: ${reason}` } });
    return NextResponse.json({ ok: true, request });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

// GET /api/sgtx/reinspection?ustn=... — List re-inspection requests
export async function GET(req: NextRequest) {
  const ustn = req.nextUrl.searchParams.get("ustn");
  const requests = await db.reInspectionRequest.findMany({ where: ustn ? { ustn } : {}, orderBy: { createdAt: "desc" }, take: 50 });
  return NextResponse.json({ requests });
}

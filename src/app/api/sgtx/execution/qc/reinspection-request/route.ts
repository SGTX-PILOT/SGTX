// 3B.6.4.3 — Reinspection Request
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { requestReinspection } from "@/lib/sgtx/execution";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, originalInspectionId, requestedByGtid, reason, sameProvider, newQcProviderGtid, evidenceNote } = body;
    if (!ustn || !originalInspectionId || !requestedByGtid || !reason) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    const result = await requestReinspection({ ustn, originalInspectionId, requestedByGtid, reason, sameProvider: !!sameProvider, newQcProviderGtid, evidenceNote });
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
    return NextResponse.json({ ok: true, requestId: result.requestId });
  } catch (e: any) {
    logger.error("[execution/qc/reinspection-request]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET — list reinspection requests (by QC provider or requester)
export async function GET(req: NextRequest) {
  const qcProviderGtid = req.nextUrl.searchParams.get("qcProviderGtid");
  const requestedByGtid = req.nextUrl.searchParams.get("requestedByGtid");
  const where: any = {};
  if (qcProviderGtid) where.newQcProviderGtid = qcProviderGtid;
  if (requestedByGtid) where.requestedByGtid = requestedByGtid;
  const requests = await db.reInspectionRequest.findMany({ where, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ requests });
}

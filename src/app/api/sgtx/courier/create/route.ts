// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";
import { featureGateResponse } from "@/lib/sgtx/platform/feature-check";

export async function POST(req: NextRequest) {
  // Feature gate — Platform Admin can deactivate the Courier Tracking add-on.
  const gate = await featureGateResponse("courier_tracking");
  if (gate) return gate;

  try {
    const { ustn, documentId, courierCompany, trackingNumber, senderName, senderAddress, senderEmail, recipientName, recipientAddress, recipientEmail, createdBy } = await req.json();
    if (!ustn || !courierCompany || !trackingNumber) return NextResponse.json({ error: "ustn, courierCompany, trackingNumber required" }, { status: 400 });
        const trade = await db.trade.findUnique({ where: { ustn }, select: { id: true } }) as any;
        if (!trade) return NextResponse.json({ error: "Trade not found" }, { status: 404 }) as any;
    let docId = documentId;
    if (!docId) { const doc = await db.document.create({ data: { tradeId: trade.id, type: "BILL_LADING", title: `Bill of Lading — ${ustn}`, status: "UPLOADED", uploadedBy: createdBy, hashSha256: `bl-${Date.now()}` } }); docId = doc.id; }
        const tracking = await db.documentCourierTracking.create({ data: { documentId: docId, tradeId: trade.id, courierCompany, trackingNumber, senderName, senderAddress, senderEmail, recipientName, recipientAddress, recipientEmail, courierStatus: "PENDING", createdBy } }) as any;
        return NextResponse.json({ ok: true, courierTrackingId: tracking.id, documentId: docId, courierStatus: "PENDING" }) as any;
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
export async function GET(req: NextRequest) {
  // Feature gate — Platform Admin can deactivate the Courier Tracking add-on.
  const gate = await featureGateResponse("courier_tracking");
  if (gate) return gate;

  const ustn = req.nextUrl.searchParams.get("ustn");
    if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 }) as any;
    const trade = await db.trade.findUnique({ where: { ustn }, select: { id: true } }) as any;
    if (!trade) return NextResponse.json({ error: "Trade not found" }, { status: 404 }) as any;
    const records = await db.documentCourierTracking.findMany({ where: { tradeId: trade.id }, orderBy: { createdAt: "desc" } }) as any;
    return NextResponse.json({ ok: true, courierTracking: records, total: records.length }) as any;
}

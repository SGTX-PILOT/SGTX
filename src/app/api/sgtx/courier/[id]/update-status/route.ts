import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";
import { featureGateResponse } from "@/lib/sgtx/platform/feature-check";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Feature gate — Platform Admin can deactivate the Courier Tracking add-on.
  const gate = await featureGateResponse("courier_tracking");
  if (gate) return gate;

  try {
    const { id } = await params;
    const { courierStatus, location, deliveredAt, deliverySignature } = await req.json();
    const tracking = await db.documentCourierTracking.findUnique({ where: { id }, include: { trade: true } });
    if (!tracking) return NextResponse.json({ error: "Courier tracking not found" }, { status: 404 });
    const history = tracking.trackingHistory ? JSON.parse(tracking.trackingHistory) : [];
    history.push({ timestamp: new Date().toISOString(), location, event: courierStatus });
    await db.documentCourierTracking.update({ where: { id }, data: { courierStatus, trackingHistory: JSON.stringify(history), deliveredAt: deliveredAt ? new Date(deliveredAt) : null, deliverySignature } });
    if (courierStatus === "DELIVERED" && tracking.trade) {
      await db.inboxItem.create({ data: { tenantGtid: tracking.trade.buyerGtid, tradeId: tracking.tradeId, category: "GENERAL", priority: 80, title: `Courier delivered: ${tracking.trackingNumber}`, description: `${tracking.courierCompany} tracking ${tracking.trackingNumber} delivered. Signed by: ${deliverySignature || "N/A"}`, ctaLabel: "View" } }).catch(() => null);
    }
    return NextResponse.json({ ok: true, courierStatus, trackingHistory: history });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

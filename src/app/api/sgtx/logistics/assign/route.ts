import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";
export async function POST(req: NextRequest) {
  try {
    const { ustn, shipmentSeq, driverName, truckNumber, containerNo, loadingDate, warehouseArrivalTime, warehouseDepartureTime, portCheckInTime } = await req.json();
    if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });
    const shipment = await db.shipment.findFirst({ where: { ustn, sequence: shipmentSeq || 1 } });
    if (!shipment) return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
    await db.shipment.update({ where: { id: shipment.id }, data: { driverName, truckNumber, containerNo, loadingDate: loadingDate ? new Date(loadingDate) : null, warehouseArrivalTime: warehouseArrivalTime ? new Date(warehouseArrivalTime) : null, warehouseDepartureTime: warehouseDepartureTime ? new Date(warehouseDepartureTime) : null, portCheckInTime: portCheckInTime ? new Date(portCheckInTime) : null } });
    const trade = await db.trade.findUnique({ where: { ustn }, select: { buyerGtid: true, sellerGtid: true, id: true } });
    if (trade) {
      await db.inboxItem.create({ data: { tenantGtid: trade.buyerGtid, tradeId: trade.id, category: "SHIPMENT_ALERT", priority: 70, title: "Logistics assigned", description: `Driver: ${driverName}, Truck: ${truckNumber}, Container: ${containerNo}`, ctaLabel: "View Shipment" } }).catch(() => null);
      await db.inboxItem.create({ data: { tenantGtid: trade.sellerGtid, tradeId: trade.id, category: "SHIPMENT_ALERT", priority: 70, title: "Logistics assigned", description: `Driver: ${driverName}, Truck: ${truckNumber}, Container: ${containerNo}`, ctaLabel: "View Shipment" } }).catch(() => null);
    }
    return NextResponse.json({ ok: true, driverName, truckNumber, containerNo });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

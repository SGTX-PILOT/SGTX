import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/sgtx/trade/modify-schedule — Request a schedule modification
// after master contract lock (blueprint 3B.4.7).
//
// Body: { ustn: string, shipmentSequence?: number, newDeliveryDate?: string,
//        newPort?: string, containerCount?: number, reason: string,
//        requestedByGtid: string }
//
// Creates an Activity log entry (action SCHEDULE_MODIFICATION_REQUESTED) and a
// Smart Inbox item to the counterparty so they see the proposed diff and can
// Accept/Reject/Counter with a single click.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      ustn,
      shipmentSequence,
      newDeliveryDate,
      newPort,
      containerCount,
      reason,
      requestedByGtid,
    } = body || {};

    if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });
    if (!reason || reason.trim().length < 20) {
      return NextResponse.json({ error: "reason must be ≥20 chars" }, { status: 400 });
    }

    const trade = await db.trade.findUnique({ where: { ustn } });
    if (!trade) return NextResponse.json({ error: "Trade not found" }, { status: 404 });

    // Determine counterparty (the one who is NOT requesting)
    const counterpartyGtid =
      trade.buyerGtid === requestedByGtid ? trade.sellerGtid : trade.buyerGtid;

    const changes: string[] = [];
    if (shipmentSequence) changes.push(`shipment #${shipmentSequence}`);
    if (newDeliveryDate) changes.push(`delivery date → ${newDeliveryDate}`);
    if (newPort) changes.push(`port → ${newPort}`);
    if (containerCount) changes.push(`containers → ${containerCount}`);
    const changeSummary = changes.join(", ") || "schedule";

    // Activity log
    const activity = await db.activity.create({
      data: {
        tradeId: trade.id,
        actorGtid: requestedByGtid || null,
        action: "SCHEDULE_MODIFICATION_REQUESTED",
        description: `Schedule modification requested (${changeSummary}). Reason: ${reason.slice(0, 120)}`,
        type: "INFO",
        metadata: JSON.stringify({
          shipmentSequence, newDeliveryDate, newPort, containerCount,
          reason: reason.slice(0, 500), requestedByGtid,
        }),
      },
    });

    // Smart Inbox to counterparty
    const inbox = await db.inboxItem.create({
      data: {
        tenantGtid: counterpartyGtid,
        tradeId: trade.id,
        category: "NEGOTIATION",
        priority: 85,
        title: `Schedule modification requested — ${ustn.slice(0, 22)}…`,
        description: `Counterparty proposes: ${changeSummary}. Reason: ${reason.slice(0, 100)}. Accept / Reject / Counter (1 click each).`,
        ctaLabel: "Review modification",
      },
    });

    return NextResponse.json({
      ok: true,
      activityId: activity.id,
      inboxId: inbox.id,
      counterpartyGtid,
      changeSummary,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to request schedule modification" }, { status: 500 });
  }
}

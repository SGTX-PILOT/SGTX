import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";

// POST /api/sgtx/contract/lock — Phase 3 Contract Lock (Part 3.10-3.13)
// Validates: buyerSigned + sellerSigned + feePaid + releaseAcknowledged
// On success: Trade.status -> "CONTRACT_SIGNED", phase -> 3, Activity "CONTRACT_LOCKED",
//             Smart Inbox to both parties (priority 75)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      ustn,
      buyerSigned,
      sellerSigned,
      feePaid,
      releaseAcknowledged,
    } = body;

    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }

    // Validate all 4 lock conditions
    const conditions = { buyerSigned, sellerSigned, feePaid, releaseAcknowledged };
    const failed: string[] = [];
    if (!buyerSigned) failed.push("buyerSigned");
    if (!sellerSigned) failed.push("sellerSigned");
    if (!feePaid) failed.push("feePaid");
    if (!releaseAcknowledged) failed.push("releaseAcknowledged");
    if (failed.length > 0) {
      return NextResponse.json(
        { error: `Cannot lock contract - missing conditions: ${failed.join(", ")}` },
        { status: 409 },
      );
    }

    // Find the trade
    const trade = await db.trade.findUnique({
      where: { ustn },
      include: { buyer: true, seller: true, shipments: true },
    });
    if (!trade) {
      return NextResponse.json({ error: `Trade ${ustn} not found` }, { status: 404 });
    }

    // Idempotency: already locked
    if (trade.status === "CONTRACT_SIGNED" || trade.status === "IN_EXECUTION" || trade.status === "SETTLED") {
      return NextResponse.json({
        ok: true,
        ustn,
        tradeStatus: trade.status,
        message: "Contract already locked - USTN active.",
      });
    }

    // Lock the contract: update status + phase
    await db.trade.update({
      where: { id: trade.id },
      data: { status: "CONTRACT_SIGNED", phase: 3 },
    });

    // Activity log - CONTRACT_LOCKED
    await db.activity.create({
      data: {
        tradeId: trade.id,
        action: "CONTRACT_LOCKED",
        type: "SUCCESS",
        description: `Contract locked for USTN ${ustn}. All 4 conditions met (buyer signed, seller signed, fee paid, release acknowledged). Phase 3 complete. Shipment tracking active.`,
      },
    });

    // Timeline event - phase 3 complete
    await db.timelineEvent.create({
      data: {
        tradeId: trade.id,
        phase: 3,
        label: "Contract Locked",
        description: `All 4 lock conditions satisfied. USTN ${ustn} is now immutable.`,
        completed: true,
        completedAt: new Date(),
      },
    });

    // Smart Inbox to both parties (priority 75)
    const inboxMessage = "Contract locked - USTN generated. Shipment tracking active.";
    await Promise.all([
      db.inboxItem.create({
        data: {
          tenantGtid: trade.buyerGtid,
          tradeId: trade.id,
          category: "NEGOTIATION",
          priority: 75,
          title: `Contract locked - ${ustn.slice(0, 24)}...`,
          description: inboxMessage,
          ctaLabel: "View Trade",
        },
      }),
      db.inboxItem.create({
        data: {
          tenantGtid: trade.sellerGtid,
          tradeId: trade.id,
          category: "NEGOTIATION",
          priority: 75,
          title: `Contract locked - ${ustn.slice(0, 24)}...`,
          description: inboxMessage,
          ctaLabel: "View Trade",
        },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      ustn,
      tradeStatus: "CONTRACT_SIGNED",
      message: "Contract locked - USTN generated. Shipment tracking active.",
      conditions,
    });
  } catch (e: any) {
    logger.error("[contract/lock] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

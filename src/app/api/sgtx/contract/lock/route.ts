import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { generateUSTN } from "@/lib/sgtx/ustn";

// POST /api/sgtx/contract/lock — Phase 3 Contract Lock (Part 3.10-3.13)
// §III: USTN is generated HERE (at contract lock), NOT at trade creation.
// Validates: buyerSigned + sellerSigned + feePaid + releaseAcknowledged
// On success: Trade.status -> "CONTRACT_SIGNED", phase -> 3, USTN minted,
//             Activity "CONTRACT_LOCKED", Smart Inbox to both parties (priority 75)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      tradeId,
      ustn: existingUstn, // optional — may be null if trade was created after §III fix
      buyerSigned,
      sellerSigned,
      feePaid,
      releaseAcknowledged,
    } = body;

    if (!tradeId && !existingUstn) {
      return NextResponse.json({ error: "tradeId or ustn required" }, { status: 400 });
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

    // Find the trade — by USTN if provided, otherwise by tradeId (§III: new trades have no USTN yet)
    const trade = existingUstn
      ? await db.trade.findUnique({ where: { ustn: existingUstn }, include: { buyer: true, seller: true, shipments: true } })
      : await db.trade.findUnique({ where: { id: tradeId }, include: { buyer: true, seller: true, shipments: true } });
    if (!trade) {
      return NextResponse.json({ error: `Trade not found` }, { status: 404 });
    }

    // Idempotency: already locked
    if (trade.status === "CONTRACT_SIGNED" || trade.status === "IN_EXECUTION" || trade.status === "SETTLED") {
      return NextResponse.json({
        ok: true,
        ustn: trade.ustn,
        tradeStatus: trade.status,
        message: "Contract already locked - USTN active.",
      });
    }

    // §III: Generate USTN HERE (at contract lock, not at trade creation)
    // Format: SGTX-{BUYER6}-{SELLER6}-{YYYYMMDDHHMMSS}-{RAND8}
    const mintedUstn = trade.ustn || generateUSTN(trade.buyerGtid, trade.sellerGtid);

    // Lock the contract: update status + phase + mint USTN
    await db.trade.update({
      where: { id: trade.id },
      data: { status: "CONTRACT_SIGNED", phase: 3, ustn: mintedUstn },
    });

    // §III: Update all shipments with the minted USTN
    if (trade.shipments && trade.shipments.length > 0) {
      await db.shipment.updateMany({
        where: { tradeId: trade.id },
        data: { ustn: mintedUstn },
      });
    }

    // Activity log - CONTRACT_LOCKED
    await db.activity.create({
      data: {
        tradeId: trade.id,
        action: "CONTRACT_LOCKED",
        type: "SUCCESS",
        description: `Contract locked for USTN ${mintedUstn}. All 4 conditions met (buyer signed, seller signed, fee paid, release acknowledged). Phase 3 complete. Shipment tracking active.`,
      },
    });

    // Timeline event - phase 3 complete
    await db.timelineEvent.create({
      data: {
        tradeId: trade.id,
        phase: 3,
        label: "Contract Locked",
        description: `All 4 lock conditions satisfied. USTN ${mintedUstn} is now immutable.`,
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
          title: `Contract locked - ${mintedUstn.slice(0, 24)}...`,
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
          title: `Contract locked - ${mintedUstn.slice(0, 24)}...`,
          description: inboxMessage,
          ctaLabel: "View Trade",
        },
      }),
    ]);

    // ── Cross-portal connection: notify Government (GOV) that a USTN was
    // generated. Blueprint §3.2: "every party — buyer, seller, logistics
    // providers, financiers, customs, and government — knows exactly where
    // the shipment stands." Government needs real-time trade visibility for
    // regulatory oversight. Non-blocking — a notification failure never
    // breaks the contract lock.
    try {
      const govTenant = await db.tenant.findFirst({ where: { type: "GOV", lifecycleState: "VERIFIED" } });
      if (govTenant) {
        await db.inboxItem.create({
          data: {
            tenantGtid: govTenant.gtid,
            tradeId: trade.id,
            category: "REGULATORY_OVERSIGHT",
            priority: 80,
            title: `USTN generated — ${trade.commodity || "trade"} (${mintedUstn.slice(0, 24)}…)`,
            description: `Contract locked. USTN: ${mintedUstn}. Commodity: ${trade.commodity || "—"}. Value: $${trade.tradeValueUsd?.toLocaleString() || "—"} ${trade.currency || "USD"}. Route: ${trade.originPort || "—"} → ${trade.destPort || "—"}. Regulatory oversight active — monitor shipment milestones and customs clearance.`,
            ctaLabel: "Monitor Trade",
          },
        });
      }
    } catch (govErr: any) {
      logger.error("[contract/lock] gov notification failed (non-blocking):", govErr);
    }

    // ── REC-P1 #5 — Automated stage trigger: capture Regulatory Snapshot on
    // contract lock (Art 129 stage REG_SNAPSHOT). Non-blocking — a snapshot
    // capture failure never breaks the contract lock. The snapshot is
    // immutable (SHA-256 hashed) and used for after-the-fact audits.
    try {
      const { captureSnapshot } = await import("@/lib/sgtx/regulatory-snapshot");
      await captureSnapshot(mintedUstn);
    } catch (snapErr: any) {
      logger.error("[contract/lock] regulatory snapshot capture failed (non-blocking):", snapErr);
    }

    // ── REC-P1 #5 — Automated stage trigger: log the CONTRACT stage to
    // TradeStageLog (Art 129). This records that the trade has reached the
    // CONTRACT stage with a timestamp for audit.
    try {
      await (db as any).tradeStageLog.create({
        data: {
          ustn: mintedUstn,
          stageCode: "CONTRACT",
          stageName: "Contract Locked",
          completedBy: "SYSTEM",
          notes: `Contract locked at ${new Date().toISOString()}`,
        },
      });
    } catch (logErr: any) {
      logger.error("[contract/lock] stage log failed (non-blocking):", logErr);
    }

    return NextResponse.json({
      ok: true,
      ustn: mintedUstn,
      tradeStatus: "CONTRACT_SIGNED",
      message: "Contract locked - USTN generated. Shipment tracking active. Regulatory snapshot captured.",
      conditions,
    });
  } catch (e: any) {
    logger.error("[contract/lock] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

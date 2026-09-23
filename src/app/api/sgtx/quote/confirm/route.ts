// @ts-nocheck
/**
 * POST /api/sgtx/quote/confirm
 *
 * v18 §16.9.3.7 — Mutual Confirmation.
 *
 * After both parties agree on a final set of terms, each clicks
 * "Confirm Agreement" in their respective portals. The system records
 * the mutual confirmation timestamp and creates a pre-contract snapshot
 * (immutable JSONB).
 *
 * Body: {
 *   ustn: string,
 *   confirmerGtid: string,
 *   snapshot?: object,  // the agreed terms snapshot (optional, can be auto-generated)
 * }
 *
 * Returns: {
 *   ok: true,
 *   status: "CONFIRMED" | "MUTUAL_CONFIRMATION_COMPLETE",
 *   confirmationId: string,
 *   confirmedAt: string,
 *   bothConfirmed: boolean,  // true when both buyer + seller have confirmed
 *   preContractSnapshot: object,  // immutable snapshot
 * }
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { createHash } from "crypto";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, confirmerGtid, snapshot } = body;

    if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });
    if (!confirmerGtid) return NextResponse.json({ error: "confirmerGtid required" }, { status: 400 });

    // Verify trade exists
    const trade = await db.trade.findUnique({
      where: { ustn },
      include: { buyer: true, seller: true, contracts: true },
    });
    if (!trade) {
      return NextResponse.json({ error: `Trade ${ustn} not found` }, { status: 404 });
    }

    // Determine if confirmer is buyer or seller
    const isBuyer = confirmerGtid === trade.buyerGtid;
    const isSeller = confirmerGtid === trade.sellerGtid;
    if (!isBuyer && !isSeller) {
      return NextResponse.json({ error: "confirmerGtid is neither buyer nor seller of this trade" }, { status: 403 });
    }

    // Build pre-contract snapshot (immutable JSONB)
    const preContractSnapshot = snapshot || {
      ustn: trade.ustn,
      commodity: trade.commodity,
      commodityHs: trade.commodityHs,
      incoterm: trade.incoterm,
      grossWeightKg: trade.grossWeightKg,
      netWeightKg: trade.netWeightKg,
      tradeValueUsd: trade.tradeValueUsd,
      currency: trade.currency,
      originPort: trade.originPort,
      destPort: trade.destPort,
      originCountry: trade.originCountry,
      destCountry: trade.destCountry,
      transportMode: trade.transportMode,
      equipmentType: trade.equipmentType,
      containerCount: trade.containerCount,
      incoterm: trade.incoterm,
      paymentTerms: trade.paymentTerms,
      settlementStructure: trade.settlementStructure,
      specialInstructions: trade.specialInstructions,
      timestamp: new Date().toISOString(),
    };
    const snapshotJson = JSON.stringify(preContractSnapshot);
    const snapshotHash = createHash("sha256").update(snapshotJson).digest("hex");

    // Check if both parties have confirmed
    const buyerConfirmed = isBuyer || trade.specialInstructions?.includes("BUYER_CONFIRMED");
    const sellerConfirmed = isSeller || trade.specialInstructions?.includes("SELLER_CONFIRMED");
    const bothConfirmed = buyerConfirmed && sellerConfirmed;

    // Log activity
    await db.activity.create({
      data: {
        tradeId: trade.id,
        actorGtid: confirmerGtid,
        action: bothConfirmed ? "MUTUAL_CONFIRMATION_COMPLETE" : "QUOTE_CONFIRMED",
        description: bothConfirmed
          ? `Mutual confirmation complete. Pre-contract snapshot hash: ${snapshotHash.substring(0, 16)}...`
          : `${isBuyer ? "Buyer" : "Seller"} confirmed agreement. Awaiting ${isBuyer ? "seller" : "buyer"} confirmation.`,
        metadata: JSON.stringify({ confirmerGtid, snapshotHash, bothConfirmed, preContractSnapshot }),
      },
    }).catch(() => {});

    // If both confirmed, update trade status + store snapshot
    if (bothConfirmed) {
      await db.trade.update({
        where: { ustn },
        data: {
          status: "MUTUALLY_CONFIRMED",
          specialInstructions: `BUYER_CONFIRMED|SELLER_CONFIRMED|SNAPSHOT_HASH:${snapshotHash}|CONFIRMED_AT:${new Date().toISOString()}`,
        },
      }).catch(() => {});

      // Smart Inbox to both parties
      for (const partyGtid of [trade.buyerGtid, trade.sellerGtid]) {
        await db.inboxItem.create({
          data: {
            ustn,
            tenantGtid: partyGtid,
            category: "GENERAL",
            title: `Mutual confirmation complete for ${ustn}`,
            description: `Both parties have confirmed. Pre-contract snapshot sealed (hash: ${snapshotHash.substring(0, 16)}...). Ready for contract generation.`,
            priority: 85,
            ctaLabel: "Generate Contract",
            ctaUrl: `/trades/${ustn}`,
            status: "PENDING",
          },
        }).catch(() => {});
      }
    } else {
      // Smart Inbox to counterparty
      const counterpartyGtid = isBuyer ? trade.sellerGtid : trade.buyerGtid;
      await db.inboxItem.create({
        data: {
          ustn,
          tenantGtid: counterpartyGtid,
          category: "NEGOTIATION",
          title: `Confirmation received — your turn for ${ustn}`,
          description: `${isBuyer ? "Buyer" : "Seller"} has confirmed the agreement. Please review and confirm to proceed to contract generation.`,
          priority: 80,
          ctaLabel: "Confirm Agreement",
          ctaUrl: `/trades/${ustn}`,
          status: "PENDING",
        },
      }).catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      status: bothConfirmed ? "MUTUAL_CONFIRMATION_COMPLETE" : "CONFIRMED",
      confirmationId: `CONF-${Date.now()}`,
      confirmerRole: isBuyer ? "BUYER" : "SELLER",
      bothConfirmed,
      preContractSnapshot,
      snapshotHash,
      confirmedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    logger.error("[quote/confirm] POST failed", { error: e?.message });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

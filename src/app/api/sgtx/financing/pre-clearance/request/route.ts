// POST /api/sgtx/financing/pre-clearance/request
// v16.1 Patch 2 (M5): Two-Phase Financing Pre-Clearance (CFR)
// Borrower requests a Conditional Financing Reference from a financier.
// The system compiles a privacy-preserving Trade Digest and sends it to
// the financier's Smart Inbox.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tradeRequestId, borrowerGtid, financierGtid, financierType } = body;

    if (!borrowerGtid || !financierGtid) {
      return NextResponse.json({ error: "borrowerGtid and financierGtid required" }, { status: 400 });
    }

    // Verify financier exists and is BANK or PFI type
    const financier = await db.tenant.findUnique({ where: { gtid: financierGtid } });
    if (!financier) {
      return NextResponse.json({ error: "Financier not found" }, { status: 404 });
    }
    if (!["BANK", "PFI"].includes(financier.type)) {
      return NextResponse.json({ error: "Selected tenant is not a financier" }, { status: 400 });
    }

    // Compile Trade Digest (privacy-preserving summary)
    let tradeDigest: Record<string, any> = {};
    if (tradeRequestId) {
      const trade = await db.trade.findUnique({
        where: { id: tradeRequestId },
        include: { buyer: true, seller: true },
      });
      if (trade) {
        tradeDigest = {
          commodity: trade.commodity,
          hsCode: trade.commodityHs,
          quantity: trade.grossWeightKg,
          incoterm: trade.incoterm,
          origin: trade.originCountry,
          destination: trade.destCountry,
          transportMode: trade.transportMode,
          estimatedValue: trade.tradeValueUsd,
          currency: trade.currency,
          // Mask counterparty names until financier accepts
          buyerMasked: trade.buyer?.legalName ? trade.buyer.legalName.substring(0, 3) + "***" : null,
          sellerMasked: trade.seller?.legalName ? trade.seller.legalName.substring(0, 3) + "***" : null,
        };
      }
    }

    // Create pre-clearance request
    const preClearance = await db.financingPreClearanceRequest.create({
      data: {
        tradeRequestId: tradeRequestId || null,
        borrowerGtid,
        financierGtid,
        financierType: financierType || financier.type,
        tradeDigest: JSON.stringify(tradeDigest),
        status: "REQUESTED",
        validityUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    });

    // Create Smart Inbox item for the financier
    await db.inboxItem.create({
      data: {
        tenantGtid: financierGtid,
        category: "FINANCING_PRE_CLEARANCE",
        priority: "HIGH",
        title: "New financing pre-clearance request",
        message: `Borrower ${borrowerGtid} requests a Conditional Financing Reference for a trade.`,
        actionUrl: `/money`,
        dismissed: false,
      },
    }).catch(() => {/* non-fatal */});

    logger.info("financing-pre-clearance-requested", {
      preClearanceId: preClearance.id,
      borrowerGtid,
      financierGtid,
    });

    return NextResponse.json({
      ok: true,
      preClearanceId: preClearance.id,
      status: "REQUESTED",
      tradeDigest,
    });
  } catch (e: any) {
    logger.error("[financing/pre-clearance/request] error:", e);
    return NextResponse.json({ error: "Pre-clearance request failed", detail: e?.message }, { status: 500 });
  }
}

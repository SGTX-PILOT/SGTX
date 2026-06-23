import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  generateMicroUSTN,
  calculateDistressedFee,
  isMicroUstnTransitionAllowed,
  validateUSTNFormat,
} from "@/lib/sgtx/ustn";

// POST /api/sgtx/micro-contract/lock — Lock a distressed micro-contract.
// Per blueprint 3.7 + 3.17.10, this:
//   1. Validates the parent USTN exists.
//   2. Generates a microUSTN via generateMicroUSTN (child Trade row).
//   3. Calculates the distressed fee (1.5% × country factor).
//   4. Creates a MicroContract row linking parent + child + listing.
//   5. Returns the locked MicroContract details.
//
// Body: {
//   parent_ustn: string,        // parent shipment USTN
//   buyer_gtid: string,         // distressed-cargo purchaser
//   seller_gtid?: string,       // defaults to parent seller
//   agreed_price_usd: number,
//   distressed_listing_id?: string,
//   commodity?: string,
//   net_weight_kg?: number,
// }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      parent_ustn,
      buyer_gtid,
      seller_gtid,
      agreed_price_usd,
      distressed_listing_id,
      commodity,
      net_weight_kg,
    } = body;

    // Validate required fields
    if (!parent_ustn) return NextResponse.json({ error: "parent_ustn required" }, { status: 400 });
    if (!validateUSTNFormat(parent_ustn)) {
      return NextResponse.json({ error: "Invalid parent_ustn format" }, { status: 400 });
    }
    if (!buyer_gtid) return NextResponse.json({ error: "buyer_gtid required" }, { status: 400 });
    if (agreed_price_usd == null || agreed_price_usd <= 0) {
      return NextResponse.json({ error: "agreed_price_usd must be a positive number" }, { status: 400 });
    }

    // Find the parent trade
    const parent = await db.trade.findUnique({
      where: { ustn: parent_ustn },
      include: { seller: true },
    });
    if (!parent) return NextResponse.json({ error: `Parent USTN ${parent_ustn} not found` }, { status: 404 });

    const effectiveSellerGtid = seller_gtid || parent.sellerGtid;

    // Generate the microUSTN + child Trade row
    const microUstnResult = await generateMicroUSTN(parent_ustn, {
      buyerGtid: buyer_gtid,
      sellerGtid: effectiveSellerGtid,
      commodity: commodity || parent.commodity,
      netWeightKg: net_weight_kg,
      tradeValueUsd: agreed_price_usd,
    });

    // Calculate the distressed fee (1.5% × country factor)
    const country = parent.originCountry || parent.seller?.country || "EG";
    const feeResult = await calculateDistressedFee(agreed_price_usd, country);

    // Persist the MicroContract row
    const microContract = await db.microContract.create({
      data: {
        microUstn: microUstnResult.microUstn,
        parentUstn: parent_ustn,
        parentTradeId: parent.id,
        childTradeId: microUstnResult.childTradeId || null,
        distressedListingId: distressed_listing_id || null,
        buyerGtid: buyer_gtid,
        sellerGtid: effectiveSellerGtid,
        agreedPriceUsd: agreed_price_usd,
        sgtxFeeRate: feeResult.feeRate,
        sgtxFeeAmountUsd: feeResult.feeAmountUsd,
        countryFactor: feeResult.countryFactor,
        status: "DISTRESS_MICROCONTRACT_LOCKED",
        lockedAt: new Date(),
      },
    });

    // Smart Inbox to both parties — microcontract locked
    const inboxMsg = `Distressed micro-contract locked. microUSTN: ${microUstnResult.microUstn}. Parent: ${parent_ustn}. Agreed price: $${agreed_price_usd}. Distressed fee: $${feeResult.feeAmountUsd} (${(feeResult.feeRate * 100).toFixed(2)}% × ${feeResult.countryFactor} country factor). Pay the fee via PSP to finalize.`;
    await Promise.all([
      db.inboxItem.create({
        data: {
          tenantGtid: buyer_gtid,
          tradeId: parent.id,
          category: "NEEDS_PAYMENT",
          priority: 90,
          title: `Micro-contract locked — ${microUstnResult.microUstn.slice(0, 24)}…`,
          description: inboxMsg,
          ctaLabel: "Pay Distressed Fee",
          deadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      }).catch(() => null),
      db.inboxItem.create({
        data: {
          tenantGtid: effectiveSellerGtid,
          tradeId: parent.id,
          category: "GENERAL",
          priority: 88,
          title: `Micro-contract locked — ${microUstnResult.microUstn.slice(0, 24)}…`,
          description: inboxMsg,
          ctaLabel: "Track Micro-contract",
        },
      }).catch(() => null),
    ]);

    return NextResponse.json({
      ok: true,
      micro_contract_id: microContract.id,
      micro_ustn: microUstnResult.microUstn,
      parent_ustn: parent_ustn,
      status: "DISTRESS_MICROCONTRACT_LOCKED",
      agreed_price_usd: agreed_price_usd,
      distressed_fee: feeResult,
      locked_at: microContract.lockedAt,
      message: `Micro-contract locked. microUSTN ${microUstnResult.microUstn} generated. Pay $${feeResult.feeAmountUsd} distressed fee to finalize.`,
    });
  } catch (e: any) {
    console.error("[micro-contract/lock] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

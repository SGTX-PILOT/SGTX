import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { isMicroUstnTransitionAllowed } from "@/lib/sgtx/ustn";

// GET /api/sgtx/micro-contract?micro_ustn=...
// Returns the MicroContract + child Trade details for a distressed micro-contract.
// Per blueprint 3.7, a MicroContract is a distinct legal contract with its own
// USTN, fee, and lifecycle, linked back to the parent shipment via parent_ustn.
export async function GET(req: NextRequest) {
  const microUstn = req.nextUrl.searchParams.get("micro_ustn");
  const parentUstn = req.nextUrl.searchParams.get("parent_ustn");

  if (!microUstn && !parentUstn) {
    return NextResponse.json({ error: "micro_ustn or parent_ustn required" }, { status: 400 });
  }

  try {
    const where: any = microUstn ? { microUstn } : { parentUstn: parentUstn };
    const microContracts = await db.microContract.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
        }) as any;

    if (microContracts.length === 0) {
      return NextResponse.json(
        { error: "No micro-contracts found", micro_contracts: [] },
        { status: 404 },
      );
    }

    // Enrich with parent + child trade details
    const enriched = await Promise.all(
      microContracts.map(async (mc: any) => {
        const [parentTrade, childTrade] = await Promise.all([
          db.trade.findUnique({
            where: { id: mc.parentTradeId },
            select: { ustn: true, commodity: true, status: true },
          }),
          mc.childTradeId
            ? db.trade.findUnique({
                where: { id: mc.childTradeId },
                select: { ustn: true, status: true, createdAt: true },
              })
            : Promise.resolve(null),
        ]);
        return {
          micro_contract_id: mc.id,
          micro_ustn: mc.microUstn,
          parent_ustn: mc.parentUstn,
          parent_trade: parentTrade,
          child_trade: childTrade,
          buyer_gtid: mc.buyerGtid,
          seller_gtid: mc.sellerGtid,
          agreed_price_usd: mc.agreedPriceUsd,
          sgtx_fee_rate: mc.sgtxFeeRate,
          sgtx_fee_amount_usd: mc.sgtxFeeAmountUsd,
          country_factor: mc.countryFactor,
          fee_lock_id: mc.feeLockId,
          status: mc.status,
          locked_at: mc.lockedAt,
          completed_at: mc.completedAt,
          created_at: mc.createdAt,
          allowed_next_statuses: getAllowedNextStatuses(mc.status),
        };
      }),
    );

    return NextResponse.json({
      micro_contracts: enriched,
      count: enriched.length,
    });
  } catch (e: any) {
    logger.error("[micro-contract GET] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH /api/sgtx/micro-contract — Transition a micro-contract's status.
// Body: { micro_ustn, next_status }
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { micro_ustn, next_status } = body;
    if (!micro_ustn || !next_status) {
      return NextResponse.json({ error: "micro_ustn and next_status required" }, { status: 400 });
    }

        const mc = await db.microContract.findUnique({ where: { microUstn: micro_ustn } }) as any;
        if (!mc) return NextResponse.json({ error: "Micro-contract not found" }, { status: 404 }) as any;

    if (!isMicroUstnTransitionAllowed(mc.status, next_status)) {
      return NextResponse.json(
        { error: `Transition ${mc.status} → ${next_status} is not allowed. Allowed: ${getAllowedNextStatuses(mc.status).join(", ") || "(terminal)"}` },
        { status: 409 },
      );
    }

    const updateData: any = { status: next_status };
    if (next_status === "DISTRESS_SALE_COMPLETED") updateData.completedAt = new Date();

    const updated = await db.microContract.update({
      where: { id: mc.id },
      data: updateData,
        }) as any;

    return NextResponse.json({
      ok: true,
      micro_ustn: updated.microUstn,
      status: updated.status,
      completed_at: updated.completedAt,
        }) as any;
  } catch (e: any) {
    logger.error("[micro-contract PATCH] error:", e);
        return NextResponse.json({ error: e.message }, { status: 500 }) as any;
  }
}

function getAllowedNextStatuses(current: string): string[] {
  const transitions: Record<string, string[]> = {
    DISTRESS_SALE_PENDING:        ["DISTRESS_MICROCONTRACT_LOCKED", "DISTRESS_SALE_CANCELLED"],
    DISTRESS_MICROCONTRACT_LOCKED: ["DISTRESS_SALE_COMPLETED", "DISTRESS_SALE_CANCELLED"],
    DISTRESS_SALE_COMPLETED:      [],
    DISTRESS_SALE_CANCELLED:      [],
  };
  return transitions[current] || [];
}

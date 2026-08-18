// POST /api/sgtx/back-to-back-lc/create — create a back-to-back LC
//
// Body:
//   {
//     primaryLcId?: string,
//     secondaryLcId?: string,
//     buyerGtid: string,           // required
//     sellerGtid: string,          // required
//     supplierGtid: string,        // required
//     amount: number,              // required — positive
//     currency: string,            // required — e.g., USD
//     status?: string              // optional — default PENDING
//   }
//
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      primaryLcId,
      secondaryLcId,
      buyerGtid,
      sellerGtid,
      supplierGtid,
      amount,
      currency,
      status,
    } = body || {};

    const missing: string[] = [];
    if (!buyerGtid) missing.push("buyerGtid");
    if (!sellerGtid) missing.push("sellerGtid");
    if (!supplierGtid) missing.push("supplierGtid");
    if (!currency) missing.push("currency");
    if (amount == null) missing.push("amount");
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 },
      );
    }

    const amt = Number(amount);
    if (isNaN(amt) || amt <= 0) {
      return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
    }

    const data: any = {
      buyerGtid: String(buyerGtid).trim(),
      sellerGtid: String(sellerGtid).trim(),
      supplierGtid: String(supplierGtid).trim(),
      amount: +amt.toFixed(2),
      currency: String(currency).trim(),
      status: status || "PENDING",
    };
    if (primaryLcId) data.primaryLcId = primaryLcId;
    if (secondaryLcId) data.secondaryLcId = secondaryLcId;

    const lc = await (db as any).backToBackLc.create({ data });

    logger.info("[back-to-back-lc/create] created", {
      lcId: lc.id,
      buyerGtid: data.buyerGtid,
      sellerGtid: data.sellerGtid,
      supplierGtid: data.supplierGtid,
      amount: data.amount,
      currency: data.currency,
    });

    return NextResponse.json({ ok: true, lcId: lc.id, status: data.status });
  } catch (e: any) {
    logger.error("[back-to-back-lc/create] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

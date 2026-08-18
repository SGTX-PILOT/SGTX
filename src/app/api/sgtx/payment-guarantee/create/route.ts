// POST /api/sgtx/payment-guarantee/create — create payment guarantee
//
// Body:
//   {
//     ustn?: string,
//     guaranteeType: string,            // required (e.g., STANDBY_LC, PERFORMANCE_BOND)
//     guaranteeReference?: string,
//     issuingBankGtid?: string,
//     amount: number,                   // required — positive
//     currency?: string,
//     validFrom?: string,               // ISO date
//     validTo?: string                  // ISO date
//   }
//
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      ustn,
      guaranteeType,
      guaranteeReference,
      issuingBankGtid,
      amount,
      currency,
      validFrom,
      validTo,
    } = body || {};

    const missing: string[] = [];
    if (!guaranteeType) missing.push("guaranteeType");
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
      guaranteeType: String(guaranteeType).trim(),
      amount: +amt.toFixed(2),
      confirmed: false,
    };
    if (ustn) data.ustn = ustn;
    if (guaranteeReference) data.guaranteeReference = guaranteeReference;
    if (issuingBankGtid) data.issuingBankGtid = issuingBankGtid;
    if (currency) data.currency = currency;
    if (validFrom) data.validFrom = new Date(validFrom);
    if (validTo) data.validTo = new Date(validTo);

    const guarantee = await (db as any).paymentGuarantee.create({ data });

    logger.info("[payment-guarantee/create] created", {
      guaranteeId: guarantee.id,
      guaranteeType: data.guaranteeType,
      ustn: ustn || null,
    });

    return NextResponse.json({
      ok: true,
      guaranteeId: guarantee.id,
      confirmed: false,
    });
  } catch (e: any) {
    logger.error("[payment-guarantee/create] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

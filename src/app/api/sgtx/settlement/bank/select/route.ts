// @ts-nocheck
/**
 * POST /api/sgtx/settlement/bank/select
 *
 * Body: { currency: "EGP" | "USD", payeeCountries: string[], amount: number }
 *
 * Selects a mandated bank per currency (§13.4.3 Step 2 + §13.4.2 A2 advisory).
 * Returns: { bankGtid, bankName, capabilityTier, route, rationale }
 */
import { NextRequest, NextResponse } from "next/server";
import { selectBank } from "@/lib/sgtx/direct-bank-settlement";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { currency, payeeCountries, amount } = body;
    if (!currency || (currency !== "EGP" && currency !== "USD")) {
      return NextResponse.json(
        { error: 'currency must be "EGP" or "USD"' },
        { status: 400 },
      );
    }
    const result = await selectBank(
      currency,
      Array.isArray(payeeCountries) ? payeeCountries : [],
      typeof amount === "number" ? amount : 0,
    );
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

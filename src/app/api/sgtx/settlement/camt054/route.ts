// @ts-nocheck
/**
 * POST /api/sgtx/settlement/camt054
 *
 * Body: { camt054Xml }
 *
 * Ingests an ISO 20022 camt.054.001.08 bank-to-customer debit notification
 * (§13.4.6). Matches legs by EndToEndId and updates:
 *   - PaymentLeg.legState = SETTLED
 *   - PaymentLeg.reconciliationStatus = MATCHED
 *   - SettlementInstruction.status = SETTLED
 *   - SettlementConfirmation row created
 *
 * Returns: { matchedLegs, unmatchedLegs, settlementStatus }
 */
import { NextRequest, NextResponse } from "next/server";
import { ingestCamt054 } from "@/lib/sgtx/direct-bank-settlement";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { camt054Xml } = body;
    if (!camt054Xml || typeof camt054Xml !== "string") {
      return NextResponse.json(
        { error: "camt054Xml (string) required" },
        { status: 400 },
      );
    }
    const result = await ingestCamt054(camt054Xml);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { captureBuyerBanking, BuyerBankingDetails } from "@/lib/sgtx/bank-mandate";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/sgtx/bank-mandate/banking
// Body: { tenantGtid, bankingDetails: { egp_iban, egp_bic, usd_iban, usd_bic, authorised_signatories[] } }
// Captures buyer banking details into tenants.banking_details JSONB
// (persisted via Tenant.globalNotes JSON envelope). Computes the
// bank_mandate_hash and seeds the simulated micro-deposit verification
// flow with two random small amounts per account type.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { tenantGtid, bankingDetails } = body;

    if (!tenantGtid || typeof tenantGtid !== "string") {
      return NextResponse.json({ error: "tenantGtid required" }, { status: 400 });
    }
    if (!bankingDetails || typeof bankingDetails !== "object") {
      return NextResponse.json({ error: "bankingDetails object required" }, { status: 400 });
    }
    const { egp_iban, egp_bic, usd_iban, usd_bic, authorised_signatories } = bankingDetails;
    if (!egp_iban || !egp_bic || !usd_iban || !usd_bic) {
      return NextResponse.json(
        { error: "bankingDetails must include egp_iban, egp_bic, usd_iban, usd_bic" },
        { status: 400 },
      );
    }
    if (!Array.isArray(authorised_signatories)) {
      return NextResponse.json(
        { error: "authorised_signatories[] required" },
        { status: 400 },
      );
    }

    const result = await captureBuyerBanking(tenantGtid, bankingDetails as BuyerBankingDetails);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("[api/bank-mandate/banking] POST failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}

// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { captureProviderBanking, ProviderBankingDetails } from "@/lib/sgtx/bank-mandate";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/sgtx/bank-mandate/provider-banking
// Body: { tenantGtid, bankingDetails: { iban, bic, currency } }
// Captures a provider's (seller/LSP/lab/broker/QC) banking details into
// tenants.provider_banking JSONB (persisted via Tenant.globalNotes
// JSON envelope).
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
    const { iban, bic, currency } = bankingDetails;
    if (!iban || !bic || !currency) {
      return NextResponse.json(
        { error: "bankingDetails must include iban, bic, currency" },
        { status: 400 },
      );
    }

    const result = await captureProviderBanking(
      tenantGtid,
      bankingDetails as ProviderBankingDetails,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("[api/bank-mandate/provider-banking] POST failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}

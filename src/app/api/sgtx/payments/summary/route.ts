// @ts-nocheck
import { NextResponse } from "next/server";
import { PAYMENT_SUMMARY, getCryptoLegalCountries, getOpenBankingMandatedCountries, getInstantPaymentCountries } from "@/lib/sgtx/payments/country-payment-profiles";
import { getFinanceApprovalSummary } from "@/lib/sgtx/payments/finance-approval-matrix";

// GET /api/sgtx/payments/summary — global payment landscape summary

export async function GET() {
  return NextResponse.json({
    ok: true,
    payment: PAYMENT_SUMMARY,
    finance: getFinanceApprovalSummary(),
    cryptoLegal: getCryptoLegalCountries().map(c => ({ code: c.code, name: c.name, status: c.crypto.status })),
    openBankingMandated: getOpenBankingMandatedCountries().map(c => ({ code: c.code, name: c.name, framework: c.openBanking.framework })),
    instantRails: getInstantPaymentCountries().map(c => ({ code: c.code, name: c.name, rails: c.paymentRails.filter(r => r.type === "INSTANT").map(r => r.name) })),
  });
}

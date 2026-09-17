// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createBankMandateAgreement, MandateConfig } from "@/lib/sgtx/bank-mandate";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/sgtx/bank-mandate/agreement
// Body: { tenantGtid, bankGtid, legalBasis?, customTerms?, creditLimit?, currency? }
// Creates a new bank mandate agreement record. Always requires QES
// (qualified electronic signature) per Egyptian Banking Law 194/2020 +
// SGTX Bank Mandate Agreement + Egypt Trust.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { tenantGtid, bankGtid, legalBasis, customTerms, creditLimit, currency } = body;

    if (!tenantGtid || typeof tenantGtid !== "string") {
      return NextResponse.json({ error: "tenantGtid required" }, { status: 400 });
    }
    if (!bankGtid || typeof bankGtid !== "string") {
      return NextResponse.json({ error: "bankGtid required" }, { status: 400 });
    }

    const config: MandateConfig = {
      tenantGtid,
      bankGtid,
      legalBasis: Array.isArray(legalBasis) ? legalBasis : undefined,
      customTerms: typeof customTerms === "string" ? customTerms : null,
      creditLimit: typeof creditLimit === "number" ? creditLimit : null,
      currency: typeof currency === "string" ? currency : undefined,
    };
    const result = await createBankMandateAgreement(tenantGtid, bankGtid, config);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("[api/bank-mandate/agreement] POST failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}

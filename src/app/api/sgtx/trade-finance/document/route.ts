// POST /api/sgtx/trade-finance/document — create a trade finance document
//
// Body:
//   {
//     ustn?: string,
//     financingAgreementId?: string,
//     documentType: string,         // required — e.g., LETTER_OF_CREDIT, BANK_GUARANTEE
//     documentReference?: string,
//     issuingBankGtid?: string,
//     beneficiaryGtid?: string,
//     amount?: number,
//     currency?: string,
//     validFrom?: string,           // ISO date
//     validTo?: string,             // ISO date
//     documentUrl?: string,
//     status?: string               // default PENDING
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
      financingAgreementId,
      documentType,
      documentReference,
      issuingBankGtid,
      beneficiaryGtid,
      amount,
      currency,
      validFrom,
      validTo,
      documentUrl,
      status,
    } = body || {};

    if (!documentType) {
      return NextResponse.json({ error: "Missing required field: documentType" }, { status: 400 });
    }

    const data: any = {
      documentType: String(documentType).trim(),
      status: status || "PENDING",
    };
    if (ustn) data.ustn = ustn;
    if (financingAgreementId) data.financingAgreementId = financingAgreementId;
    if (documentReference) data.documentReference = documentReference;
    if (issuingBankGtid) data.issuingBankGtid = issuingBankGtid;
    if (beneficiaryGtid) data.beneficiaryGtid = beneficiaryGtid;
    if (amount != null && !isNaN(Number(amount))) {
      data.amount = +Number(amount).toFixed(2);
    }
    if (currency) data.currency = currency;
    if (validFrom) data.validFrom = new Date(validFrom);
    if (validTo) data.validTo = new Date(validTo);
    if (documentUrl) data.documentUrl = documentUrl;

    const doc = await (db as any).tradeFinanceDocument.create({ data });

    logger.info("[trade-finance/document] created", {
      docId: doc.id,
      documentType: data.documentType,
      ustn: ustn || null,
    });

    return NextResponse.json({
      ok: true,
      documentId: doc.id,
      status: data.status,
    });
  } catch (e: any) {
    logger.error("[trade-finance/document] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

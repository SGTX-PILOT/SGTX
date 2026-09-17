// @ts-nocheck
// SGTX Phase 3 §3 — Certificate Engine API
//   POST /api/sgtx/compliance/certificates/determine
//   Body: CertificateInput — { hs6?, productName?, jurisdictionCode,
//                              originCountry, destCountry, transportMode?,
//                              applicantGtid?, intendedUse?, preferentialAgreementId?,
//                              shippingTransshipment? }
//   Returns: CertificateDetermination — all required certs + top verdict.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { determineCertificateRequirement } from "@/lib/sgtx/certificate";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "request body required" },
        { status: 400 },
      );
    }
    if (!body.jurisdictionCode || !body.originCountry || !body.destCountry) {
      return NextResponse.json(
        {
          error:
            "jurisdictionCode, originCountry and destCountry are required",
        },
        { status: 400 },
      );
    }
    const result = await determineCertificateRequirement({
      hs6: body.hs6,
      productName: body.productName,
      jurisdictionCode: body.jurisdictionCode,
      originCountry: body.originCountry,
      destCountry: body.destCountry,
      transportMode: body.transportMode,
      applicantGtid: body.applicantGtid,
      intendedUse: body.intendedUse,
      preferentialAgreementId: body.preferentialAgreementId,
      shippingTransshipment: body.shippingTransshipment,
    });
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/compliance/certificates/determine] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// SGTX Tier 2 — Public Certificate of Origin verification endpoint.
//
// GET /api/sgtx/certificates/public/[number]
//
//   Public endpoint — NO AUTH REQUIRED. Returns only the public fields
//   needed by the verification portal (no sensitive trade values, no
//   tradeId, no issuerGtid, no internal audit fields).
//
//   Public fields returned:
//     - certificateNumber
//     - certificateType
//     - originCountry, destinationCountry
//     - commodity, commodityHs
//     - issuingAuthority
//     - issueDate, expiryDate
//     - status, verifiedBy, verifiedAt
//     - documentHash (so a 3rd-party can verify the cert content)
//     - verificationUrl, qizAnnotated
//
//   Returns 404 if the certificate doesn't exist (so the portal can render
//   "Certificate not found").

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

/** Public response shape — only fields safe to expose to anonymous viewers. */
interface PublicCertificate {
  certificateNumber: string;
  certificateType: string;
  originCountry: string;
  destinationCountry: string;
  commodity: string;
  commodityHs: string;
  issuingAuthority: string;
  issueDate: string;
  expiryDate: string | null;
  status: string;
  verifiedBy: string | null;
  verifiedAt: string | null;
  documentHash: string | null;
  verificationUrl: string | null;
  qizAnnotated: boolean;
}

/**
 * GET handler — return the public-facing view of a certificate by number.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ number: string }> },
) {
  try {
    const { number: rawNumber } = await params;
    if (!rawNumber) {
      return NextResponse.json(
        { error: "Certificate number is required" },
        { status: 400 },
      );
    }
    // Decode URL-encoded certificate numbers (e.g. "EUR.1-2026-XXXX" — the dot
    // is fine but the engine mints with no special chars; still, decode for
    // safety).
    const certificateNumber = decodeURIComponent(rawNumber);

    const cert = await db.certificateOfOrigin.findUnique({
      where: { certificateNumber },
    });

    if (!cert) {
      return NextResponse.json(
        { ok: false, found: false, error: "Certificate not found" },
        { status: 404 },
      );
    }

    const payload: PublicCertificate = {
      certificateNumber: cert.certificateNumber,
      certificateType: cert.certificateType,
      originCountry: cert.originCountry,
      destinationCountry: cert.destinationCountry,
      commodity: cert.commodity,
      commodityHs: cert.commodityHs,
      issuingAuthority: cert.issuingAuthority,
      issueDate: cert.issueDate.toISOString(),
      expiryDate: cert.expiryDate ? cert.expiryDate.toISOString() : null,
      status: cert.status,
      verifiedBy: cert.verifiedBy,
      verifiedAt: cert.verifiedAt ? cert.verifiedAt.toISOString() : null,
      documentHash: cert.documentHash,
      verificationUrl: cert.verificationUrl,
      qizAnnotated: cert.qizAnnotated,
    };

    return NextResponse.json({ ok: true, found: true, certificate: payload });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[certificates/public/[number]/GET] error:", { msg, raw: String(e) });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

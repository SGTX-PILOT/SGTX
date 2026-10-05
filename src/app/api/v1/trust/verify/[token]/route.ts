// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/v1/trust/verify/{token} — Public Trust Passport verification (v18 §4.12.4)
//
// v18 §4.12.4 Step 3 — Recipient Verification: the recipient opens the link
// (no login required). The page displays the passport data (only the
// dimensions the sharer consented to). The recipient can download the signed
// JSON or copy a verification code to check offline. The page shows a green
// checkmark if the signature is valid and the passport is not revoked or
// expired.
//
// v18 §4.12.4 Step 4 — Revoke Access: any subsequent attempt to verify a
// revoked token returns:
//   { "valid": false, "reason": "revoked" }
//
// Public (no auth) — the token acts as a capability token.

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } },
) {
  try {
    const token = params.token;
    if (!token || token.length < 16) {
      return NextResponse.json(
        { valid: false, reason: "INVALID_TOKEN", message: "Token must be at least 16 characters" },
        { status: 400, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    const { freshDb } = await import("@/lib/db-fresh");
    const tokenRow = await freshDb.trustPassportToken.findUnique({
      where: { token },
    });

    if (!tokenRow) {
      return NextResponse.json(
        { valid: false, reason: "TOKEN_NOT_FOUND", message: "Token does not exist" },
        { status: 404, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    if (tokenRow.revoked) {
      return NextResponse.json(
        { valid: false, reason: "revoked", message: "Token has been revoked by the sharer" },
        { status: 410, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    if (tokenRow.expiresAt && tokenRow.expiresAt < new Date()) {
      return NextResponse.json(
        { valid: false, reason: "expired", message: "Token has expired", expired_at: tokenRow.expiresAt },
        { status: 410, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    const passport = await freshDb.trustPassport.findUnique({
      where: { id: tokenRow.passportId },
    });

    if (!passport) {
      return NextResponse.json(
        { valid: false, reason: "PASSPORT_NOT_FOUND", message: "Underlying Trust Passport no longer exists" },
        { status: 404, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    if (passport.expiresAt && passport.expiresAt < new Date()) {
      return NextResponse.json(
        { valid: false, reason: "passport_expired", message: "Underlying Trust Passport has expired", expired_at: passport.expiresAt },
        { status: 410, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    // Check for passport revocation
    const revocation = await freshDb.trustPassportRevocation.findFirst({
      where: { passportId: passport.id },
    });
    if (revocation) {
      return NextResponse.json(
        { valid: false, reason: "passport_revoked", message: "Underlying Trust Passport has been revoked", reason_detail: revocation.reason },
        { status: 410, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    // Filter dimensions per the share consent
    const consentedDimensions: string[] = JSON.parse(tokenRow.dimensions || "[]");
    const credential: any = {
      "@context": ["https://www.w3.org/2018/credentials/v1"],
      id: `urn:uuid:${passport.id}`,
      type: ["VerifiableCredential", "SGTXTradeTrustPassport"],
      issuer: "did:sgtx:platform-governance-authority",
      issuanceDate: passport.issuedAt.toISOString(),
      expirationDate: passport.expiresAt.toISOString(),
      credentialSubject: {
        gtid: passport.tenantGtid,
      },
      proof: {
        type: "Ed25519Signature2018",
        created: passport.issuedAt.toISOString(),
        verificationMethod: "did:sgtx:platform-governance-authority#keys-1",
        proofValue: passport.signature,
        credential_hash: passport.credentialHash,
      },
    };

    // Only include consented dimensions
    if (consentedDimensions.includes("tri_score")) credential.credentialSubject.tri_score = passport.triScore;
    if (consentedDimensions.includes("tri_confidence")) credential.credentialSubject.tri_confidence = passport.triConfidence;
    if (consentedDimensions.includes("tri_status")) credential.credentialSubject.tri_status = passport.triStatus;
    if (consentedDimensions.includes("settlement_reliability")) credential.credentialSubject.settlement_reliability = passport.settlementReliability;
    if (consentedDimensions.includes("compliance_health")) credential.credentialSubject.compliance_health = passport.complianceHealth;
    if (consentedDimensions.includes("documentation_quality")) credential.credentialSubject.documentation_quality = passport.documentationQuality;
    if (consentedDimensions.includes("financing_performance")) credential.credentialSubject.financing_performance = passport.financingPerformance;
    if (consentedDimensions.includes("dispute_resolution")) credential.credentialSubject.dispute_resolution = passport.disputeResolution;
    if (consentedDimensions.includes("customs_performance")) credential.credentialSubject.customs_performance = passport.customsPerformance;
    if (consentedDimensions.includes("logistics_performance")) credential.credentialSubject.logistics_performance = passport.logisticsPerformance;
    if (consentedDimensions.includes("trade_volume_consistency")) credential.credentialSubject.trade_volume_consistency = passport.tradeVolumeConsistency;
    if (consentedDimensions.includes("verified_identifiers")) credential.credentialSubject.verified_identifiers = JSON.parse(passport.verifiedIdentifiers || "[]");
    if (consentedDimensions.includes("compliance_summary")) credential.credentialSubject.compliance_summary = passport.complianceSummary;
    if (consentedDimensions.includes("financing_summary")) credential.credentialSubject.financing_summary = passport.financingSummary;
    if (consentedDimensions.includes("dispute_summary")) credential.credentialSubject.dispute_summary = passport.disputeSummary;
    if (consentedDimensions.includes("trust_graph_reference")) credential.credentialSubject.trust_graph_reference = passport.trustGraphReference;

    // Track access (for audit)
    try {
      await freshDb.trustPassportToken.update({
        where: { id: tokenRow.id },
        data: { accessedBy: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown" },
      });
    } catch {
      // non-fatal
    }

    return NextResponse.json(
      {
        valid: true,
        credential,
        shared_with: tokenRow.sharedWithGtid,
        expires_at: tokenRow.expiresAt,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "X-SGTX-Version": "v18.0",
        },
      },
    );
  } catch (e: any) {
    logger.error("[v1/trust/verify/{token}] error:", { error: e?.message || String(e) });
    return NextResponse.json(
      { valid: false, reason: "VERIFICATION_FAILED", error: e?.message || "Unknown error" },
      { status: 503, headers: { "X-SGTX-Version": "v18.0" } },
    );
  }
}

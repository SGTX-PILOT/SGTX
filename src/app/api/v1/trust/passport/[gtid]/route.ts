// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/v1/trust/passport/{gtid} — Get Trust Passport for the given GTID (v18 §4.12.4)
//
// Returns the canonical W3C Verifiable Credential for the tenant.
// Auth: Bearer JWT — the caller must be the passport owner (or have explicit
// consent to view). Anonymous callers get 401; demo portals fall back to
// /api/sgtx/trust-passport which uses tenant query param.
//
// Response shape (v18 §4.12.3 Verifiable Credential Format):
//   {
//     "@context": ["https://www.w3.org/2018/credentials/v1"],
//     "id": "urn:uuid:<passport-id>",
//     "type": ["VerifiableCredential", "SGTXTradeTrustPassport"],
//     "issuer": "did:sgtx:platform-governance-authority",
//     "issuanceDate": "<ISO-8601>",
//     "expirationDate": "<ISO-8601>",
//     "credentialSubject": {
//       "gtid": "...",
//       "legal_name": "...",
//       "type": "...",
//       "subtype": "...",
//       "jurisdiction": "...",
//       "kyb_tier": 2,
//       "kyb_status": "VERIFIED",
//       "sanctions_cleared": true,
//       "pep_status": "CLEAR",
//       "lifecycle_state": "VERIFIED",
//       "tri_score": 92,
//       "tri_confidence": 81,
//       "tri_status": "Advanced Trusted",
//       "dimensions": { ... },
//       "verified_identifiers": [...]
//     },
//     "proof": {
//       "type": "Ed25519Signature2018",
//       "created": "<ISO-8601>",
//       "verificationMethod": "did:sgtx:platform-governance-authority#keys-1",
//       "proofValue": "<base58-encoded signature>"
//     }
//   }
//
// If no passport exists for the GTID, returns 404 + suggestion to generate.

interface CallerPayload {
  gtid?: string;
  tenantGtid?: string;
  role?: string;
}

function getCaller(req: NextRequest): CallerPayload | null {
  const raw = req.headers.get("x-sgtx-payload");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { gtid: string } },
) {
  try {
    const caller = getCaller(req);
    if (!caller?.gtid) {
      return NextResponse.json(
        { error: "Authentication required", hint: "Use /api/sgtx/trust-passport for demo-portal access" },
        { status: 401, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    const targetGtid = params.gtid.toUpperCase();
    // Caller can only view their own passport; cross-tenant requires a share token.
    if (caller.gtid !== targetGtid && caller.tenantGtid !== targetGtid) {
      return NextResponse.json(
        { error: "ACCESS_DENIED", message: "Use POST /v1/trust/share to share your passport with this counterparty first" },
        { status: 403, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    const { freshDb } = await import("@/lib/db-fresh");
    const passport = await freshDb.trustPassport.findUnique({
      where: { tenantGtid: targetGtid },
    });

    if (!passport) {
      return NextResponse.json(
        {
          error: "PASSPORT_NOT_FOUND",
          message: "No Trust Passport found for this GTID. Generate one via POST /api/sgtx/trust-passport/generate",
          gtid: targetGtid,
        },
        { status: 404, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    if (passport.expiresAt && passport.expiresAt < new Date()) {
      return NextResponse.json(
        {
          error: "PASSPORT_EXPIRED",
          message: "Trust Passport has expired. Generate a new one via POST /api/sgtx/trust-passport/generate",
          gtid: targetGtid,
          expired_at: passport.expiresAt,
        },
        { status: 410, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    // Check for revocation
    const revocation = await freshDb.trustPassportRevocation.findFirst({
      where: { passportId: passport.id },
    });
    if (revocation) {
      return NextResponse.json(
        {
          error: "PASSPORT_REVOKED",
          message: "Trust Passport has been revoked",
          gtid: targetGtid,
          reason: revocation.reason,
          revoked_at: revocation.createdAt,
        },
        { status: 410, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    // Build the W3C Verifiable Credential payload (v18 §4.12.3)
    const credential = {
      "@context": ["https://www.w3.org/2018/credentials/v1"],
      id: `urn:uuid:${passport.id}`,
      type: ["VerifiableCredential", "SGTXTradeTrustPassport"],
      issuer: "did:sgtx:platform-governance-authority",
      issuanceDate: passport.issuedAt.toISOString(),
      expirationDate: passport.expiresAt.toISOString(),
      credentialSubject: {
        gtid: passport.tenantGtid,
        tri_score: passport.triScore,
        tri_confidence: passport.triConfidence,
        tri_status: passport.triStatus,
        dimensions: {
          settlement_reliability: passport.settlementReliability,
          compliance_health: passport.complianceHealth,
          documentation_quality: passport.documentationQuality,
          financing_performance: passport.financingPerformance,
          dispute_resolution: passport.disputeResolution,
          customs_performance: passport.customsPerformance,
          logistics_performance: passport.logisticsPerformance,
          trade_volume_consistency: passport.tradeVolumeConsistency,
        },
        verified_identifiers: JSON.parse(passport.verifiedIdentifiers || "[]"),
        compliance_summary: passport.complianceSummary,
        financing_summary: passport.financingSummary,
        dispute_summary: passport.disputeSummary,
        trust_graph_reference: passport.trustGraphReference,
      },
      proof: {
        type: "Ed25519Signature2018",
        created: passport.issuedAt.toISOString(),
        verificationMethod: "did:sgtx:platform-governance-authority#keys-1",
        proofValue: passport.signature,
        credential_hash: passport.credentialHash,
      },
      loom_hash: passport.loomHash,
    };

    return NextResponse.json(credential, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-SGTX-Version": "v18.0",
      },
    });
  } catch (e: any) {
    logger.error("[v1/trust/passport/{gtid}] error:", { error: e?.message || String(e) });
    return NextResponse.json(
      { error: "Trust Passport retrieval failed" },
      { status: 503, headers: { "X-SGTX-Version": "v18.0" } },
    );
  }
}

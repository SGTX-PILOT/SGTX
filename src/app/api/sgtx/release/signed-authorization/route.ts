import { logger } from "@/lib/sgtx/logger";
// Part 8.5 — Signed Authorization Pipeline API
//
// POST /api/sgtx/release/signed-authorization
//
// Generates a detached PKCS#7/CMS-style signature over the release
// authorization payload, bound to SGTX's Egypt Trust qualified signing
// certificate.
//
// Two modes:
//   1. Caller supplies a complete payload — we sign and persist.
//   2. Caller supplies just { ustn, container } — we call the existing
//      queryReleaseAuthorisation() from src/lib/sgtx/release to derive
//      the AUTHORISATION payload, then sign it.
//
// Body (mode 2 — derive-then-sign):
//   { ustn: string, container: string, terminalId?: string }
//
// Body (mode 1 — caller-supplied payload):
//   { payload: ReleaseAuthorizationPayload }
//
// Returns the signed envelope including the signature, signing cert
// metadata, signatureId (UUID for audit lookup), and validUntil window.

import { NextRequest, NextResponse } from "next/server";
import {
  signAuthorization,
  getSigningCertificate,
  type ReleaseAuthorizationPayload,
} from "@/lib/sgtx/release/signed-authorization";
import { queryReleaseAuthorisation } from "@/lib/sgtx/release";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Mode 1 — caller-supplied payload.
    if (body?.payload && typeof body.payload === "object") {
      const payload = body.payload as ReleaseAuthorizationPayload;
      if (!payload.authorisationId || !payload.ustn || !payload.container) {
        return NextResponse.json(
          {
            error:
              "payload must include at least authorisationId, ustn, container, issuedAt, validUntil, releaseStatus, disputeStatus",
          },
          { status: 400 },
        );
      }
      const signed = await signAuthorization(payload);
      return NextResponse.json(signed, { status: 201 });
    }

    // Mode 2 — derive-then-sign.
    const { ustn, container, terminalId } = body as {
      ustn?: string;
      container?: string;
      terminalId?: string;
    };
    if (!ustn || !container) {
      return NextResponse.json(
        {
          error:
            "Either { payload: ReleaseAuthorizationPayload } OR { ustn, container, terminalId? } is required",
        },
        { status: 400 },
      );
    }

    // Query the existing release-authorization pipeline.
    const release = await queryReleaseAuthorisation({
      ustn,
      containerNo: container,
      terminalId,
    });

    if (release.release_status === "ERROR") {
      return NextResponse.json(
        {
          error: "Cannot sign — release authorization returned ERROR",
          release,
        },
        { status: 400 },
      );
    }
    if (release.release_status === "HOLD") {
      return NextResponse.json(
        {
          error: "Cannot sign — release authorization is on HOLD",
          release,
        },
        { status: 403 },
      );
    }

    // Build the payload from the release response.
    const payload: ReleaseAuthorizationPayload = {
      authorisationId: release.authorisation_id || `REL-DERIVED-${Date.now()}`,
      ustn,
      container,
      terminalId,
      releaseStatus: release.release_status,
      issuedAt: release.issued_at || new Date().toISOString(),
      validUntil: release.valid_until || new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      mandatorySummary: release.mandatory_summary,
      creditSummary: release.credit_summary,
      disputeStatus: release.dispute_status,
    };

    const signed = await signAuthorization(payload);
    return NextResponse.json(signed, { status: 201 });
  } catch (e: any) {
    logger.error("[signed-authorization/route] POST error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET — return SGTX's signing certificate (Egypt Trust qualified, simulated).
export async function GET() {
  return NextResponse.json({
    signingCertificate: getSigningCertificate(),
    format: "sgtx-signed-auth-v1",
    signatureAlgorithm: "SHA256-RSA",
    endpoints: {
      sign: "POST /api/sgtx/release/signed-authorization",
      signingCert: "GET /api/sgtx/release/signed-authorization",
    },
    mode: "SIMULATION",
  });
}

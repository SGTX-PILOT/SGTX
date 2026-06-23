// Part 8.4 — Single-certificate management API
//
// GET    /api/sgtx/release/certificates/[clientId]      → cert details + verify status
// DELETE /api/sgtx/release/certificates/[clientId]      → revoke the cert (adds to CRL)
//
// DELETE body (application/json, optional):
//   { reason: string, revokedBy?: string }
// Default reason: "compromised_or_superseded"

import { NextRequest, NextResponse } from "next/server";
import {
  verifyCertificate,
  revokeCertificate,
} from "@/lib/sgtx/release/cert-management";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await params;
    if (!clientId) {
      return NextResponse.json(
        { error: "clientId path parameter is required" },
        { status: 400 },
      );
    }

    const result = await verifyCertificate(clientId);
    if (!result.certificate) {
      return NextResponse.json(
        {
          error: `No certificate found for clientId=${clientId}`,
          valid: false,
          reason: result.reason,
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      valid: result.valid,
      reason: result.reason,
      certificate: result.certificate,
      revoked: result.revoked,
      expired: result.expired,
      mode: "SIMULATION",
    });
  } catch (e: any) {
    console.error("[certificates/[clientId]/route] GET error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await params;
    if (!clientId) {
      return NextResponse.json(
        { error: "clientId path parameter is required" },
        { status: 400 },
      );
    }

    let body: { reason?: string; revokedBy?: string } = {};
    try {
      body = await req.json();
    } catch {
      // body is optional
    }
    const reason = body.reason || "compromised_or_superseded";
    const revokedBy = body.revokedBy || "sgtx-ca-admin";

    const result = await revokeCertificate(clientId, reason, revokedBy);
    if (!result.revoked) {
      return NextResponse.json(
        { error: result.reason, revoked: false },
        { status: 400 },
      );
    }

    return NextResponse.json({
      revoked: true,
      crlEntry: result.crlEntry,
      reason: result.reason,
      mode: "SIMULATION",
      crlEndpoint: "GET /api/sgtx/release/crl",
    });
  } catch (e: any) {
    console.error("[certificates/[clientId]/route] DELETE error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Part 8.4 — Certificate rotation API
//
// POST /api/sgtx/release/certificates/[clientId]/rotate
//
// Rotates the certificate: mints a new serial + keypair + fingerprint,
// marks the old cert SUPERSEDED, and persists both. The new cert has
// validity starting NOW and extending for another year.
//
// Body (optional):
//   { rotatedBy?: string }

import { NextRequest, NextResponse } from "next/server";
import { rotateCertificate } from "@/lib/sgtx/release/cert-management";

export async function POST(
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

    let body: { rotatedBy?: string } = {};
    try {
      body = await req.json();
    } catch {
      // body is optional
    }
    const rotatedBy = body.rotatedBy || "sgtx-ca-admin";

    const result = await rotateCertificate(clientId, rotatedBy);
    return NextResponse.json({
      rotated: true,
      oldCert: result.oldCert,
      newCert: result.newCert,
      rotatedAt: result.rotatedAt,
      mode: "SIMULATION",
      message: `Certificate ${clientId} rotated — old serial ${result.oldCert.serialNumber.slice(0, 23)}... superseded by new serial ${result.newCert.serialNumber.slice(0, 23)}...`,
    });
  } catch (e: any) {
    if (e.message && e.message.includes("no certificate found")) {
      return NextResponse.json({ error: e.message }, { status: 404 });
    }
    console.error("[certificates/[clientId]/rotate/route] POST error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

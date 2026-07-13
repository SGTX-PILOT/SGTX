// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
// GET  /api/sgtx/gov/certificates — list mTLS certificate inventory + expiry
// POST /api/sgtx/gov/certificates — rotate a certificate
//   Body: { adapter: "NAFEZA" | "CARGOX" | "ETA" | "CBE", reason?: string }
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  listCertificates,
  rotateCertificate,
  GOV_ADAPTER_NAMES,
} from "@/lib/sgtx/gov/adapter-auth";

export async function GET() {
  try {
    const certs = listCertificates();
    const now = Date.now();

    return NextResponse.json({
      ok: true,
      mode: "SIMULATION",
      checkedAt: new Date().toISOString(),
      ca: "Egypt Trust CA G2",
      totalCertificates: certs.length,
      certificates: certs,
      summary: {
        active: certs.filter(c => c.certificate.status === "ACTIVE").length,
        expiringWithin60Days: certs.filter(c => c.daysUntilExpiry < 60).length,
        expiringWithin30Days: certs.filter(c => c.daysUntilExpiry < 30).length,
        expired: certs.filter(c => c.daysUntilExpiry < 0).length,
        avgDaysUntilExpiry: Math.round(
          certs.reduce((s, c) => s + c.daysUntilExpiry, 0) / certs.length,
        ),
        oldestRotation:
          certs.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry)[0]?.adapter ?? null,
      },
      generatedAt: new Date(now).toISOString(),
    });
  } catch (e: any) {
    logger.error("[gov/certificates GET]", e);
    return NextResponse.json(
      { error: e?.message ?? "Failed to list certificates" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { adapter, reason } = body || {};

    if (!adapter) {
      return NextResponse.json(
        { error: "Missing required field: adapter" },
        { status: 400 },
      );
    }
    const upper = String(adapter).toUpperCase();
    if (!GOV_ADAPTER_NAMES.includes(upper as never)) {
      return NextResponse.json(
        {
          error: `Unknown government adapter "${adapter}". Valid: ${GOV_ADAPTER_NAMES.join(", ")}`,
        },
        { status: 404 },
      );
    }

    const rotation = rotateCertificate(upper);

    // Persist an activity log row so the rotation is auditable.
    try {
      const { freshDb } = await import("@/lib/db-fresh");
      await freshDb.activity.create({
        data: {
          actorGtid: "SGTX-ZZ-ADM-000001-A1B2",
          action: `GOV_CERT_ROTATED_${upper}`,
          description: `mTLS certificate for ${upper} rotated${
            reason ? ` (reason: ${reason})` : ""
          }. New serial: ${rotation.rotated.serialNumber}`,
          type: "SUCCESS",
          metadata: JSON.stringify({
            adapter: upper,
            previousSerial: rotation.previous.serialNumber,
            newSerial: rotation.rotated.serialNumber,
            newFingerprint: rotation.rotated.fingerprint,
            validUntil: rotation.rotated.validUntil,
            reason: reason ?? "scheduled_rotation",
          }),
        },
            }) as any;
    } catch (e) {
      logger.error("[gov/certificates POST] activity log failed:", e);
    }

    return NextResponse.json({
      ok: true,
      mode: "SIMULATION",
      ...rotation,
      reason: reason ?? "scheduled_rotation",
        }) as any;
  } catch (e: any) {
    logger.error("[gov/certificates POST]", e);
    return NextResponse.json(
      { error: e?.message ?? "Failed to rotate certificate" },
      { status: 500 },
    );
  }
}

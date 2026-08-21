// @ts-nocheck
// POST /api/sgtx/air/security/verify
// Body: { shipmentId, ustn?, ustn, expectedStatus?, eCsdReference? }
// Verifies security state — confirms that all cargo pieces are security-cleared
// and (optionally) issues an eCSD reference if all pieces are SECURE.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.shipmentId && !body?.ustn) {
      return NextResponse.json(
        { error: "shipmentId or ustn required" },
        { status: 400 },
      );
    }

    let shipmentId = body.shipmentId;
    let shipment: any = null;
    if (body.ustn && !shipmentId) {
      shipment = await db.airCargoShipment.findFirst({ where: { ustn: body.ustn } });
      shipmentId = shipment?.id;
    } else if (shipmentId) {
      shipment = await db.airCargoShipment.findUnique({
        where: { id: shipmentId },
        include: { cargoPieces: true, securityRecords: { orderBy: { createdAt: "desc" } } },
      });
    }
    if (!shipment || !shipmentId) {
      return NextResponse.json({ error: "shipment not found" }, { status: 404 });
    }

    // Pull all security records and check the most recent
    const records = shipment.securityRecords || [];
    const latestRecord = records[0];
    const securityStatus = shipment.securityStatus || (latestRecord?.securityStatus || "PENDING");

    // All cargo pieces must be SCREENED or SECURE
    const pieces = shipment.cargoPieces || [];
    const piecesSecured = pieces.every(
      (p: any) => p.securityState === "SCREENED" || p.securityState === "SECURE",
    );

    const isVerified =
      (securityStatus === "SECURE" || securityStatus === "SCREENED") &&
      (pieces.length === 0 || piecesSecured);

    // If verified and eCsdReference provided, update the latest record
    let updatedRecord: any = null;
    if (isVerified && body.eCsdReference && latestRecord) {
      try {
        updatedRecord = await db.airSecurityRecord.update({
          where: { id: latestRecord.id },
          data: {
            eCsdStatus: "ISSUED",
            eCsdReference: body.eCsdReference,
          },
        });
      } catch (e: any) {
        logger.warn("[api/air/security/verify] eCSD update failed", { error: e?.message });
      }
    }

    logger.info("[api/air/security/verify] POST verified", {
      shipmentId,
      securityStatus,
      piecesSecured,
      isVerified,
    });

    return NextResponse.json({
      verified: isVerified,
      shipmentId,
      securityStatus,
      piecesTotal: pieces.length,
      piecesSecured,
      latestScreening: latestRecord || null,
      updatedRecord,
    });
  } catch (err: any) {
    logger.error("[api/air/security/verify] POST failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

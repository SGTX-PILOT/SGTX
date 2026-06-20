import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import crypto from "crypto";

// POST /api/sgtx/ship/bl-issue — Issue a Bill of Lading (Phase 6)
// Body: { shipmentId?: string, ustn?: string, tradeId?: string, carrierGtid?: string, issuerGtid?: string }
//
// Creates a Document record of type "BILL_OF_LADING" with a generated B/L number
// (SGTX-BL-{YYYYMMDD}-{SEQ6}) and a SHA-256 hash, linked to the trade. Also writes
// an Activity log entry (action BL_ISSUED) so the audit trail is updated.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { shipmentId, ustn, tradeId, carrierGtid, issuerGtid } = body || {};

    // Resolve the trade + shipment
    let trade: any = null;
    let shipment: any = null;
    if (tradeId) {
      trade = await db.trade.findUnique({ where: { id: tradeId }, include: { shipments: true } });
    } else if (ustn) {
      trade = await db.trade.findUnique({ where: { ustn }, include: { shipments: true } });
    } else if (shipmentId) {
      shipment = await db.shipment.findUnique({ where: { id: shipmentId }, include: { trade: true } });
      trade = shipment?.trade || null;
    }
    if (!trade) {
      return NextResponse.json({ error: "Trade not found — supply tradeId, ustn or shipmentId" }, { status: 404 });
    }
    if (!shipment && shipmentId) {
      shipment = await db.shipment.findUnique({ where: { id: shipmentId } });
    }
    if (!shipment && trade.shipments?.length) {
      // pick the first non-released shipment, fallback to first
      shipment = trade.shipments.find((s: any) => s.status !== "RELEASED" && s.status !== "DELIVERED") || trade.shipments[0];
    }

    // Generate B/L number: SGTX-BL-{YYYYMMDD}-{SEQ6}
    const today = new Date();
    const yyyymmdd = today.toISOString().slice(0, 10).replace(/-/g, "");
    const seq = Math.floor(Math.random() * 900000 + 100000).toString();
    const blNumber = `SGTX-BL-${yyyymmdd}-${seq}`;

    // Compute SHA-256 hash of the B/L payload
    const payload = JSON.stringify({
      blNumber,
      ustn: trade.ustn,
      tradeId: trade.id,
      shipmentId: shipment?.id || null,
      containerNo: shipment?.containerNo || null,
      vesselName: shipment?.vesselName || null,
      vesselImo: shipment?.vesselImo || null,
      originPort: shipment?.originPort || trade.originPort,
      destPort: shipment?.destPort || trade.destPort,
      commodity: trade.commodity,
      grossWeightKg: trade.grossWeightKg,
      netWeightKg: trade.netWeightKg,
      issuerGtid: issuerGtid || carrierGtid || shipment?.carrierGtid || null,
      issuedAt: today.toISOString(),
    });
    const hashSha256 = "sha256:" + crypto.createHash("sha256").update(payload).digest("hex");

    // Create Document record (type BILL_OF_LADING, status VERIFIED)
    const doc = await db.document.create({
      data: {
        tradeId: trade.id,
        type: "BILL_LADING",
        title: `Bill of Lading ${blNumber}`,
        status: "VERIFIED",
        uploadedBy: issuerGtid || carrierGtid || shipment?.carrierGtid || null,
        hashSha256,
        verifiedAt: today,
      },
    });

    // Update shipment status to reflect B/L issuance (PLANNED/LOADED → LOADED)
    if (shipment) {
      try {
        await db.shipment.update({
          where: { id: shipment.id },
          data: { status: shipment.status === "PLANNED" ? "LOADED" : shipment.status },
        });
      } catch { /* ignore shipment update failure */ }
    }

    // Activity log
    try {
      await db.activity.create({
        data: {
          tradeId: trade.id,
          actorGtid: issuerGtid || carrierGtid || shipment?.carrierGtid || null,
          action: "BL_ISSUED",
          description: `Bill of Lading ${blNumber} issued (doc ${doc.id.slice(-8)}). Hash ${hashSha256.slice(0, 22)}…`,
          type: "SUCCESS",
          metadata: JSON.stringify({ blNumber, docId: doc.id, shipmentId: shipment?.id || null, hashSha256 }),
        },
      });
    } catch { /* ignore activity log failure */ }

    return NextResponse.json({
      ok: true,
      blNumber,
      docId: doc.id,
      hashSha256,
      shipmentId: shipment?.id || null,
      tradeId: trade.id,
      ustn: trade.ustn,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to issue B/L" }, { status: 500 });
  }
}

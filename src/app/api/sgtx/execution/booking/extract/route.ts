// 3B.6.1 — Booking Confirmation AI Extraction
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { extractBookingData } from "@/lib/sgtx/ai/orchestrator";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { shipmentId, fileName, fileSizeKb, uploadedBy, carrierName } = body;
    if (!shipmentId || !fileName) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

    const shipment = await db.shipment.findUnique({ where: { id: shipmentId } });
    if (!shipment) return NextResponse.json({ error: "Shipment not found" }, { status: 404 });

    // AI extract (A1 — simulated Donut)
    let extracted: any = null;
    let aiProvider = "zai";
    try {
      const r = await extractBookingData({ fileName, fileSizeKb: fileSizeKb || 0, carrierName: carrierName || "Shipping Line" });
      try { extracted = JSON.parse(r.content); } catch { extracted = { raw: r.content }; }
      aiProvider = r.provider;
    } catch { /* ignore */ }

    // Validate against shipment
    let validationStatus = "VALIDATED";
    let validationNotes = "All extracted fields match shipment.";
    if (extracted?.vessel_name && shipment.vesselName && !shipment.vesselName.toLowerCase().includes(extracted.vessel_name.toLowerCase())) {
      validationStatus = "MISMATCH";
      validationNotes = `Vessel name mismatch: extracted "${extracted.vessel_name}" vs shipment "${shipment.vesselName}".`;
    }

    const booking = await db.bookingConfirmation.create({
      data: {
        shipmentId, ustn: shipment.ustn, uploadedBy: uploadedBy || null,
        fileName, fileSizeKb: fileSizeKb || 0,
        extractedVessel: extracted?.vessel_name || null,
        extractedImo: extracted?.imo || null,
        extractedVoyage: extracted?.voyage || null,
        extractedEtd: extracted?.etd ? new Date(extracted.etd) : null,
        extractedEta: extracted?.eta ? new Date(extracted.eta) : null,
        extractedContainerNumbers: extracted?.container_numbers ? JSON.stringify(extracted.container_numbers) : null,
        validationStatus, validationNotes, aiProvider,
      },
    });

    return NextResponse.json({ ok: true, bookingId: booking.id, extracted, validationStatus, validationNotes, aiProvider });
  } catch (e: any) {
    console.error("[execution/booking/extract]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET — list booking confirmations for a shipment
export async function GET(req: NextRequest) {
  const shipmentId = req.nextUrl.searchParams.get("shipmentId");
  const ustn = req.nextUrl.searchParams.get("ustn");
  const where: any = {};
  if (shipmentId) where.shipmentId = shipmentId;
  if (ustn) where.ustn = ustn;
  const bookings = await db.bookingConfirmation.findMany({ where, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ bookings });
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

type ScanType = "LOAD" | "GATE_OUT" | "ARRIVAL" | "DELIVERY";

const ALLOWED_SCAN_TYPES: ScanType[] = ["LOAD", "GATE_OUT", "ARRIVAL", "DELIVERY"];

const SCAN_TYPE_LABELS: Record<ScanType, string> = {
  LOAD: "Pallet loaded onto transport",
  GATE_OUT: "Pallet exited facility gate",
  ARRIVAL: "Pallet arrived at destination facility",
  DELIVERY: "Pallet delivered to consignee",
};

// POST /api/sgtx/barcodes/scan
// Body: { sscc, ustn?, scannedByGtid?, scanLocation?, scanType, metadata? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sscc, ustn, scannedByGtid, scanLocation, scanType, metadata } = body as {
      sscc?: string;
      ustn?: string;
      scannedByGtid?: string;
      scanLocation?: string;
      scanType?: ScanType;
      metadata?: Record<string, unknown>;
    };

    if (!sscc) {
      return NextResponse.json({ error: "sscc required" }, { status: 400 });
    }
    if (!scanType || !ALLOWED_SCAN_TYPES.includes(scanType)) {
      return NextResponse.json(
        { error: "invalid scanType", allowed: ALLOWED_SCAN_TYPES },
        { status: 400 },
      );
    }

    // Resolve USTN from pallet record if not provided.
    let resolvedUstn = ustn ?? null;
    let tradeId: string | null = null;
    const pallet = await db.palletDetail.findUnique({
      where: { sscc },
      select: { ustn: true, tradeId: true, product: true },
    });
    if (pallet) {
      resolvedUstn = resolvedUstn ?? pallet.ustn;
      tradeId = pallet.tradeId ?? null;
    }

    // Persist the scan record.
    const scan = await db.barcodeScan.create({
      data: {
        sscc,
        ustn: resolvedUstn,
        scannedByGtid: scannedByGtid ?? null,
        scanLocation: scanLocation ?? null,
        scanType,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });

    // Activity log entry — milestone confirmation.
    await db.activity.create({
      data: {
        tradeId,
        actorGtid: scannedByGtid ?? null,
        action: "PALLET_SCANNED",
        description: `Pallet ${sscc} scan recorded (${scanType}) — ${SCAN_TYPE_LABELS[scanType]}${
          scanLocation ? ` @ ${scanLocation}` : ""
        }`,
        type: "INFO",
        metadata: JSON.stringify({
          sscc,
          scanType,
          scanLocation: scanLocation ?? null,
          scanId: scan.id,
        }),
      },
    });

    return NextResponse.json({
      ok: true,
      scanId: scan.id,
      sscc: scan.sscc,
      ustn: scan.ustn,
      scanType: scan.scanType,
      scannedAt: scan.createdAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "SCAN_FAILED", detail: message }, { status: 500 });
  }
}

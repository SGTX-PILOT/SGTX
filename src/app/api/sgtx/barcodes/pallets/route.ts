import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/barcodes/pallets?ustn=...&tradeId=...&sscc=...
// Returns the list of pallets for a trade (filtered by ustn; optional tradeId/sscc).
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const ustn = sp.get("ustn");
    const tradeId = sp.get("tradeId");
    const sscc = sp.get("sscc");

    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }

    const where: { ustn: string; tradeId?: string; sscc?: string } = { ustn };
    if (tradeId) where.tradeId = tradeId;
    if (sscc) where.sscc = sscc;

    const pallets = await db.palletDetail.findMany({
      where,
      orderBy: [{ sequence: "asc" }, { createdAt: "asc" }],
    });

    // Aggregate scan history per pallet for convenience.
    const ssccs = pallets.map((p) => p.sscc);
    const scans = ssccs.length
      ? await db.barcodeScan.findMany({
          where: { sscc: { in: ssccs } },
          orderBy: { createdAt: "desc" },
        })
      : [];

    const scansBySscc = new Map<string, typeof scans>();
    for (const s of scans) {
      const arr = scansBySscc.get(s.sscc) ?? [];
      arr.push(s);
      scansBySscc.set(s.sscc, arr);
    }

    return NextResponse.json({
      ok: true,
      count: pallets.length,
      pallets: pallets.map((p) => ({
        id: p.id,
        tradeId: p.tradeId,
        ustn: p.ustn,
        sscc: p.sscc,
        sequence: p.sequence,
        product: p.product,
        lotNumber: p.lotNumber,
        netWeightKg: p.netWeightKg,
        grossWeightKg: p.grossWeightKg,
        originCountry: p.originCountry,
        treatmentStatus: p.treatmentStatus,
        loomHash: p.loomHash,
        hasQr: Boolean(p.qrData),
        createdAt: p.createdAt,
        scans: (scansBySscc.get(p.sscc) ?? []).map((s) => ({
          id: s.id,
          scanType: s.scanType,
          scanLocation: s.scanLocation,
          scannedByGtid: s.scannedByGtid,
          createdAt: s.createdAt,
        })),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "LIST_FAILED", detail: message }, { status: 500 });
  }
}

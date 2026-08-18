// GET /api/sgtx/demurrage/[ustn] — Get demurrage calculation(s) for a USTN
//
// Returns the latest DemurrageTracking row(s) for the given USTN, plus a
// fresh live calculation (using calculateDemurrage) so the caller sees the
// current status even if lastCalculated is stale.
//
// Query params:
//   ?containerNumber=CONT1234567  (optional — filter to a single container)
//
// Response:
//   { ustn, tracking: [...], count }
//
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { calculateDemurrage, type DemurrageCalculation } from "@/lib/sgtx/demurrage";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ustn: string }> },
) {
  try {
    const { ustn } = await params;
    if (!ustn) {
      return NextResponse.json({ error: "Missing ustn path parameter" }, { status: 400 });
    }

    const url = new URL(req.url);
    const containerNumber = url.searchParams.get("containerNumber");

    // Load tracking rows from DB
    const where: any = { ustn };
    if (containerNumber) where.containerNumber = containerNumber;

    const trackingRows = await (db as any).demurrageTracking.findMany({
      where,
      orderBy: { lastCalculated: "desc" },
      take: 100,
    });

    // Attach a fresh live calculation to each row (using current Date.now).
    const tracking: any[] = [];
    for (const row of trackingRows) {
      let liveCalc: DemurrageCalculation | null = null;
      try {
        const carrierTariff = await loadCarrierTariff(row.carrierGtid, row.portUnlocode, row.containerType);
        liveCalc = calculateDemurrage({
          containerType: row.containerType,
          carrier: row.carrierGtid || "(unknown)",
          port: row.portUnlocode,
          releaseDate: row.releaseDate,
          gateOutDate: row.gateOutDate || undefined,
          freeTimeDays: row.freeTimeDays,
          carrierTariff: carrierTariff || undefined,
        });
      } catch (e: any) {
        logger.warn("[demurrage/[ustn]] live calc failed", { id: row.id, error: e?.message });
      }
      tracking.push({
        ...row,
        demurrageBreakdown: row.demurrageBreakdown ? safeParse(row.demurrageBreakdown) : null,
        liveCalculation: liveCalc,
      });
    }

    return NextResponse.json({ ustn, tracking, count: tracking.length });
  } catch (e: any) {
    logger.error("[demurrage/[ustn]] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

// ── helpers ──────────────────────────────────────────────────────────────

async function loadCarrierTariff(
  carrierGtid: string | null,
  portUnlocode: string,
  containerType: string,
): Promise<{ demurrageRates: Record<string, number>; detentionRates: Record<string, number> } | null> {
  if (!carrierGtid) return null;
  try {
    const tariff = await (db as any).carrierDemurrageTariff.findFirst({
      where: { carrierGtid, portUnlocode, containerType, isActive: true },
      orderBy: { validFrom: "desc" },
    });
    if (!tariff) return null;
    return {
      demurrageRates: safeParse(tariff.demurrageRates) || {},
      detentionRates: safeParse(tariff.detentionRates) || {},
    };
  } catch (e: any) {
    logger.warn("[demurrage/[ustn]] carrier tariff load failed", { error: e?.message });
    return null;
  }
}

function safeParse(s: string | null): any {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

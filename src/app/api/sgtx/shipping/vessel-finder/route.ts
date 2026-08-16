// GET /api/sgtx/shipping/vessel-finder?minLat&maxLat&minLng&maxLng&type=1
//
// Best-effort fetch from Vessel Finder's public clickmap endpoint.
// Returns `{ vessels: [] }` if rate-limited or 403.
import { NextRequest, NextResponse } from "next/server";
import { fetchVesselFinderShipList } from "@/lib/sgtx/shipping/vessel-finder-client";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const minLatStr = searchParams.get("minLat");
    const maxLatStr = searchParams.get("maxLat");
    const minLngStr = searchParams.get("minLng");
    const maxLngStr = searchParams.get("maxLng");
    const typeStr = searchParams.get("type");
    if (!minLatStr || !maxLatStr || !minLngStr || !maxLngStr) {
      return NextResponse.json(
        { error: "Required: ?minLat&maxLat&minLng&maxLng[&type=0]" },
        { status: 400 },
      );
    }
    const minLat = parseFloat(minLatStr);
    const maxLat = parseFloat(maxLatStr);
    const minLng = parseFloat(minLngStr);
    const maxLng = parseFloat(maxLngStr);
    if (![minLat, maxLat, minLng, maxLng].every(Number.isFinite)) {
      return NextResponse.json({ error: "coords must be numbers" }, { status: 400 });
    }
    const shipType = typeStr ? parseInt(typeStr, 10) : undefined;
    const vessels = await fetchVesselFinderShipList({
      minLat,
      maxLat,
      minLng,
      maxLng,
      shipType,
    });
    return NextResponse.json({ ok: true, count: vessels.length, vessels });
  } catch (e: any) {
    logger.error("vessel-finder GET failed", { error: e?.message ?? String(e) });
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}

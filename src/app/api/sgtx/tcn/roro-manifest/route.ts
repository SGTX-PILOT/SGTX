import { NextRequest, NextResponse } from "next/server";
import { createManifest, getManifest, listManifests } from "@/lib/sgtx/tcn/roro-manifest";
import { featureGateResponse } from "@/lib/sgtx/platform/feature-check";

/**
 * GET /api/sgtx/tcn/roro-manifest?ustn=<USTN>
 *    Returns the manifest for a given USTN (with all items).
 *
 * GET /api/sgtx/tcn/roro-manifest?corridor=<CODE>
 *    Returns all manifests for a corridor (list view).
 *
 * POST /api/sgtx/tcn/roro-manifest
 *    Body: { ustn, corridorCode?, scheduleId?, bookingRef?, shipperGtid?, items: [{ itemType, licensePlate?, driverName?, ... }] }
 *    Creates (or updates if exists for USTN) a RoRo manifest with cargo items.
 */
export async function GET(req: NextRequest) {
  const gate = await featureGateResponse("roro_corridors");
  if (gate) return gate;

  try {
    const ustn = req.nextUrl.searchParams.get("ustn");
    const corridor = req.nextUrl.searchParams.get("corridor");
    const shipper = req.nextUrl.searchParams.get("shipper");
    const status = req.nextUrl.searchParams.get("status");
    if (ustn) {
      const manifest = await getManifest(ustn);
      if (!manifest) return NextResponse.json({ error: "Manifest not found" }, { status: 404 });
      return NextResponse.json({ ok: true, manifest });
    }
    const manifests = await listManifests({
      corridorCode: corridor || undefined,
      shipperGtid: shipper || undefined,
      status: status || undefined,
    });
    return NextResponse.json({ ok: true, manifests, total: manifests.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await featureGateResponse("roro_corridors");
  if (gate) return gate;

  try {
    const body = await req.json().catch(() => ({}));
    const { ustn, corridorCode, scheduleId, bookingRef, shipperGtid, items } = body as {
      ustn?: string;
      corridorCode?: string;
      scheduleId?: string;
      bookingRef?: string;
      shipperGtid?: string;
      items?: any[];
    };
    if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "items (non-empty array) required" }, { status: 400 });
    }
    const manifest = await createManifest({ ustn, corridorCode, scheduleId, bookingRef, shipperGtid, items });
    return NextResponse.json({ ok: true, manifest });
  } catch (e: any) {
    const status = /not found|cannot modify|already performed|must be performed/i.test(e.message) ? 400 : 500;
    return NextResponse.json({ error: e.message }, { status });
  }
}

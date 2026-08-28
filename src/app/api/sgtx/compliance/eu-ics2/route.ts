// @ts-nocheck
// POST /api/sgtx/compliance/eu-ics2
// Body: ENSData { transportMode, loadingPort, ..., carrier, consignor, consignee, goodsItems, ... }
//
// Generates an EU ICS2 Entry Summary Declaration (ENS) XML payload in the
// correct EU CCN-CSI format. Returns the ENS number, XML, and submission
// instructions (no public ICS2 API — submit via Member State customs system).
import { NextRequest, NextResponse } from "next/server";
import { submitENS, checkICS2Applicability } from "@/lib/sgtx/compliance/eu-ics2";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "ENS data body required" }, { status: 400 });
    }
    const result = await submitENS(body);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("eu-ics2 POST failed", { error: e?.message ?? String(e) });
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}

// GET /api/sgtx/compliance/eu-ics2?destination=DE&mode=AIR
// Returns whether ICS2 applies + the filing deadline for that lane.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const destination = (searchParams.get("destination") ?? "").trim().toUpperCase();
    const mode = (searchParams.get("mode") ?? "").trim().toUpperCase() as any;
    if (!destination || !mode) {
      return NextResponse.json(
        { ok: false, error: "Required: ?destination=ISO2&mode=AIR|SEA|ROAD|RAIL" },
        { status: 400 },
      );
    }
    const result = checkICS2Applicability(destination, mode);
    return NextResponse.json({ ok: true, destination, mode, ...result });
  } catch (e: any) {
    logger.error("eu-ics2 GET failed", { error: e?.message ?? String(e) });
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}

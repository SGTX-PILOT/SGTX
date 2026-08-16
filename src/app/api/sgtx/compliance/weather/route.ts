// GET /api/sgtx/compliance/weather?lat=X&lng=Y[&portUnlocode=EGALY]
//
// Fetches current weather from Open-Meteo (live, no DB persistence required).
// Falls back to the latest persisted snapshot if the live fetch fails.
import { NextRequest, NextResponse } from "next/server";
import { getPortWeather, getLatestPortWeather } from "@/lib/sgtx/compliance/weather-client";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const latStr = searchParams.get("lat");
    const lngStr = searchParams.get("lng");
    const portUnlocode = searchParams.get("portUnlocode") ?? undefined;
    if (!latStr || !lngStr) {
      return NextResponse.json(
        { error: "Required: ?lat=X&lng=Y[&portUnlocode=CODE]" },
        { status: 400 },
      );
    }
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: "lat/lng must be numbers" }, { status: 400 });
    }
    const live = await getPortWeather(lat, lng, portUnlocode);
    if (live) {
      return NextResponse.json({ ok: true, ...live, cached: false });
    }
    // Fallback to persisted snapshot if available.
    if (portUnlocode) {
      const cached = await getLatestPortWeather(portUnlocode);
      if (cached) {
        return NextResponse.json({ ok: true, ...cached, cached: true });
      }
    }
    return NextResponse.json({ ok: false, error: "weather fetch failed" }, { status: 502 });
  } catch (e: any) {
    logger.error("weather GET failed", { error: e?.message ?? String(e) });
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}

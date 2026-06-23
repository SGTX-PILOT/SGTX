import { NextRequest, NextResponse } from "next/server";
import { trackVessel, getAllVessels, searchVessel } from "@/lib/sgtx/ai/vessel-tracking";

// POST /api/sgtx/ai/vessel-tracking — AI vessel tracking with ETA prediction + late/early notifications
// Body: { vessel_name, origin_port?, destination_port?, scheduled_arrival_days?, days_since_departure?, cargo_value_usd?, ustn? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const vesselName = (body?.vessel_name || body?.vesselName || "").toString().trim();
    const originPort = body?.origin_port || body?.originPort;
    const destinationPort = body?.destination_port || body?.destinationPort;
    const scheduledArrivalDays = body?.scheduled_arrival_days || body?.scheduledArrivalDays;
    const daysSinceDeparture = body?.days_since_departure || body?.daysSinceDeparture;
    const cargoValueUsd = body?.cargo_value_usd || body?.cargoValueUsd;
    const ustn = body?.ustn;

    if (!vesselName) {
      return NextResponse.json({ error: "vessel_name required" }, { status: 400 });
    }

    const result = await trackVessel({
      vesselName, originPort, destinationPort, scheduledArrivalDays, daysSinceDeparture, cargoValueUsd, ustn,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET /api/sgtx/ai/vessel-tracking?vessels=true (list all known vessels)
// GET /api/sgtx/ai/vessel-tracking?search=maersk (search vessel DB)
// GET /api/sgtx/ai/vessel-tracking?vessel=MAERSK+ESSEX&origin=CNSHA&dest=DEHAM (quick DB lookup, no AI)
export async function GET(req: NextRequest) {
  const vessels = req.nextUrl.searchParams.get("vessels");
  const search = req.nextUrl.searchParams.get("search");

  if (vessels === "true") {
    return NextResponse.json({ ok: true, total: getAllVessels().length, vessels: getAllVessels() });
  }
  if (search) {
    const q = search.toUpperCase();
    const matches = getAllVessels().filter((v) => v.name.includes(q) || v.carrier.includes(q));
    return NextResponse.json({ ok: true, query: search, matches });
  }

  const vesselName = req.nextUrl.searchParams.get("vessel") || "";
  if (vesselName) {
    const vesselInfo = searchVessel(vesselName);
    return NextResponse.json({ ok: true, vessel: vesselInfo, note: "Use POST for full tracking + AI prediction" });
  }

  return NextResponse.json({
    ok: true,
    total_vessels: getAllVessels().length,
    note: "Pass ?vessels=true for all, ?search=maersk for search, or POST { vessel_name, origin_port, destination_port } for full tracking",
  });
}

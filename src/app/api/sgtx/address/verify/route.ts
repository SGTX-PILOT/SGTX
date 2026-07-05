// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { verifyAddressMapbox, reverseGeocodeMapbox, getTradeRoute } from "@/lib/sgtx/geo/mapbox";

// POST /api/sgtx/address/verify — Free worldwide address verification
// Uses Mapbox Geocoding API (primary) + OpenStreetMap Nominatim (fallback)
// 100% free, no billing ever needed

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Reverse geocoding mode
    if (typeof body.lat === "number" && typeof body.lon === "number") {
      const result = await reverseGeocodeMapbox(body.lat, body.lon);
      return NextResponse.json({ ok: true, ...result });
    }

    // Trade route mode
    if (body.origin && body.destination) {
      const result = await getTradeRoute(body.origin, body.destination);
      return NextResponse.json({ ok: true, ...result });
    }

    // Forward geocoding / address verification mode
    const { street, houseNumber, city, state, postalCode, country } = body;

    if (!street && !city && !postalCode) {
      return NextResponse.json(
        { error: "At least one of street, city, or postalCode is required" },
        { status: 400 }
      );
    }

    const result = await verifyAddressMapbox({
      street: houseNumber && street ? `${houseNumber} ${street}` : street,
      city,
      state,
      postalCode,
      country,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;

    // Reverse geocoding
    const lat = sp.get("lat");
    const lon = sp.get("lon");
    if (lat && lon) {
      const result = await reverseGeocodeMapbox(parseFloat(lat), parseFloat(lon));
      return NextResponse.json({ ok: true, ...result });
    }

    // Trade route
    const origin = sp.get("origin");
    const destination = sp.get("destination");
    if (origin && destination) {
      const result = await getTradeRoute(origin, destination);
      return NextResponse.json({ ok: true, ...result });
    }

    const street = sp.get("street") || undefined;
    const city = sp.get("city") || undefined;
    const state = sp.get("state") || undefined;
    const postalCode = sp.get("postalCode") || undefined;
    const country = sp.get("country") || undefined;

    if (!street && !city && !postalCode) {
      return NextResponse.json(
        { error: "At least one of street, city, or postalCode is required" },
        { status: 400 }
      );
    }

    const result = await verifyAddressMapbox({ street, city, state, postalCode, country });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

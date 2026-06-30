import { NextRequest, NextResponse } from "next/server";
import { verifyAddress, reverseGeocode } from "@/lib/sgtx/onboarding/address-verify";

// POST /api/sgtx/address/verify — Free worldwide address verification
// Uses OpenStreetMap Nominatim API (100% free, no API key, no billing ever needed)
//
// Body: {
//   street?: string,
//   houseNumber?: string,
//   city?: string,
//   state?: string,
//   postalCode?: string,
//   country?: string  // ISO 3166-1 alpha-2
// }
//
// OR for reverse geocoding:
// Body: { lat: number, lon: number }
//
// Returns: {
//   verified: boolean,
//   confidence: number (0-1),
//   formatted: string,
//   components: { ... },
//   coordinates?: { lat, lon },
//   source: "nominatim" | "postal" | "none",
//   matches: [{ field, input, verified, match }]
// }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Reverse geocoding mode
    if (typeof body.lat === "number" && typeof body.lon === "number") {
      const result = await reverseGeocode(body.lat, body.lon);
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

    const result = await verifyAddress({
      street,
      houseNumber,
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

// GET /api/sgtx/address/verify?street=...&city=...&country=...
// Same as POST but via query params (for simple lookups)
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;

    // Reverse geocoding via query params
    const lat = sp.get("lat");
    const lon = sp.get("lon");
    if (lat && lon) {
      const result = await reverseGeocode(parseFloat(lat), parseFloat(lon));
      return NextResponse.json({ ok: true, ...result });
    }

    const street = sp.get("street") || undefined;
    const houseNumber = sp.get("houseNumber") || undefined;
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

    const result = await verifyAddress({ street, houseNumber, city, state, postalCode, country });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

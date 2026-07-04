import { NextRequest, NextResponse } from "next/server";
import { SHIPPING_LINES, getAllCountries, getShippingLinesByCountry, getPortsByCountry } from "@/lib/sgtx/shipping/shipping-lines-db";

// GET /api/sgtx/shipping-lines/countries — list all countries with ports + line counts
// GET /api/sgtx/shipping-lines/countries?country=EG — get ports + shipping lines for a specific country
export async function GET(req: NextRequest) {
  try {
    const country = req.nextUrl.searchParams.get("country");
    if (country) {
      const lines = getShippingLinesByCountry(country);
      const ports = getPortsByCountry(country);
      if (lines.length === 0 && ports.length === 0) {
        return NextResponse.json({ error: `Country ${country} not found in shipping database` }, { status: 404 });
      }
      return NextResponse.json({ ok: true, countryCode: country.toUpperCase(), ports, lines, lineCount: lines.length });
    }
    // Return all countries
    const countries = getAllCountries();
    return NextResponse.json({ ok: true, countries, totalCountries: countries.length, totalLines: SHIPPING_LINES.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

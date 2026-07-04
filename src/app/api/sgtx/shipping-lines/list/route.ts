import { NextRequest, NextResponse } from "next/server";
import { SHIPPING_LINES, getShippingLineByCode } from "@/lib/sgtx/shipping/shipping-lines-db";

// GET /api/sgtx/shipping-lines/list — list all shipping lines
// GET /api/sgtx/shipping-lines/list?country=EG — filter by country served
export async function GET(req: NextRequest) {
  try {
    const country = req.nextUrl.searchParams.get("country");
    if (country) {
      const { getShippingLinesByCountry } = await import("@/lib/sgtx/shipping/shipping-lines-db");
      const lines = getShippingLinesByCountry(country);
      return NextResponse.json({ ok: true, country: country.toUpperCase(), lines, count: lines.length });
    }
    return NextResponse.json({ ok: true, lines: SHIPPING_LINES, count: SHIPPING_LINES.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

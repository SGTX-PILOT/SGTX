import { NextRequest, NextResponse } from "next/server";
import { calculateCustomsPricing, VAT_RATES, COUNTRY_FEES } from "@/lib/sgtx/ai/customs-pricing";

// POST /api/sgtx/ai/customs-pricing — AI customs pricing for port of discharge (buyer reference)
// Body: { destination_port, commodity, hs_code, cargo_value_usd, origin_country?, incoterm?, weight? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const destinationPort = (body?.destination_port || body?.destinationPort || "").toString().toUpperCase();
    const commodity = (body?.commodity || "").toString().trim();
    const hsCode = (body?.hs_code || body?.hsCode || "").toString().trim();
    const cargoValueUsd = parseFloat(body?.cargo_value_usd || body?.cargoValueUsd || 0);
    const originCountry = body?.origin_country || body?.originCountry;
    const incoterm = body?.incoterm;
    const weight = parseFloat(body?.weight || 0);

    if (!destinationPort || !hsCode || !cargoValueUsd) {
      return NextResponse.json({ error: "destination_port, hs_code, and cargo_value_usd required" }, { status: 400 });
    }

    const result = await calculateCustomsPricing({
      destinationPort, commodity: commodity || "general goods", hsCode, cargoValueUsd, originCountry, incoterm, weight,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET /api/sgtx/ai/customs-pricing?countries=true (list supported countries + rates)
export async function GET(req: NextRequest) {
  const countries = req.nextUrl.searchParams.get("countries");
  if (countries === "true") {
    return NextResponse.json({
      ok: true,
      vat_rates: Object.entries(VAT_RATES).map(([code, info]) => ({ code, rate: (info as { rate: number; name: string }).rate, name: (info as { rate: number; name: string }).name })),
      country_fees: Object.entries(COUNTRY_FEES).map(([code, fees]) => ({ code, ...(fees as { processing: number; broker: number; portHandling: number; inspection: number; quarantine: number }) })),
    });
  }
  return NextResponse.json({ ok: true, note: "POST with { destination_port, commodity, hs_code, cargo_value_usd } for AI customs calculation" });
}

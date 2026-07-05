// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const from = (sp.get("from") || "USD").toUpperCase();
    const to = (sp.get("to") || "EGP").toUpperCase();
    const amount = parseFloat(sp.get("amount") || "1");

    // Try open.er-api.com (free, no key)
    try {
      const url = `https://open.er-api.com/v6/latest/${from}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (response.ok) {
        const data = await response.json();
        const rate = data.rates?.[to];
        if (rate) {
          return NextResponse.json({
            ok: true, from, to, rate, amount, converted: amount * rate,
            source: "open.er-api.com", timestamp: data.time_last_update_utc || new Date().toISOString(),
          });
        }
      }
    } catch { /* fall through to static */ }

    // Fallback to static rates
    const STATIC_RATES: Record<string, number> = {
      "USD-EGP": 48.5, "EGP-USD": 0.0206,
      "USD-EUR": 0.92, "EUR-USD": 1.087,
      "USD-GBP": 0.79, "GBP-USD": 1.266,
      "USD-AED": 3.67, "AED-USD": 0.272,
      "USD-SAR": 3.75, "SAR-USD": 0.267,
      "USD-CNY": 7.24, "CNY-USD": 0.138,
      "USD-INR": 83.5, "INR-USD": 0.012,
      "USD-VND": 25400, "VND-USD": 0.000039,
    };
    const key = `${from}-${to}`;
    const rate = STATIC_RATES[key] || 1;
    return NextResponse.json({
      ok: true, from, to, rate, amount, converted: amount * rate,
      source: "static", timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

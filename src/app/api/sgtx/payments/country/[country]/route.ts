// @ts-nocheck
import { NextResponse } from "next/server";
import { getCountryProfile, COUNTRY_PAYMENT_PROFILES } from "@/lib/sgtx/payments/country-payment-profiles";

// GET /api/sgtx/payments/country/:country — payment rails + open banking + crypto + FX
// GET /api/sgtx/payments — list all countries (when no country specified)

export async function GET(
  req: Request,
  { params }: { params: Promise<{ country: string }> }
) {
  const { country } = await params;

  // List mode: /api/sgtx/payments/country/all (or "list")
  if (country.toLowerCase() === "all" || country.toLowerCase() === "list") {
    return NextResponse.json({
      ok: true,
      count: COUNTRY_PAYMENT_PROFILES.length,
      countries: COUNTRY_PAYMENT_PROFILES,
    });
  }

  const profile = getCountryProfile(country);
  if (!profile) {
    return NextResponse.json(
      { ok: false, error: `Country '${country}' not in registry`, available: COUNTRY_PAYMENT_PROFILES.map(c => c.code) },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, country: profile });
}

import { NextRequest, NextResponse } from "next/server";
import {
  COUNTRY_REGISTRATION_DATA,
  getCountryData,
  getCountryEntityTypes,
  getCountryRequiredDocuments,
  ALL_COUNTRY_CODES,
  TOTAL_COUNTRY_COUNT,
  EXPLICIT_COUNTRY_COUNT,
} from "@/lib/sgtx/onboarding/countries";

// GET /api/sgtx/countries
// Returns all supported countries with their company types and registration requirements.
// Query params:
//   ?code=EG — get details for a specific country
//   ?summary=1 — return just the summary (code + name)
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const code = sp.get("code");
    const summary = sp.get("summary");

    // Single country detail
    if (code) {
      const data = getCountryData(code.toUpperCase());
      if (!data) {
        return NextResponse.json({ error: "Country not found", code }, { status: 404 });
      }
      return NextResponse.json({
        ok: true,
        country: data,
        entityTypes: getCountryEntityTypes(code),
        requiredDocuments: getCountryRequiredDocuments(code),
      });
    }

    // Summary mode — just code + name
    if (summary === "1") {
      return NextResponse.json({
        ok: true,
        count: TOTAL_COUNTRY_COUNT,
        countries: ALL_COUNTRY_CODES,
      });
    }

    // Full list — all countries with entity types
    return NextResponse.json({
      ok: true,
      totalCountries: TOTAL_COUNTRY_COUNT,
      explicitCountries: EXPLICIT_COUNTRY_COUNT,
      countries: COUNTRY_REGISTRATION_DATA.map(c => ({
        code: c.code,
        name: c.name,
        currency: c.currency,
        dialCode: c.dialCode,
        entityTypes: c.entityTypes,
        requiredDocuments: c.requiredDocuments,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { searchPostalCodes, getPostalFormat, isValidPostalCode } from "@/lib/sgtx/onboarding/postal-bank-data";

// GET /api/sgtx/address/autocomplete?country=EG&query=ma
// Returns matching postal codes + cities for the given country.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const country = searchParams.get("country") || "";
  const query = searchParams.get("query") || "";
  const validate = searchParams.get("validate"); // if "1", just validate

  if (!country) {
    return NextResponse.json({ error: "country required" }, { status: 400 });
  }

  if (validate === "1") {
    const postal = searchParams.get("postal") || "";
    return NextResponse.json({
      country,
      postal,
      valid: isValidPostalCode(country, postal),
      format: getPostalFormat(country) || null,
    });
  }

  const results = searchPostalCodes(country, query);
  const fmt = getPostalFormat(country);
  return NextResponse.json({
    country,
    query,
    format: fmt ? { pattern: fmt.pattern, placeholder: fmt.placeholder } : null,
    results,
    count: results.length,
  });
}

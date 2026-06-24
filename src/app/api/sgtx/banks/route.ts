import { NextRequest, NextResponse } from "next/server";
import { getBanksForCountry, searchBanks, getBankBySwift, getIbanFormat } from "@/lib/sgtx/onboarding/postal-bank-data";

// GET /api/sgtx/banks?country=EG              → list all banks for country
// GET /api/sgtx/banks?country=EG&query=cairo  → search by name / city / swift
// GET /api/sgtx/banks?country=EG&swift=NBECEGCX → single bank by SWIFT
// GET /api/sgtx/banks?country=EG&iban=1       → IBAN format for country
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const country = searchParams.get("country") || "";
  const query = searchParams.get("query") || "";
  const swift = searchParams.get("swift") || "";
  const iban = searchParams.get("iban");

  if (!country) {
    return NextResponse.json({ error: "country required" }, { status: 400 });
  }

  if (iban === "1") {
    return NextResponse.json({
      country,
      ibanFormat: getIbanFormat(country) || null,
    });
  }

  if (swift) {
    const bank = getBankBySwift(country, swift);
    if (!bank) return NextResponse.json({ error: "Bank not found" }, { status: 404 });
    return NextResponse.json({ country, bank });
  }

  const results = query
    ? searchBanks(country, query)
    : getBanksForCountry(country);

  return NextResponse.json({
    country,
    query,
    count: results.length,
    banks: results,
  });
}

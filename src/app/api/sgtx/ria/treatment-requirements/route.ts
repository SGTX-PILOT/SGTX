import { NextRequest, NextResponse } from "next/server";
import { getTreatmentRequirements, checkSpecialProcedures } from "@/lib/sgtx/ria";

export async function GET(req: NextRequest) {
  const hsCode = req.nextUrl.searchParams.get("hsCode");
  const originCountry = req.nextUrl.searchParams.get("originCountry");
  const destCountry = req.nextUrl.searchParams.get("destCountry");
  const port = req.nextUrl.searchParams.get("port");
  if (!hsCode || !originCountry || !destCountry) {
    return NextResponse.json(
      { error: "hsCode, originCountry, destCountry required" },
      { status: 400 }
    );
  }
  const treatments = await getTreatmentRequirements(hsCode, originCountry, destCountry);
  // If a port is provided, also compute the warnings (special procedures).
  const warnings =
    port != null
      ? await checkSpecialProcedures(hsCode, originCountry, destCountry, port)
      : [];
  return NextResponse.json({
    hsCode,
    originCountry,
    destCountry,
    port,
    treatments,
    warnings,
  });
}

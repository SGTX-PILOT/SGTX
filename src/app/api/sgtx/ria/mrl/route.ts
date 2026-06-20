import { NextRequest, NextResponse } from "next/server";
import { getMrlRequirements } from "@/lib/sgtx/ria";

export async function GET(req: NextRequest) {
  const country = req.nextUrl.searchParams.get("country");
  const hsCode = req.nextUrl.searchParams.get("hsCode");
  if (!country || !hsCode) {
    return NextResponse.json({ error: "country, hsCode required" }, { status: 400 });
  }
  const mrls = await getMrlRequirements(country, hsCode);
  return NextResponse.json({ country, hsCode, mrls });
}

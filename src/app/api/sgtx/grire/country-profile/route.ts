import { NextRequest, NextResponse } from "next/server";
import { getCountryProfile, seedCountryProfiles } from "@/lib/sgtx/grire";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const countryCode = url.searchParams.get("country");
  if (!countryCode) {
    return NextResponse.json({ ok: false, error: "country parameter required (ISO 3166-1 alpha-2)" }, { status: 400 });
  }
  let profile = await getCountryProfile(countryCode);
  if (!profile) {
    await seedCountryProfiles();
    profile = await getCountryProfile(countryCode);
  }
  if (!profile) {
    return NextResponse.json({ ok: false, error: `No profile found for ${countryCode}. Country may not yet be discovered by GRiRE.` }, { status: 404 });
  }
  return NextResponse.json({ ok: true, profile });
}

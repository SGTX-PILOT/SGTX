import { NextRequest, NextResponse } from "next/server";
import { discoverCountryRegulations, seedCountryProfiles } from "@/lib/sgtx/grire";
import { logger } from "@/lib/sgtx/logger";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (process.env.CRON_SECRET && token !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const countryCode = body.countryCode;
    const result = await discoverCountryRegulations(countryCode);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("GRiRE discover failed", { error: e?.message });
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
export async function GET() {
  const seeded = await seedCountryProfiles();
  return NextResponse.json({ ok: true, message: `Seeded ${seeded} country profiles`, totalCountries: 20 });
}

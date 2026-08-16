// GET /api/sgtx/compliance/wits?reporter=EGY&partner=USA&hsCode=100190&year=2024
import { NextRequest, NextResponse } from "next/server";
import { queryWitsTariff } from "@/lib/sgtx/compliance/wits-client";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const reporter = searchParams.get("reporter") ?? "";
    const partner = searchParams.get("partner") ?? "000";
    const hsCode = searchParams.get("hsCode") ?? "";
    const yearStr = searchParams.get("year");
    const year = yearStr ? parseInt(yearStr, 10) : undefined;
    if (!reporter || !hsCode) {
      return NextResponse.json(
        { error: "Required: ?reporter=ISO3&hsCode=HS&[partner=ISO3|000]&[year=YYYY]" },
        { status: 400 },
      );
    }
    const result = await queryWitsTariff(reporter, partner, hsCode, year);
    const { ok, ...rest } = result;
    return NextResponse.json({ ok, ...rest });
  } catch (e: any) {
    logger.error("wits GET failed", { error: e?.message ?? String(e) });
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}

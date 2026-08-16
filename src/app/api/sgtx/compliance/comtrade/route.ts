// GET /api/sgtx/compliance/comtrade?reporter=EGY&partner=USA&hsCode=1001&flow=imports&year=2024
import { NextRequest, NextResponse } from "next/server";
import { queryComtrade } from "@/lib/sgtx/compliance/comtrade-client";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const reporter = searchParams.get("reporter") ?? "";
    const partner = searchParams.get("partner") ?? "ALL";
    const hsCode = searchParams.get("hsCode") ?? "AG2";
    const flow = (searchParams.get("flow") === "exports" ? "exports" : "imports") as
      | "imports"
      | "exports";
    const yearStr = searchParams.get("year");
    const year = yearStr ? parseInt(yearStr, 10) : undefined;
    if (!reporter) {
      return NextResponse.json(
        { error: "Required: ?reporter=ISO3&partner=ISO3&hsCode=HS&[flow=imports|exports]&[year=YYYY]" },
        { status: 400 },
      );
    }
    const result = await queryComtrade(reporter, partner, hsCode, { flow, year });
    const { ok, ...rest } = result;
    return NextResponse.json({ ok, ...rest });
  } catch (e: any) {
    logger.error("comtrade GET failed", { error: e?.message ?? String(e) });
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}

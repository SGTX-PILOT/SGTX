// GET /api/sgtx/compliance/worldbank-prices/latest?commodity=wheat
import { NextRequest, NextResponse } from "next/server";
import { getLatestCommodityPrice } from "@/lib/sgtx/compliance/worldbank-prices-sync";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const commodity = searchParams.get("commodity") ?? "";
    if (!commodity) {
      return NextResponse.json(
        { error: "Required: ?commodity=NAME" },
        { status: 400 },
      );
    }
    const result = await getLatestCommodityPrice(commodity);
    return NextResponse.json({ ok: true, commodity, result });
  } catch (e: any) {
    logger.error("worldbank-prices latest GET failed", { error: e?.message ?? String(e) });
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}

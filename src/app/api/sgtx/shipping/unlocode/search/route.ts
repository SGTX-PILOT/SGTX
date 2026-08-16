// GET /api/sgtx/shipping/unlocode/search?country=EG            — by country
// GET /api/sgtx/shipping/unlocode/search?q=Alex                — by name prefix
import { NextRequest, NextResponse } from "next/server";
import { searchUnlocodeByCountry, searchUnlocodeByName } from "@/lib/sgtx/shipping/unlocode-sync";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const country = searchParams.get("country");
    const q = searchParams.get("q");
    const limitStr = searchParams.get("limit");
    const limit = limitStr ? Math.min(parseInt(limitStr, 10) || 50, 200) : 50;
    if (country) {
      const rows = await searchUnlocodeByCountry(country, limit);
      return NextResponse.json({ ok: true, count: rows.length, rows });
    }
    if (q) {
      const rows = await searchUnlocodeByName(q, limit);
      return NextResponse.json({ ok: true, count: rows.length, rows });
    }
    return NextResponse.json(
      { error: "Required: ?country=CC or ?q=NAMEPREFIX" },
      { status: 400 },
    );
  } catch (e: any) {
    logger.error("unlocode search GET failed", { error: e?.message ?? String(e) });
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}

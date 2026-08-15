// GET /api/sgtx/compliance/gdelt?query=QUERY
// GET /api/sgtx/compliance/gdelt?category=port_closure
//
// Search GDELT news. Either a free-text `query` or a `category` from the
// curated templates (port_closure, war, earthquake, pandemic, cyclone,
// civil_unrest, sanctions_expansion, coup).
import { NextRequest, NextResponse } from "next/server";
import { searchGdelt, searchForceMajeureEvents, FORCE_MAJEURE_QUERY_TEMPLATES } from "@/lib/sgtx/compliance/gdelt-client";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("query") ?? "";
    const category = searchParams.get("category");
    const maxRecordsStr = searchParams.get("maxRecords");
    const country = searchParams.get("country") ?? undefined;
    const maxRecords = maxRecordsStr ? parseInt(maxRecordsStr, 10) : undefined;

    if (!query && !category) {
      return NextResponse.json(
        {
          error: "Required: ?query=TEXT or ?category=CATEGORY",
          categories: Object.keys(FORCE_MAJEURE_QUERY_TEMPLATES),
        },
        { status: 400 },
      );
    }

    let result;
    if (category) {
      result = await searchForceMajeureEvents(category, {
        maxRecords,
        country,
      });
    } else {
      result = await searchGdelt(query, { maxRecords });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("gdelt GET failed", { error: e?.message ?? String(e) });
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}

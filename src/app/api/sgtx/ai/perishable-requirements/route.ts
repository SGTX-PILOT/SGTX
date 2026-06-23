import { NextRequest, NextResponse } from "next/server";
import { getPerishableRequirements, PERISHABLE_DB, getAllCategories, getAllCommodities, searchPerishableDB } from "@/lib/sgtx/ai/perishable-requirements";

// POST /api/sgtx/ai/perishable-requirements — get temperature/humidity/air circulation for fruits & vegetables
// Body: { commodity, hs_code? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const commodity = (body?.commodity || "").toString().trim();
    const hsCode = body?.hs_code || body?.hsCode;

    if (!commodity && !hsCode) {
      return NextResponse.json({ error: "commodity or hs_code required" }, { status: 400 });
    }

    const result = await getPerishableRequirements({ commodity: commodity || "unknown", hsCode });
    return NextResponse.json({ ok: true, requirement: result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET /api/sgtx/ai/perishable-requirements?commodity=strawberries
// GET /api/sgtx/ai/perishable-requirements?categories=true
// GET /api/sgtx/ai/perishable-requirements?list=true (list all commodities in DB)
// GET /api/sgtx/ai/perishable-requirements?hs_code=0811.10
export async function GET(req: NextRequest) {
  const categories = req.nextUrl.searchParams.get("categories");
  const list = req.nextUrl.searchParams.get("list");
  if (categories === "true") {
    return NextResponse.json({ ok: true, categories: getAllCategories() });
  }
  if (list === "true") {
    return NextResponse.json({ ok: true, total: PERISHABLE_DB.length, commodities: getAllCommodities() });
  }

  const commodity = req.nextUrl.searchParams.get("commodity") || "";
  const hsCode = req.nextUrl.searchParams.get("hs_code") || undefined;

  if (!commodity && !hsCode) {
    return NextResponse.json({
      ok: true,
      total_in_db: PERISHABLE_DB.length,
      categories: getAllCategories(),
      note: "Pass ?commodity=strawberries or ?hs_code=0811.10 for lookup, ?list=true for all, ?categories=true for categories",
    });
  }

  // DB-only quick lookup (no AI)
  const dbMatch = searchPerishableDB(commodity, hsCode);
  if (dbMatch) {
    return NextResponse.json({ ok: true, requirement: dbMatch, source: "database" });
  }
  return NextResponse.json({ ok: false, note: "Not in DB — use POST for AI estimation" });
}

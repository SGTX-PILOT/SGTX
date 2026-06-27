import { NextRequest, NextResponse } from "next/server";
import { searchCompanyByRegistry } from "@/lib/sgtx/onboarding/open-registry";

// GET /api/sgtx/onboarding/search-registry?query=...&jurisdiction=DE&limit=10
// Type-ahead autocomplete backed by GLEIF autocomplete search.
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const query = sp.get("query") || sp.get("q") || "";
    const jurisdiction = sp.get("jurisdiction") || sp.get("country") || undefined;
    const limitRaw = parseInt(sp.get("limit") || "10", 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 25) : 10;

    if (query.trim().length < 2) {
      return NextResponse.json({ ok: true, hits: [] });
    }

    const hits = await searchCompanyByRegistry(query, jurisdiction, limit);
    return NextResponse.json({ ok: true, hits });
  } catch (e: any) {
    console.error("[search-registry] error:", e);
    return NextResponse.json({ ok: false, hits: [], error: e?.message || "Search failed" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { HS_CODE_DATABASE, getAllChapters, getAllCategories } from "@/lib/sgtx/ai/hs-code-database";

// POST /api/sgtx/ai/hs-code/search — search the comprehensive HS code database (1900+ codes)
// Body: { query: string, limit?: number, chapter?: number, section?: number, category?: string }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const query = (body?.query || "").toString().toLowerCase().trim();
    const limit = Math.min(Math.max(parseInt(body?.limit) || 20, 1), 200);
    const chapter = body?.chapter ? parseInt(body.chapter) : undefined;
    const section = body?.section ? parseInt(body.section) : undefined;
    const category = body?.category ? String(body.category) : undefined;

    if (!query && !chapter && !section && !category) {
      return NextResponse.json({
        ok: true,
        results: [],
        total_in_database: HS_CODE_DATABASE.length,
        chapters: getAllChapters(),
        categories: getAllCategories(),
      });
    }

    let results = HS_CODE_DATABASE;

    // Filter by chapter/section/category first
    if (chapter) results = results.filter((e) => e.chapter === chapter);
    if (section) results = results.filter((e) => e.section === section);
    if (category) results = results.filter((e) => e.category === category);

    // Fuzzy search by query
    if (query) {
      results = results
        .map((e) => {
          let score = 0;
          const desc = e.description.toLowerCase();
          const hs = e.hs.toLowerCase();
          // Exact HS code match
          if (hs === query || hs.startsWith(query)) score += 100;
          // Description contains query
          if (desc.includes(query)) score += 50;
          // Keyword match
          for (const kw of e.keywords) {
            if (kw.toLowerCase() === query) score += 80;
            else if (kw.toLowerCase().includes(query)) score += 30;
            else if (query.includes(kw.toLowerCase())) score += 20;
          }
          // Word-level matches
          const queryWords = query.split(/\s+/).filter((w) => w.length > 2);
          for (const w of queryWords) {
            if (desc.includes(w)) score += 10;
            for (const kw of e.keywords) {
              if (kw.toLowerCase().includes(w)) score += 5;
            }
          }
          return { entry: e, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((x) => x.entry);
    }

    return NextResponse.json({
      ok: true,
      results: results.slice(0, limit),
      total: results.length,
      total_in_database: HS_CODE_DATABASE.length,
      query,
      chapters: getAllChapters(),
      categories: getAllCategories(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET /api/sgtx/ai/hs-code/search?query=frozen+strawberries&limit=10
export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("query") || "";
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "20");
  const chapter = req.nextUrl.searchParams.get("chapter");
  const section = req.nextUrl.searchParams.get("section");
  const category = req.nextUrl.searchParams.get("category");
  return POST(new NextRequest(req.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit, chapter, section, category }),
  }));
}

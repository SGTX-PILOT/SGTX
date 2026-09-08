// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { searchArticles } from "@/lib/sgtx/help-center";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/sgtx/help-center/articles?q=X[&category=Y]
//   → { articles, categories, count }
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";
  const category = req.nextUrl.searchParams.get("category") || undefined;
  try {
    const { articles, categories } = searchArticles(q, category);
    return NextResponse.json({ articles, categories, count: articles.length });
  } catch (e: any) {
    logger.error("[api/help-center/articles] GET failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "fetch failed" }, { status: 500 });
  }
}

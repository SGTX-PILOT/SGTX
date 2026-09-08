// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { getArticleById } from "@/lib/sgtx/help-center";

export const dynamic = "force-dynamic";

// GET /api/sgtx/help-center/articles/[id] — single article detail.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "article id required" }, { status: 400 });
  const article = getArticleById(id);
  if (!article) return NextResponse.json({ error: "article not found" }, { status: 404 });
  return NextResponse.json({ article });
}

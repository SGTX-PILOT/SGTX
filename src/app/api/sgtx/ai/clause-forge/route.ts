import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clauseForge } from "@/lib/sgtx/ai/orchestrator";

// POST /api/sgtx/ai/clause-forge  { ustn: string, article: string }
export async function POST(req: NextRequest) {
  const { ustn, article } = await req.json();
  if (!ustn || !article) return NextResponse.json({ error: "ustn + article required" }, { status: 400 });

  const trade = await db.trade.findUnique({ where: { ustn }, include: { buyer: true, seller: true } });
  if (!trade) return NextResponse.json({ error: "trade not found" }, { status: 404 });

  const result = await clauseForge(article, trade);
  return NextResponse.json(result);
}

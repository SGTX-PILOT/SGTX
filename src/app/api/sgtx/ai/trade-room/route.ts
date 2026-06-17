import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tradeRoomAssistant } from "@/lib/sgtx/ai/orchestrator";

// POST /api/sgtx/ai/trade-room  { ustn: string, question: string }
export async function POST(req: NextRequest) {
  const { ustn, question } = await req.json();
  if (!ustn || !question) return NextResponse.json({ error: "ustn + question required" }, { status: 400 });

  const trade = await db.trade.findUnique({ where: { ustn }, include: { buyer: true, seller: true } });
  if (!trade) return NextResponse.json({ error: "trade not found" }, { status: 404 });

  const result = await tradeRoomAssistant(question, trade);
  return NextResponse.json(result);
}

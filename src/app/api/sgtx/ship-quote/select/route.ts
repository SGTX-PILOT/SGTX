import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/sgtx/ship-quote/select — select (confirm) or reject a ship quote.
//   Body: { quoteId, decision?: "CONFIRM" | "REJECT" }
//   - CONFIRM (default): marks the quote as selected (commitment recorded).
//   - REJECT: deselects the quote (withdraws the line's commitment).
//   (Part 9 gap-fix: previously only supported CONFIRM; SHIP portal needs both.)
export async function POST(req: NextRequest) {
  const { quoteId, decision } = await req.json();
  if (!quoteId) return NextResponse.json({ error: "quoteId required" }, { status: 400 });

  const selected = decision !== "REJECT";
  await db.shipQuote.update({ where: { id: quoteId }, data: { selected } });
  return NextResponse.json({ success: true, selected });
}

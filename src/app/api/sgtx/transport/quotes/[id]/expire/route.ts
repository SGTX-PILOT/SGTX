// @ts-nocheck
// §3 Logistics Quote V2 — expire a quote (typically after validUntil has passed).
// POST /api/sgtx/transport/quotes/[id]/expire
import { NextResponse } from "next/server";
import { getQuote, getQuoteByQuoteId, expireQuote } from "@/lib/sgtx/logistics-quote-v2";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    let row = await getQuote(id);
    if (!row) row = await getQuoteByQuoteId(id);
    if (!row) {
      return NextResponse.json({ error: "quote not found" }, { status: 404 });
    }
    const result = await expireQuote(row.quoteId);
    if (result && result.ok === false) {
      return NextResponse.json(
        { error: result.error || "expireQuote failed", detail: result },
        { status: 400 },
      );
    }
    return NextResponse.json({ quote: result });
  } catch (err: any) {
    logger.error("[api/transport/quotes/[id]/expire] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

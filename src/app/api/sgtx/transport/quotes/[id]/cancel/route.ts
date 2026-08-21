// @ts-nocheck
// §3 Logistics Quote V2 — cancel a quote.
// POST /api/sgtx/transport/quotes/[id]/cancel  body: { reason }
import { NextResponse } from "next/server";
import { getQuote, getQuoteByQuoteId, cancelQuote } from "@/lib/sgtx/logistics-quote-v2";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const body = await req.json();
    if (!body?.reason) {
      return NextResponse.json(
        { error: "reason required" },
        { status: 400 },
      );
    }
    let row = await getQuote(id);
    if (!row) row = await getQuoteByQuoteId(id);
    if (!row) {
      return NextResponse.json({ error: "quote not found" }, { status: 404 });
    }
    const result = await cancelQuote(row.quoteId, body.reason);
    if (result && result.ok === false) {
      return NextResponse.json(
        { error: result.error || "cancelQuote failed", detail: result },
        { status: 400 },
      );
    }
    return NextResponse.json({ quote: result });
  } catch (err: any) {
    logger.error("[api/transport/quotes/[id]/cancel] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

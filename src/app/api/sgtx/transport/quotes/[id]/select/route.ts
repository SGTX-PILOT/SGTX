// @ts-nocheck
// §3 Logistics Quote V2 — trader EXPLICITLY selects a quote.
// POST /api/sgtx/transport/quotes/[id]/select  body: { selectedByGtid }
//
// NON-MARKETPLACE: there is no auto-select helper. The trader's GTID
// is recorded for audit trail.
import { NextResponse } from "next/server";
import { getQuote, getQuoteByQuoteId, selectQuote } from "@/lib/sgtx/logistics-quote-v2";
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
    if (!body?.selectedByGtid) {
      return NextResponse.json(
        { error: "selectedByGtid required" },
        { status: 400 },
      );
    }
    let row = await getQuote(id);
    if (!row) row = await getQuoteByQuoteId(id);
    if (!row) {
      return NextResponse.json({ error: "quote not found" }, { status: 404 });
    }
    const result = await selectQuote(row.quoteId, body.selectedByGtid);
    if (result && result.ok === false) {
      return NextResponse.json(
        { error: result.error || "selectQuote failed", detail: result },
        { status: 400 },
      );
    }
    return NextResponse.json({ quote: result });
  } catch (err: any) {
    logger.error("[api/transport/quotes/[id]/select] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// @ts-nocheck
// §3 Logistics Quote V2 — provider submits their quote response.
// POST /api/sgtx/transport/quotes/[id]/submit  body: ProviderQuoteResponse
//
// The [id] may be either the DB row id or the quoteId (LQ2-...). The
// handler resolves the actual quoteId before calling submitQuote.
import { NextResponse } from "next/server";
import { getQuote, getQuoteByQuoteId, submitQuote } from "@/lib/sgtx/logistics-quote-v2";
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
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    if (body.baseCost == null || isNaN(Number(body.baseCost))) {
      return NextResponse.json(
        { error: "baseCost (number) required" },
        { status: 400 },
      );
    }
    // Resolve the actual quoteId (LQ2-...) from either DB id or quoteId.
    let row = await getQuote(id);
    if (!row) row = await getQuoteByQuoteId(id);
    if (!row) {
      return NextResponse.json({ error: "quote not found" }, { status: 404 });
    }
    const result = await submitQuote(row.quoteId, body);
    if (result && result.ok === false) {
      return NextResponse.json(
        { error: result.error || "submitQuote failed", detail: result },
        { status: 400 },
      );
    }
    return NextResponse.json({ quote: result });
  } catch (err: any) {
    logger.error("[api/transport/quotes/[id]/submit] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// @ts-nocheck
// §3 Logistics Quote V2 — GET single quote by DB id or quoteId.
// GET /api/sgtx/transport/quotes/[id]
//
// The [id] path param may be either the DB row id (cuid) or the
// human-readable quoteId (LQ2-YYYYMMDD-NNNNN). The handler tries
// the DB id first, then falls back to the quoteId lookup.
import { NextResponse } from "next/server";
import { getQuote, getQuoteByQuoteId } from "@/lib/sgtx/logistics-quote-v2";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    let quote = await getQuote(id);
    if (!quote) {
      quote = await getQuoteByQuoteId(id);
    }
    if (!quote) {
      return NextResponse.json({ error: "quote not found" }, { status: 404 });
    }
    return NextResponse.json({ quote });
  } catch (err: any) {
    logger.error("[api/transport/quotes/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// @ts-nocheck
// §3 Logistics Quote V2 — GET single quote by quoteId (LQ2-YYYYMMDD-NNNNN).
// GET /api/sgtx/transport/quotes/by-quote-id/[quoteId]
import { NextResponse } from "next/server";
import { getQuoteByQuoteId } from "@/lib/sgtx/logistics-quote-v2";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ quoteId: string }> },
) {
  try {
    const { quoteId } = await params;
    if (!quoteId) {
      return NextResponse.json({ error: "quoteId required" }, { status: 400 });
    }
    const quote = await getQuoteByQuoteId(quoteId);
    if (!quote) {
      return NextResponse.json({ error: "quote not found" }, { status: 404 });
    }
    return NextResponse.json({ quote });
  } catch (err: any) {
    logger.error("[api/transport/quotes/by-quote-id/[quoteId]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

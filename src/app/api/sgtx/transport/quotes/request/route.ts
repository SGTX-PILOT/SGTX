// @ts-nocheck
// §3 Logistics Quote V2 — trader REQUESTS a quote (explicit provider
// selection — SGTX is non-marketplace, never broadcasts RFQs).
// POST /api/sgtx/transport/quotes/request  body: RequestQuoteInput
import { NextResponse } from "next/server";
import { requestQuote } from "@/lib/sgtx/logistics-quote-v2";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    if (!body.serviceType) {
      return NextResponse.json(
        { error: "serviceType required" },
        { status: 400 },
      );
    }
    if (!body.providerGtid) {
      return NextResponse.json(
        {
          error:
            "providerGtid required (SGTX is non-marketplace — explicit provider selection is required)",
        },
        { status: 400 },
      );
    }
    const quote = await requestQuote(body);
    if (quote && quote.ok === false) {
      return NextResponse.json(
        { error: quote.error || "requestQuote failed", detail: quote },
        { status: 400 },
      );
    }
    return NextResponse.json({ quote });
  } catch (err: any) {
    logger.error("[api/transport/quotes/request] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

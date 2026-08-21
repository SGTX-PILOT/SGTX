// @ts-nocheck
// §3 Logistics Quote V2 — link a quote to a ProviderValidation result.
// POST /api/sgtx/transport/quotes/[id]/link-validation  body: { providerValidationId }
//
// NON-MARKETPLACE: linking the validation does NOT auto-select the quote
// or rank it. It simply stamps the validation result for the trader's review.
import { NextResponse } from "next/server";
import { getQuote, getQuoteByQuoteId, linkProviderValidation } from "@/lib/sgtx/logistics-quote-v2";
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
    if (!body?.providerValidationId) {
      return NextResponse.json(
        { error: "providerValidationId required" },
        { status: 400 },
      );
    }
    let row = await getQuote(id);
    if (!row) row = await getQuoteByQuoteId(id);
    if (!row) {
      return NextResponse.json({ error: "quote not found" }, { status: 404 });
    }
    const result = await linkProviderValidation(
      row.quoteId,
      body.providerValidationId,
    );
    if (result && result.ok === false) {
      return NextResponse.json(
        {
          error: result.error || "linkProviderValidation failed",
          detail: result,
        },
        { status: 400 },
      );
    }
    return NextResponse.json({ quote: result });
  } catch (err: any) {
    logger.error("[api/transport/quotes/[id]/link-validation] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// POST /api/sgtx/logistics/quote/create
// Creates a normalized LogisticsQuote (Mode A / B / C) with initial version +
// surcharges + assumptions. Body matches CreateLogisticsQuoteInput.
//
// Auth: caller must be authenticated (x-tenant-gtid header). Mode A/B/C all
// flow through the same endpoint — the seller's traderMode determines which
// Governor gate fires.

import { NextRequest, NextResponse } from "next/server";
import { getCaller } from "@/lib/sgtx/auth/caller";
import { logger } from "@/lib/sgtx/logger";
import {
  createLogisticsQuote,
  type CreateLogisticsQuoteInput,
} from "@/lib/sgtx/logistics";
import { governorLogisticsQuoteCreate } from "@/lib/sgtx/governor";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const caller = getCaller(req);
    if (!caller.isAuthenticated) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const body = (await req.json()) as CreateLogisticsQuoteInput & {
      traderMode?: string;
    };
    if (!body.ustn || !body.tradeId || !body.serviceType || !body.sourceMode) {
      return NextResponse.json(
        { error: "ustn, tradeId, serviceType, sourceMode required" },
        { status: 400 },
      );
    }
    if (!body.actorGtid) body.actorGtid = caller.tenantGtid as string;

    // Governor gate (records decision in Loom chain)
    const gov = await governorLogisticsQuoteCreate(
      {
        quoteId: "(pending)",
        ustn: body.ustn,
        providerGtid: body.providerGtid || undefined,
        serviceType: body.serviceType,
        sellerGtid: body.actorGtid,
      },
      caller.tenantGtid || undefined,
      body.traderMode,
    ).catch((e: any) => {
      logger.warn("[logistics/quote/create] governor non-blocking error:", e?.message);
      return null;
    });

    const result = await createLogisticsQuote(body);
    return NextResponse.json({
      ok: true,
      quoteId: result.quote.quoteId,
      quote: result.quote,
      version: result.version,
      governorDecision: gov?.decisionId || null,
    });
  } catch (e: any) {
    logger.error("[logistics/quote/create] error:", e);
    return NextResponse.json({ error: e?.message || "Failed to create quote" }, { status: 500 });
  }
}

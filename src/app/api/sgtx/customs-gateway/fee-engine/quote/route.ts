// @ts-nocheck
/**
 * SGTX Customs Gateway — Broker Quote API
 * ===========================================================================
 * GET   /api/sgtx/customs-gateway/fee-engine/quote
 *   Query: ?ustn=<USTN>&brokerGtid=<GTID>&traderGtid=<GTID>&status=<S>&quoteId=<ID>
 *   Returns: { ok, count, quotes[] }
 *
 * POST  /api/sgtx/customs-gateway/fee-engine/quote
 *   Body:  { ustn, brokerGtid, traderGtid, service, scope, inclusions[],
 *            exclusions[], fee, currency, tax, passThrough,
 *            potentialGovernmentFees, assumptions, expiration,
 *            paymentTerms, cancellationTerms, amendmentTerms }
 *   Returns: { ok, quote }
 *
 * PATCH /api/sgtx/customs-gateway/fee-engine/quote
 *   Body:  { quoteId, action: "accept" | "reject", traderGtid, reason }
 *   Returns: { ok, quote, commitment? }
 *         (commitment is included only when action=accept — §15 creates an
 *          immutable BrokerFeeCommitment on acceptance).
 *
 * L0 §15: accepted quote creates an immutable commitment — never overwritten.
 * L0 §28: NON-CUSTODIAL — fee commitment ≠ funds held.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  createBrokerQuote,
  acceptBrokerQuote,
  rejectBrokerQuote,
  listBrokerQuotes,
  getFeeCommitment,
} from "@/lib/sgtx/customs-gateway/fee-engine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filter = {
      ustn: searchParams.get("ustn") || undefined,
      brokerGtid: searchParams.get("brokerGtid") || undefined,
      traderGtid: searchParams.get("traderGtid") || undefined,
      status: searchParams.get("status") || undefined,
      quoteId: searchParams.get("quoteId") || undefined,
      limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : 100,
    };
    const quotes = await listBrokerQuotes(filter);
    return NextResponse.json({ ok: true, count: quotes.length, quotes });
  } catch (err: any) {
    logger.error("[api/fee-engine/quote] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.ustn) {
      return NextResponse.json(
        { ok: false, error: "ustn is required" },
        { status: 400 },
      );
    }
    if (!body?.brokerGtid) {
      return NextResponse.json(
        { ok: false, error: "brokerGtid is required" },
        { status: 400 },
      );
    }
    const quote = await createBrokerQuote(body);
    return NextResponse.json({ ok: true, quote }, { status: 201 });
  } catch (err: any) {
    logger.error("[api/fee-engine/quote] POST failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { quoteId, action, traderGtid, reason } = body || {};
    if (!quoteId) {
      return NextResponse.json(
        { ok: false, error: "quoteId is required" },
        { status: 400 },
      );
    }
    if (action !== "accept" && action !== "reject") {
      return NextResponse.json(
        { ok: false, error: "action must be 'accept' or 'reject'" },
        { status: 400 },
      );
    }
    if (!traderGtid) {
      return NextResponse.json(
        { ok: false, error: "traderGtid is required" },
        { status: 400 },
      );
    }
    if (action === "accept") {
      const quote = await acceptBrokerQuote(quoteId, traderGtid);
      // §15: load the immutable commitment created on acceptance.
      let commitment: any = null;
      try {
        commitment = await getFeeCommitment(quote.ustn, quote.brokerGtid);
      } catch (err: any) {
        logger.warn("[api/fee-engine/quote] PATCH commitment lookup failed", { error: err?.message });
      }
      return NextResponse.json({ ok: true, quote, commitment });
    } else {
      const quote = await rejectBrokerQuote(quoteId, traderGtid, reason || "");
      return NextResponse.json({ ok: true, quote });
    }
  } catch (err: any) {
    logger.error("[api/fee-engine/quote] PATCH failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

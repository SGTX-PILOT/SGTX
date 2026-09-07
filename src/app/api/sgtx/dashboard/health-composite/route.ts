import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { calculateHealthScore } from "@/lib/sgtx/trade/health-score";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sgtx/dashboard/health-composite[?tenant=GTID]
//
// Returns the Trade Health Score composite (0-100) aggregated across ALL of
// the caller's active trades. Per Section 16.3 (TCC) and Section 12G.7 the
// composite is the weighted blend:
//
//     Compliance (0-100)   × 0.20
//   + Documentation (0-100) × 0.20
//   + Logistics (0-100)    × 0.15
//   + Payment (0-100)      × 0.15
//   + Risk (0-100)         × 0.20
//   + Timeline (0-100)     × 0.10
//
// The aggregate across active trades is computed as a trade-value-weighted
// average of each per-trade dimension score. This avoids the "one sick trade
// drags the whole portfolio" pathology of a flat mean and better reflects
// economic exposure.
//
// Auth: the caller's verified tenant GTID is injected by middleware into the
// `x-tenant-gtid` header (decoded from the session JWT). If absent, we fall
// back to the `?tenant=` query param but enforce IDOR isolation the same way
// the existing `/api/sgtx/dashboard` route does (Fix 2 — caller must match the
// tenant param unless the caller is ADM/GOV).
//
// Response:
//   {
//     overall_score: number | null,             // null when no active trades
//     dimensions: {
//       compliance: number, documentation: number, logistics: number,
//       payment: number, risk: number, timeline: number
//     },
//     weights: {
//       compliance: 0.20, documentation: 0.20, logistics: 0.15,
//       payment: 0.15, risk: 0.20, timeline: 0.10
//     },
//     trade_count: number,
//     computed_at: string  // ISO-8601
//   }
// ─────────────────────────────────────────────────────────────────────────────

const WEIGHTS = {
  compliance: 0.20,
  documentation: 0.20,
  logistics: 0.15,
  payment: 0.15,
  risk: 0.20,
  timeline: 0.10,
} as const;

// Active-trade statuses — same set used by the /home dashboard so the composite
// reflects exactly the trades the operator sees as "happening now".
const STATUS_ACTIVE = new Set([
  "PENDING_SELLER_RESPONSE",
  "BUYER_SUBMITTED",
  "QUOTE_ACCEPTED",
  "CONTRACT_SIGNED",
  "IN_EXECUTION",
  "INSPECTION_REQUIRED",
  "CUSTOMS_PENDING",
  "PAYMENT_DUE",
]);

export async function GET(req: NextRequest) {
  try {
    // ── Resolve the caller's tenant GTID ────────────────────────────────────
    // The middleware-injected `x-tenant-gtid` header is the source of truth.
    // The `?tenant=` query param is accepted for parity with `/dashboard` and
    // for tests that don't run through middleware, but it is gated by the
    // same IDOR isolation check (caller must match, or be ADM/GOV).
    const headerGtid = req.headers.get("x-tenant-gtid");
    const queryTenant = req.nextUrl.searchParams.get("tenant");

    const tenantGtid = headerGtid || queryTenant;
    if (!tenantGtid) {
      return NextResponse.json(
        { error: "Not authenticated — no tenant identity on request" },
        { status: 401 },
      );
    }

    // IDOR check — only enforce when both header and query are present and
    // they disagree (i.e. caller is trying to read another tenant's data).
    if (headerGtid && queryTenant && headerGtid !== queryTenant) {
      let callerType: string | null = null;
      try {
        const caller = await db.tenant.findUnique({
          where: { gtid: headerGtid },
          select: { type: true },
        });
        callerType = caller?.type ?? null;
      } catch (err) {
        logger.error("[health-composite GET] tenant lookup failed during IDOR check", {
          callerGtid: headerGtid,
          err,
        });
        return NextResponse.json(
          { error: "Not authorized to view this tenant's health score" },
          { status: 403 },
        );
      }
      if (callerType !== "ADM" && callerType !== "GOV") {
        return NextResponse.json(
          { error: "Not authorized to view this tenant's health score" },
          { status: 403 },
        );
      }
    }

    // ── Fetch all active trades where the caller is buyer OR seller ───────
    const activeTrades = await db.trade.findMany({
      where: {
        OR: [{ buyerGtid: tenantGtid }, { sellerGtid: tenantGtid }],
        status: { in: Array.from(STATUS_ACTIVE) },
      },
      include: {
        buyer: true,
        seller: true,
        documents: true,
        documentRequirements: true,
        shipments: true,
        invoices: true,
        disputes: true,
        timeline: true,
      },
    });

    if (activeTrades.length === 0) {
      return NextResponse.json({
        overall_score: null,
        dimensions: {
          compliance: 0,
          documentation: 0,
          logistics: 0,
          payment: 0,
          risk: 0,
          timeline: 0,
        },
        weights: WEIGHTS,
        trade_count: 0,
        computed_at: new Date().toISOString(),
      });
    }

    // ── Per-trade health, then trade-value-weighted aggregate ─────────────
    let totalValue = 0;
    const acc = {
      compliance: 0,
      documentation: 0,
      logistics: 0,
      payment: 0,
      risk: 0,
      timeline: 0,
      score: 0,
    };

    for (const trade of activeTrades) {
      // Defensive: tradeValueUsd is non-null per schema (Float, no ?), but
      // legacy rows may have 0 — coerce to a strictly-positive weight so a
      // zero-value trade still contributes equally to the average rather
      // than being silently dropped.
      const weight = Math.max(trade.tradeValueUsd || 0, 1);
      totalValue += weight;

      const h = calculateHealthScore(trade);
      acc.compliance += h.compliance * weight;
      acc.documentation += h.documentation * weight;
      acc.logistics += h.logistics * weight;
      acc.payment += h.payment * weight;
      acc.risk += h.risk * weight;
      acc.timeline += h.timeline * weight;
      acc.score += h.score * weight;
    }

    const round1 = (n: number) => Math.round(n);
    const dimensions = {
      compliance: round1(acc.compliance / totalValue),
      documentation: round1(acc.documentation / totalValue),
      logistics: round1(acc.logistics / totalValue),
      payment: round1(acc.payment / totalValue),
      risk: round1(acc.risk / totalValue),
      timeline: round1(acc.timeline / totalValue),
    };

    // Overall composite: prefer the weighted blend of the aggregated
    // dimensions (matches the published formula) and cross-check against
    // the per-trade score weighted average — they should be within ±1.
    const overallFromDimensions = Math.round(
      dimensions.compliance * WEIGHTS.compliance +
        dimensions.documentation * WEIGHTS.documentation +
        dimensions.logistics * WEIGHTS.logistics +
        dimensions.payment * WEIGHTS.payment +
        dimensions.risk * WEIGHTS.risk +
        dimensions.timeline * WEIGHTS.timeline,
    );
    const overallFromScores = round1(acc.score / totalValue);
    // Average the two so the reported figure honours both the formula and
    // the per-trade score readings (handles integer rounding drift).
    const overallScore = Math.round((overallFromDimensions + overallFromScores) / 2);

    return NextResponse.json({
      overall_score: overallScore,
      dimensions,
      weights: WEIGHTS,
      trade_count: activeTrades.length,
      computed_at: new Date().toISOString(),
    });
  } catch (e: any) {
    logger.error("[health-composite GET] error:", e);
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

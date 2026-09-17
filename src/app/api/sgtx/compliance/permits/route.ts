// @ts-nocheck
// SGTX Phase 3 §2 — Permit Engine API
//   GET  /api/sgtx/compliance/permits          — list TradePermit rows
//        Query: ?permitType=&state=&hs6=&jurisdictionId=&applicantGtid=
//   POST /api/sgtx/compliance/permits          — upsert a TradePermit
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { listTradePermits, upsertTradePermit } from "@/lib/sgtx/permit";

export const dynamic = "force-dynamic";

// GET — list TradePermit rows filtered by type / state / hs6 / jurisdiction / applicant.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const permitType = url.searchParams.get("permitType") || undefined;
    const state = url.searchParams.get("state") || undefined;
    const hs6 = url.searchParams.get("hs6") || undefined;
    const jurisdictionId = url.searchParams.get("jurisdictionId") || undefined;
    const applicantGtid = url.searchParams.get("applicantGtid") || undefined;

    const permits = await listTradePermits({
      permitType,
      state,
      hs6,
      jurisdictionId,
      applicantGtid,
    });
    return NextResponse.json({ permits, count: permits.length });
  } catch (err: any) {
    logger.error("[api/sgtx/compliance/permits] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// POST — upsert a TradePermit row. Body = UpsertPermitInput.
// Calls upsertTradePermit (find-then-upsert keyed on
// permitType + hs6 + jurisdictionId + applicantGtid).
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "request body required" },
        { status: 400 },
      );
    }
    if (!body.permitType) {
      return NextResponse.json(
        { error: "permitType required" },
        { status: 400 },
      );
    }
    const permit = await upsertTradePermit(body);
    return NextResponse.json({ permit });
  } catch (err: any) {
    logger.error("[api/sgtx/compliance/permits] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

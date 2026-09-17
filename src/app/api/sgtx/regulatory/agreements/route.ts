// @ts-nocheck
// SGTX Phase 2 §7 ADMIN — Trade Agreements API
//   GET  /api/sgtx/regulatory/agreements — list agreements
//       Query: ?agreementType=&legalStatus=&party=&effectiveOnly=true
//   POST /api/sgtx/regulatory/agreements — upsert an agreement
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  listTradeAgreements,
  upsertTradeAgreement,
} from "@/lib/sgtx/trade-agreement";

export const dynamic = "force-dynamic";

// GET — list TradeAgreement rows. Optional filters.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const agreementType = url.searchParams.get("agreementType") || undefined;
    const legalStatus = url.searchParams.get("legalStatus") || undefined;
    const party = url.searchParams.get("party") || undefined;
    const effectiveOnlyRaw = url.searchParams.get("effectiveOnly");
    const effectiveOnly =
      effectiveOnlyRaw === "true" || effectiveOnlyRaw === "1";

    const agreements = await listTradeAgreements({
      agreementType,
      legalStatus,
      party,
      effectiveOnly,
    });
    return NextResponse.json({ agreements, count: agreements.length });
  } catch (err: any) {
    logger.error("[api/sgtx/regulatory/agreements] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// POST — upsert a TradeAgreement (lookup by shortName || name).
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "request body required" },
        { status: 400 },
      );
    }
    if (!body.agreementType || !body.name || !body.effectiveDate) {
      return NextResponse.json(
        { error: "agreementType, name and effectiveDate required" },
        { status: 400 },
      );
    }
    if (!Array.isArray(body.parties) || body.parties.length === 0) {
      return NextResponse.json(
        { error: "parties (non-empty string[]) required" },
        { status: 400 },
      );
    }
    const agreement = await upsertTradeAgreement(body);
    return NextResponse.json({ agreement });
  } catch (err: any) {
    logger.error("[api/sgtx/regulatory/agreements] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

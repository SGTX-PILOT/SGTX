// @ts-nocheck
// SGTX Phase 2 §3 — Preferential tariff eligibility check API
//   GET /api/sgtx/regulatory/tariff/preferential
//   Query: ?hs6=X&originCountry=Y&jurisdictionCode=Z&agreementId=W
//   Returns: { eligible, preferentialRate?, mfnRate?, savings?, reason }.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { isPreferentialEligible } from "@/lib/sgtx/tariff";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const hs6 = url.searchParams.get("hs6") || undefined;
    const originCountry = url.searchParams.get("originCountry") || undefined;
    const jurisdictionCode =
      url.searchParams.get("jurisdictionCode") || undefined;
    const agreementId = url.searchParams.get("agreementId") || undefined;

    if (!hs6 || !originCountry || !agreementId) {
      return NextResponse.json(
        {
          error:
            "hs6, originCountry and agreementId query params required",
        },
        { status: 400 },
      );
    }
    const result = await isPreferentialEligible({
      hs6,
      originCountry,
      jurisdictionCode: jurisdictionCode || "",
      agreementId,
    });
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error("[api/sgtx/regulatory/tariff/preferential] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

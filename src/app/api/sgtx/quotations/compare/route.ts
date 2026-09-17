// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { compareQuotations } from "@/lib/sgtx/provider-quotations";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/sgtx/quotations/compare?ustn=X&service_type=Y — side-by-side
// comparison of all quotes for a (USTN, service_type). Quotes are
// returned in DETERMINISTIC ALPHABETICAL ORDER by provider GTID —
// NON-MARKETPLACE: NO ranking, NO scoring, NO recommendation.
//
// The `comparison` object exposes by_price / by_transit_time /
// by_provider_trust as RAW SORTED LENSES — the UI may display these
// but must never auto-pick the "top" entry. Trader explicitly selects.
//
// → { quotes: [...], comparison: { by_price, by_transit_time,
//      by_provider_trust } }
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const ustn = url.searchParams.get("ustn");
  const serviceType = url.searchParams.get("service_type");
  if (!ustn || !serviceType) {
    return NextResponse.json(
      { error: "ustn and service_type query params required" },
      { status: 400 },
    );
  }
  try {
    const result = await compareQuotations(ustn, serviceType);
    return NextResponse.json(result);
  } catch (e: any) {
    logger.error("[api/quotations/compare] failed", { error: e?.message });
    return NextResponse.json({ error: e?.message || "compare failed" }, { status: 500 });
  }
}

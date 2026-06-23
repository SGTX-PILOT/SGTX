import { NextRequest, NextResponse } from "next/server";
import { generateUstnWithCorridor, appendCorridorSuffix } from "@/lib/sgtx/tcn";
import { featureGateResponse } from "@/lib/sgtx/platform/feature-check";

/**
 * GET /api/sgtx/tcn/ustn-with-corridor
 *
 * Two modes:
 *   1. ?ustn=SGTX-...&corridorCode=EGY-ITA-RORO-001
 *      → appends corridor suffix to EXISTING ustn: SGTX-...#EGY-ITA-RORO-001
 *   2. ?buyerGtid=SGTX-...&sellerGtid=SGTX-...&corridorCode=EGY-ITA-RORO-001
 *      → generates a NEW ustn (canonical format) and attaches corridor suffix
 */
export async function GET(req: NextRequest) {
  // Feature gate — Platform Admin can deactivate the RoRo Corridors (TCN) feature.
  const gate = await featureGateResponse("roro_corridors");
  if (gate) return gate;

  try {
    const ustn = req.nextUrl.searchParams.get("ustn");
    const buyerGtid = req.nextUrl.searchParams.get("buyerGtid");
    const sellerGtid = req.nextUrl.searchParams.get("sellerGtid");
    const corridorCode = req.nextUrl.searchParams.get("corridorCode") || undefined;

    if (ustn) {
      // Mode 1: append corridor suffix to existing USTN
      const result = corridorCode ? appendCorridorSuffix(ustn, corridorCode) : ustn;
      return NextResponse.json({
        ok: true,
        ustn: result,
        originalUstn: ustn,
        corridorCode: corridorCode || null,
        mode: "append_suffix",
      });
    }

    // Mode 2: generate new USTN from GTIDs (back-compat with prior signature)
    const finalBuyer = buyerGtid || "SGTX-EG-TRD-002139-7F3A";
    const finalSeller = sellerGtid || "SGTX-DE-TRD-001234-5B6C";
    const generated = await generateUstnWithCorridor(finalBuyer, finalSeller, corridorCode);
    return NextResponse.json({
      ok: true,
      ustn: generated,
      buyerGtid: finalBuyer,
      sellerGtid: finalSeller,
      corridorCode: corridorCode || null,
      mode: "generate_new",
    });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

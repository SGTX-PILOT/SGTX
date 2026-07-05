import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { callAI } from "@/lib/sgtx/ai/orchestrator";

// POST /api/sgtx/distressed/assess — AI condition assessment for a listing
// Body: { listingId }
// Calls AI for a condition narrative + recommended triage action
// (SELL | DONATE | ABANDON) and dynamic pricing rationale. Marks the
// listing status TRIAGED. Returns { ok, assessment, recommendedAction,
// dynamicPricing }.

function discountBandFor(conditionScore: number): { discountPct: number; band: string } {
  if (conditionScore >= 90) return { discountPct: 10, band: "MINIMAL" };
  if (conditionScore >= 70) return { discountPct: 25, band: "MODERATE" };
  if (conditionScore >= 50) return { discountPct: 40, band: "SIGNIFICANT" };
  return { discountPct: 60, band: "SEVERE" };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { listingId } = body;
    if (!listingId) {
      return NextResponse.json({ error: "listingId required" }, { status: 400 });
    }

    const listing = await db.distressedCargoListing.findUnique({
      where: { id: listingId },
    });
    if (!listing) {
      return NextResponse.json({ error: "Distressed cargo listing not found" }, { status: 404 });
    }

    const score = listing.conditionScore;
    const band = discountBandFor(score);
    const deterministicPrice = Math.round(
      listing.originalValueUsd * (1 - band.discountPct / 100) * 100
    ) / 100;

    // Heuristic recommended action — drives the triage default
    let heuristicAction: "SELL" | "DONATE" | "ABANDON";
    if (score >= 50) heuristicAction = "SELL";
    else if (score >= 30) heuristicAction = "DONATE";
    else heuristicAction = "ABANDON";

    // ── AI condition narrative + recommendation (A1 advisory) ────
    let assessment = "";
    let recommendedAction: "SELL" | "DONATE" | "ABANDON" = heuristicAction;
    let dynamicPricing = {
      suggestedPriceUsd: deterministicPrice,
      discountPct: band.discountPct,
      band: band.band,
      rationale: `Condition score ${score}/100 → ${band.band} band → ${band.discountPct}% discount applied ($${deterministicPrice}).`,
    };

    try {
      const aiRes = await callAI({
        agent: "distressedCargoAssessment",
        tenant: listing.sellerGtid,
        prompt: `Assess this distressed cargo listing and return JSON ONLY with this shape:
{"assessment": "2-4 sentence plain-language condition narrative", "recommendedAction": "SELL" | "DONATE" | "ABANDON", "dynamicPricing": {"suggestedPriceUsd": number, "discountPct": number, "rationale": "one sentence"}}

Rules:
- SELL: condition score >= 50 (cargo still saleable at a discount).
- DONATE: condition score 30-49 (recovery value limited; donation may yield tax/ESG credit).
- ABANDON: condition score < 30 (condition critical; disposal cheaper than sale).
- Do NOT recommend specific buyers. SGTX is a non-marketplace system; advisory only.

Listing details:
- Commodity: ${listing.commodity}
- Quantity: ${listing.quantityKg} kg
- Condition score (0-100, 100=perfect): ${score}
- Original value: $${listing.originalValueUsd}
- Seller notes: ${listing.conditionNotes || "(none)"}
- USTN: ${listing.ustn}`,
      });

      const m = aiRes.content.match(/\{[\s\S]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        if (typeof parsed.assessment === "string" && parsed.assessment.trim()) {
          assessment = parsed.assessment;
        }
        if (parsed.recommendedAction === "SELL" || parsed.recommendedAction === "DONATE" || parsed.recommendedAction === "ABANDON") {
          recommendedAction = parsed.recommendedAction;
        }
        if (parsed.dynamicPricing && typeof parsed.dynamicPricing === "object") {
          dynamicPricing = {
            suggestedPriceUsd:
              typeof parsed.dynamicPricing.suggestedPriceUsd === "number" && parsed.dynamicPricing.suggestedPriceUsd > 0
                ? Math.round(parsed.dynamicPricing.suggestedPriceUsd * 100) / 100
                : deterministicPrice,
            discountPct:
              typeof parsed.dynamicPricing.discountPct === "number"
                ? Math.round(parsed.dynamicPricing.discountPct * 10) / 10
                : band.discountPct,
            band: band.band,
            rationale:
              typeof parsed.dynamicPricing.rationale === "string" && parsed.dynamicPricing.rationale.trim()
                ? parsed.dynamicPricing.rationale
                : dynamicPricing.rationale,
          };
        }
      }
    } catch {
      // fall back to heuristic values
    }

    if (!assessment) {
      assessment =
        `Condition score ${score}/100 (${band.band} deterioration). ` +
        `Recommended triage: ${recommendedAction}. ` +
        (recommendedAction === "SELL"
          ? `List at ~$${dynamicPricing.suggestedPriceUsd} (${dynamicPricing.discountPct}% off original) and start accelerated outreach to saved contacts.`
          : recommendedAction === "DONATE"
          ? "Recovery value is limited; coordinate donation with a recognized charity and document for ESG/tax credit."
          : "Condition critical; abandonment with documented disposal is cheaper than continued storage or sale attempts.");
    }

    // ── Update listing status to TRIAGED + persist suggested price ─
    await db.distressedCargoListing.update({
      where: { id: listing.id },
      data: {
        status: "TRIAGED",
        listingPriceUsd: dynamicPricing.suggestedPriceUsd,
      },
    });

    return NextResponse.json({
      ok: true,
      assessment,
      recommendedAction,
      dynamicPricing,
      conditionBand: band.band,
    });
  } catch (e: any) {
    logger.error("[distressed/assess] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { callAI } from "@/lib/sgtx/ai/orchestrator";

// POST /api/sgtx/distressed/declare — Seller declares cargo as distressed
// Body: {
//   tradeId, ustn, sellerGtid, commodity, quantityKg, conditionScore,
//   conditionNotes, originalValueUsd, privacyLevel
// }
// Creates a DistressedCargoListing (status=ACTIVE), runs AI condition
// assessment + dynamic pricing suggestion, and posts a triage Smart Inbox
// item to the seller. Returns { ok, listingId, aiAssessment, suggestedPrice }.

// Discount band table — condition score → discount % off original value.
// 90-100 → 10% | 70-89 → 25% | 50-69 → 40% | <50 → 60%.
function discountBandFor(conditionScore: number): { discountPct: number; band: string } {
  if (conditionScore >= 90) return { discountPct: 10, band: "MINIMAL" };
  if (conditionScore >= 70) return { discountPct: 25, band: "MODERATE" };
  if (conditionScore >= 50) return { discountPct: 40, band: "SIGNIFICANT" };
  return { discountPct: 60, band: "SEVERE" };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      tradeId,
      ustn,
      sellerGtid,
      commodity,
      quantityKg,
      conditionScore,
      conditionNotes,
      originalValueUsd,
      privacyLevel,
    } = body;

    // ── Validate required fields ─────────────────────────────────
    const missing: string[] = [];
    if (!tradeId) missing.push("tradeId");
    if (!ustn) missing.push("ustn");
    if (!sellerGtid) missing.push("sellerGtid");
    if (!commodity) missing.push("commodity");
    if (quantityKg == null) missing.push("quantityKg");
    if (conditionScore == null) missing.push("conditionScore");
    if (originalValueUsd == null) missing.push("originalValueUsd");
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    // Clamp condition score to 0-100
    const score = Math.max(0, Math.min(100, Number(conditionScore)));
    const qty = Number(quantityKg);
    const origVal = Number(originalValueUsd);

    // Validate privacy level (default ANONYMOUS)
    const privacy =
      privacyLevel === "DISCLOSED" ? "DISCLOSED" : "ANONYMOUS";

    // ── Create the DistressedCargoListing ───────────────────────
    const listing = await db.distressedCargoListing.create({
      data: {
        tradeId,
        ustn,
        sellerGtid,
        commodity,
        quantityKg: qty,
        conditionScore: score,
        conditionNotes: conditionNotes || null,
        originalValueUsd: origVal,
        // listingPriceUsd set below after AI suggestion
        status: "ACTIVE",
        privacyLevel: privacy,
      },
    });

    // ── Dynamic pricing — deterministic band + AI suggestion ─────
    const band = discountBandFor(score);
    const deterministicPrice = Math.round(
      origVal * (1 - band.discountPct / 100) * 100
    ) / 100;

    let aiAssessment = "";
    let suggestedPrice = deterministicPrice;
    let suggestedDiscountPct = band.discountPct;
    let pricingRationale = `Condition score ${score}/100 → ${band.band} deterioration band → ${band.discountPct}% discount applied.`;

    // AI condition assessment narrative (A1 advisory)
    try {
      const assessRes = await callAI({
        agent_name: "distressed-cargo-assessment",
        authority_level: "A1",
        system_prompt: "You are the SGTX distressed-cargo assessor. Generate a concise plain-language condition assessment (max 4 sentences). Mention the deterioration severity, the recommended triage path (SELL on platform / DONATE / ABANDON), and one risk note. Do NOT recommend specific buyers — SGTX is a non-marketplace system.",
        user_prompt: `Generate a concise plain-language condition assessment (max 4 sentences) for the following distressed cargo declaration. Mention the deterioration severity, the recommended triage path (SELL on platform / DONATE / ABANDON), and one risk note. Do NOT recommend specific buyers — SGTX is a non-marketplace system.

Commodity: ${commodity}
Quantity: ${qty} kg
Condition score (0-100, 100=perfect): ${score}
Original value: $${origVal}
Seller notes: ${conditionNotes || "(none)"}
Discount band applied: ${band.band} (${band.discountPct}% off → suggested $${deterministicPrice})`,
      });
      aiAssessment = assessRes.content;
    } catch (e: any) {
      aiAssessment = `Condition score ${score}/100 (${band.band} deterioration). Recommended triage: ${score >= 50 ? "SELL on platform with " + band.discountPct + "% discount" : score >= 30 ? "DONATE — recovery value limited" : "ABANDON — condition critical"}. Risk: deterioration may accelerate; act within 24-48h.`;
    }

    // AI dynamic pricing suggestion (A1 advisory)
    try {
      const priceRes = await callAI({
        agent_name: "distressed-cargo-pricing",
        authority_level: "A1",
        system_prompt: "You are the SGTX distressed-cargo pricing advisor. Suggest a fair dynamic listing price. Return JSON ONLY: { suggestedPriceUsd: number, discountPct: number, rationale: string }.",
        user_prompt: `Suggest a fair dynamic listing price for this distressed cargo. Return JSON ONLY: {"suggestedPriceUsd": number, "discountPct": number, "rationale": "one sentence"}.

Commodity: ${commodity}
Quantity: ${qty} kg
Condition score (0-100, 100=perfect): ${score}
Original value: $${origVal}
Deterministic band discount: ${band.discountPct}% (baseline $${deterministicPrice})
Seller notes: ${conditionNotes || "(none)"}`,
      });
      const m = priceRes.content.match(/\{[\s\S]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        if (typeof parsed.suggestedPriceUsd === "number" && parsed.suggestedPriceUsd > 0) {
          suggestedPrice = Math.round(parsed.suggestedPriceUsd * 100) / 100;
        }
        if (typeof parsed.discountPct === "number") {
          suggestedDiscountPct = Math.round(parsed.discountPct * 10) / 10;
        }
        if (typeof parsed.rationale === "string" && parsed.rationale.trim()) {
          pricingRationale = parsed.rationale;
        }
      }
    } catch {
      // keep deterministic values
    }

    // Persist AI-suggested listing price
    await db.distressedCargoListing.update({
      where: { id: listing.id },
      data: { listingPriceUsd: suggestedPrice },
    });

    // M3 fix — advance Trade.phase to 7 (Distressed). Distressed can be declared from
    // Phase 5 (Execution) or Phase 6 (Settlement), so use Math.max to avoid regressing
    // a trade that has already moved past Phase 7.
    try {
      const tradeRow = await db.trade.findUnique({ where: { ustn }, select: { phase: true } });
      if (tradeRow && tradeRow.phase < 7) {
        await db.trade.update({ where: { ustn }, data: { phase: 7 } });
      }
    } catch (phaseErr) {
      logger.error("[distressed/declare] phase update error (non-blocking)", {
        error: phaseErr instanceof Error ? phaseErr.message : String(phaseErr),
      });
    }

    // ── Smart Inbox item to seller — triage options ─────────────
    await db.inboxItem.create({
      data: {
        tenantGtid: sellerGtid,
        tradeId,
        category: "NEW_OFFER",
        priority: 90,
        title: `Distressed cargo declared — ${commodity} (condition ${score}/100)`,
        description: `Your cargo has been declared distressed. AI assessment: ${aiAssessment.slice(0, 280)} Suggested listing price: $${suggestedPrice} (${suggestedDiscountPct}% off original $${origVal}). Choose a triage path: (a) Sell on platform, (b) Donate, (c) Abandon. Then start accelerated outreach to your saved contacts.`,
        ctaLabel: "Open Triage Dashboard",
        deadline: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48h urgency
      },
    });

    return NextResponse.json({
      ok: true,
      listingId: listing.id,
      aiAssessment,
      suggestedPrice,
      suggestedDiscountPct,
      pricingRationale,
      conditionBand: band.band,
      privacyLevel: privacy,
    });
  } catch (e: any) {
    logger.error("[distressed/declare] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

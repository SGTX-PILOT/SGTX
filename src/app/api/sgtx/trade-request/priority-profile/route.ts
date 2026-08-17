// GET  /api/sgtx/trade-request/priority-profile — get profile docs
// POST /api/sgtx/trade-request/priority-profile — validate + apply preset
// PUT  /api/sgtx/trade-request/priority-profile — save profile to Trade (requires tradeId)
//
// CCL-004: Buyer Priority & Trade-Off Profile.
// Decision context, NOT a recommendation engine.

import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_PROFILE,
  PROFILE_PRESETS,
  applyPreset,
  isValidProfile,
  countActivePriorities,
  type BuyerPriorityProfile,
  type ProfilePreset,
} from "@/lib/sgtx/trade-request/priority-profile";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/sgtx/trade-request/priority-profile",
    axes: ["price", "quality", "deliveryCertainty", "costCertainty", "scheduleCertainty", "reliability"],
    levels: ["CRITICAL", "IMPORTANT", "NORMAL"],
    presets: Object.keys(PROFILE_PRESETS),
    defaultProfile: DEFAULT_PROFILE,
    note: "Priorities are decision context for trade-off explanations. They never generate rankings or recommendations.",
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "apply-preset") {
      const preset = body.preset as ProfilePreset;
      if (!PROFILE_PRESETS[preset]) {
        return NextResponse.json(
          { ok: false, error: `Unknown preset: ${preset}` },
          { status: 400 }
        );
      }
      const profile = applyPreset(body.profile || DEFAULT_PROFILE, preset);
      return NextResponse.json({ ok: true, profile });
    }

    if (action === "validate") {
      const profile = body.profile as BuyerPriorityProfile;
      const valid = isValidProfile(profile);
      const activeCount = countActivePriorities(profile);
      return NextResponse.json({ ok: true, valid, activePriorities: activeCount });
    }

    if (action === "explain-trade-off") {
      // This action generates a trade-off explanation between two options,
      // factoring in the buyer's stated priorities. Explanation only — never a recommendation.
      const profile = body.profile as BuyerPriorityProfile;
      const { optionA, optionB } = body;
      const { explainTradeOff } = await import("@/lib/sgtx/trade-request/priority-profile");
      const explanation = explainTradeOff(profile, optionA, optionB);
      return NextResponse.json({ ok: true, explanation });
    }

    return NextResponse.json(
      { ok: false, error: "Unknown action. Use: apply-preset, validate, explain-trade-off" },
      { status: 400 }
    );
  } catch (e: any) {
    logger.error("priority-profile POST failed", { error: e?.message });
    return NextResponse.json(
      { ok: false, error: e?.message || "operation failed" },
      { status: 500 }
    );
  }
}

// PUT — persist the priority profile to the Trade + BuyerTradePriority table
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { tradeId, profile } = body;

    if (!tradeId || !profile) {
      return NextResponse.json(
        { ok: false, error: "tradeId and profile are required" },
        { status: 400 }
      );
    }

    if (!isValidProfile(profile)) {
      return NextResponse.json(
        { ok: false, error: "Invalid priority profile" },
        { status: 400 }
      );
    }

    // Upsert the BuyerTradePriority record
    const record = await db.buyerTradePriority.upsert({
      where: { tradeId },
      create: {
        tradeId,
        price: profile.price,
        quality: profile.quality,
        deliveryCertainty: profile.deliveryCertainty,
        costCertainty: profile.costCertainty,
        scheduleCertainty: profile.scheduleCertainty,
        reliability: profile.reliability,
        profilePreset: profile.profilePreset || "BALANCED",
      },
      update: {
        price: profile.price,
        quality: profile.quality,
        deliveryCertainty: profile.deliveryCertainty,
        costCertainty: profile.costCertainty,
        scheduleCertainty: profile.scheduleCertainty,
        reliability: profile.reliability,
        profilePreset: profile.profilePreset || "BALANCED",
      },
    });

    // Also persist to Trade.buyerPriorityProfile (JSON field) for backward-compat
    await db.trade.update({
      where: { id: tradeId },
      data: { buyerPriorityProfile: JSON.stringify(profile) },
    }).catch(() => {}); // non-fatal if column doesn't exist

    return NextResponse.json({ ok: true, record });
  } catch (e: any) {
    logger.error("priority-profile PUT failed", { error: e?.message });
    return NextResponse.json(
      { ok: false, error: e?.message || "persist failed" },
      { status: 500 }
    );
  }
}

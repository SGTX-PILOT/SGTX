// @ts-nocheck
/**
 * SGTX v17 §20 — True Landed Cost Engine API
 * GET /api/sgtx/engines/true-landed-cost
 *   No params → engine info
 *   ?action=calculate&ustn=X → full true landed cost calculation (chains tariff + tax + valuation)
 *   ?action=breakdown&ustn=X → breakdown by category + by payer
 *
 * POST /api/sgtx/engines/true-landed-cost
 *   Body: { ustn, action } — equivalent to GET but useful for big POST bodies
 */

import { NextRequest, NextResponse } from "next/server";
import {
  calculateTrueLandedCost, getLandedCostBreakdown,
} from "@/lib/sgtx/engines/true-landed-cost-engine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = (searchParams.get("action") || "").trim();
    const ustn = searchParams.get("ustn") || "";

    if (!action) {
      return NextResponse.json({
        ok: true,
        engine: "true-landed-cost",
        description: "Aggregates ALL import costs (EXW + freight + insurance + duty + VAT + port handling + broker + other) for a USTN.",
        actions: ["calculate", "breakdown"],
        note: "Use ?action=calculate&ustn=X for full landed cost. USTN must reference an existing Trade in the database.",
      });
    }
    if (action === "calculate") {
      if (!ustn) return NextResponse.json({ ok: false, error: "ustn is required" }, { status: 400 });
      const r = await calculateTrueLandedCost(ustn);
      return NextResponse.json({ ok: true, result: r });
    }
    if (action === "breakdown") {
      if (!ustn) return NextResponse.json({ ok: false, error: "ustn is required" }, { status: 400 });
      const r = await getLandedCostBreakdown(ustn);
      return NextResponse.json({ ok: true, result: r });
    }
    return NextResponse.json({ ok: false, error: `Unknown action "${action}"` }, { status: 400 });
  } catch (err: any) {
    logger.error("[api/sgtx/engines/true-landed-cost] GET failed", { error: err?.message });
    return NextResponse.json({ ok: false, error: err?.message || "internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = (body.action || "").trim();
    const ustn = body.ustn || "";
    if (action === "calculate") {
      if (!ustn) return NextResponse.json({ ok: false, error: "ustn is required" }, { status: 400 });
      const r = await calculateTrueLandedCost(ustn);
      return NextResponse.json({ ok: true, result: r });
    }
    if (action === "breakdown") {
      if (!ustn) return NextResponse.json({ ok: false, error: "ustn is required" }, { status: 400 });
      const r = await getLandedCostBreakdown(ustn);
      return NextResponse.json({ ok: true, result: r });
    }
    return NextResponse.json({ ok: false, error: `Unknown action "${action}"` }, { status: 400 });
  } catch (err: any) {
    logger.error("[api/sgtx/engines/true-landed-cost] POST failed", { error: err?.message });
    return NextResponse.json({ ok: false, error: err?.message || "internal error" }, { status: 500 });
  }
}

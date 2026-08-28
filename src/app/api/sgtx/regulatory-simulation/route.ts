// @ts-nocheck
/**
 * SGTX Part 109 — Regulatory Simulation API
 * POST /api/sgtx/regulatory-simulation
 *   Body: { currentRule?: any, proposedRule: any }
 *   Returns: SimulationResult
 * POST /api/sgtx/regulatory-simulation?ustn=<USTN>
 *   Body: { proposedRule: any }
 *   Returns: dry-run for a single USTN
 */

import { NextRequest, NextResponse } from "next/server";
import { simulateRuleChange, simulateForUstn } from "@/lib/sgtx/regulatory-simulation";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "invalid body — JSON object expected" },
        { status: 400 },
      );
    }
    if (!body.proposedRule) {
      return NextResponse.json(
        { ok: false, error: "proposedRule is required" },
        { status: 400 },
      );
    }
    const { searchParams } = new URL(req.url);
    const ustn = searchParams.get("ustn");
    if (ustn) {
      const result = await simulateForUstn(ustn, body.proposedRule);
      return NextResponse.json({ ok: true, ustn, result });
    }
    const result = await simulateRuleChange(body.currentRule || null, body.proposedRule);
    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    logger.error("[api/regulatory-simulation] POST failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    return NextResponse.json({
      ok: true,
      usage: "POST a JSON body with { currentRule?, proposedRule } to simulate. Append ?ustn=<USTN> for a single-trade dry-run.",
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

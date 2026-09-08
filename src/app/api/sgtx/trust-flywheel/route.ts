// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v17 §23.1 — Trust Flywheel API
// ═══════════════════════════════════════════════════════════════════════════════
//
// GET /api/sgtx/trust-flywheel
//   → flywheel status (7 layers + key metrics) + competitive lead years
//
// GET /api/sgtx/trust-flywheel?assessment=true
//   → moat assessment (overall strength 0-100, per-layer scores, narrative)
//
// GET /api/sgtx/trust-flywheel?metrics=true
//   → raw flywheel metrics only (the 8 numeric counters)
//
// All read-only, public — safe to expose. No tenant scoping required (the
// metrics are aggregate platform stats, not per-tenant).
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  getFlywheelStatus,
  getMoatAssessment,
  getFlywheelMetrics,
} from "@/lib/sgtx/trust-flywheel";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const assessment = searchParams.get("assessment") === "true";
    const metricsOnly = searchParams.get("metrics") === "true";

    if (assessment) {
      const result = await getMoatAssessment();
      return NextResponse.json({
        ok: true,
        ...result,
      });
    }

    if (metricsOnly) {
      const m = await getFlywheelMetrics();
      return NextResponse.json({ ok: true, metrics: m });
    }

    // Default: full status (7 layers + competitive lead years).
    const status = await getFlywheelStatus();
    return NextResponse.json({ ok: true, ...status });
  } catch (err: any) {
    logger.error("[api/sgtx/trust-flywheel] GET failed", {
      error: err?.message,
      stack: err?.stack,
    });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

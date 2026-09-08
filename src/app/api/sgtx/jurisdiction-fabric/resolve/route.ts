// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v17 §20.6 — Jurisdiction Fabric conflict resolution
// ═══════════════════════════════════════════════════════════════════════════════
//
// POST /api/sgtx/jurisdiction-fabric/resolve
//   body: { jurisdictions: ["EG", "EU", "DE"], hs_code?: "081110" }
//
// When multiple jurisdictions apply to the same trade/HS code (e.g. cargo in
// the Suez Canal SEZ, transiting the Suez Canal corridor, governed by Egyptian
// customs, AND screened against the GCC customs union sanctions list), the
// Sovereign Jurisdiction Supremacy rule (G3) says the strictest applicable
// rule wins. "Strictest" = lowest `precedence` number, ties broken by the
// jurisdiction's `precedenceTier` (customs union 1 < country 2 < SEZ 4 < port 5).
//
// Returns: { winning_jurisdiction, reason, applied_rule, considered_jurisdictions,
//            considered_rule_count }
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { resolveJurisdictionConflict } from "@/lib/sgtx/jurisdiction-fabric";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const jurisdictions: string[] =
      body?.jurisdictions || body?.jurisdiction_codes || [];
    const hsCode: string | undefined =
      body?.hs_code || body?.hsCode || body?.hs || undefined;

    if (!Array.isArray(jurisdictions) || jurisdictions.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "body.jurisdictions must be a non-empty array of jurisdiction codes",
          example: { jurisdictions: ["EG", "EU", "DE"], hs_code: "081110" },
        },
        { status: 400 },
      );
    }

    const result = resolveJurisdictionConflict(jurisdictions, hsCode);

    if (!result.winningJurisdiction) {
      return NextResponse.json(
        {
          ok: false,
          error: "No winning jurisdiction could be determined",
          considered_jurisdictions: result.consideredJurisdictions,
          considered_rule_count: result.consideredRuleCount,
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      winning_jurisdiction: result.winningJurisdiction,
      winning_jurisdiction_name: result.winningJurisdictionName,
      winning_jurisdiction_type: result.winningJurisdictionType,
      reason: result.reason,
      applied_rule: result.appliedRule,
      considered_jurisdictions: result.consideredJurisdictions,
      considered_rule_count: result.consideredRuleCount,
      hs_code: hsCode ? hsCode.toUpperCase() : null,
      principle: "Sovereign Jurisdiction Supremacy (G3) — strictest applicable rule wins",
    });
  } catch (err: any) {
    logger.error("[api/sgtx/jurisdiction-fabric/resolve] POST failed", {
      error: err?.message,
      stack: err?.stack,
    });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

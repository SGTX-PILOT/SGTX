// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v17 §20.6 — Jurisdiction Fabric API
// ═══════════════════════════════════════════════════════════════════════════════
//
// GET /api/sgtx/jurisdiction-fabric
//   → list all 16 jurisdiction types with descriptions
//
// GET /api/sgtx/jurisdiction-fabric?jurisdiction_id=EG
//   → get the jurisdiction detail + full hierarchy (parent chain to root)
//
// GET /api/sgtx/jurisdiction-fabric?jurisdiction_id=EG&hs_code=081110
//   → get the jurisdiction detail + applicable rules (from the jurisdiction +
//     all parents, filtered by HS code prefix, sorted strictest-first)
//
// GET /api/sgtx/jurisdiction-fabric?jurisdiction_id=EG&hs_code=081110&rules_only=true
//   → same as above but returns ONLY the rules (no detail/hierarchy) — useful
//     for the trade-lock snapshot to consume
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  getJurisdictionTypes,
  getJurisdictionType,
  getJurisdictionHierarchy,
  getJurisdictionDetail,
  getApplicableRules,
} from "@/lib/sgtx/jurisdiction-fabric";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const jurisdictionId = searchParams.get("jurisdiction_id") || searchParams.get("jurisdictionId");
    const hsCode = searchParams.get("hs_code") || searchParams.get("hsCode") || undefined;
    const rulesOnly = searchParams.get("rules_only") === "true" || searchParams.get("rulesOnly") === "true";

    // ── No jurisdiction_id → list all 16 types ────────────────────────────
    if (!jurisdictionId) {
      const result = getJurisdictionTypes();
      return NextResponse.json({
        ok: true,
        count: result.types.length,
        types: result.types,
        note: "16 jurisdiction types per v17 §20.6 — pass ?jurisdiction_id=EG to get a specific jurisdiction's detail + hierarchy",
      });
    }

    // ── Resolve jurisdiction + hierarchy ──────────────────────────────────
    const typeInfo = getJurisdictionType(jurisdictionId);
    if (!typeInfo) {
      return NextResponse.json(
        {
          ok: false,
          error: `Jurisdiction '${jurisdictionId}' not found in the registry`,
          hint: "Use the seed in src/lib/sgtx/jurisdiction-fabric/seed.ts to add new jurisdictions",
        },
        { status: 404 },
      );
    }

    const hierarchy = getJurisdictionHierarchy(jurisdictionId);

    // ── If hs_code supplied → also return applicable rules ─────────────────
    if (hsCode) {
      const applicable = getApplicableRules(jurisdictionId, hsCode);
      if (rulesOnly) {
        return NextResponse.json({
          ok: true,
          jurisdiction: jurisdictionId.toUpperCase(),
          hs_code: hsCode.toUpperCase(),
          rules: applicable.rules,
          rule_count: applicable.rules.length,
          hierarchy_depth: applicable.hierarchyDepth,
        });
      }
      const detail = getJurisdictionDetail(jurisdictionId);
      return NextResponse.json({
        ok: true,
        jurisdiction: detail,
        hierarchy: hierarchy.hierarchy,
        hierarchy_depth: hierarchy.hierarchy.length,
        applicable_rules: applicable.rules,
        applicable_rule_count: applicable.rules.length,
        strictest_rule: applicable.rules[0] || null,
        hs_code: hsCode.toUpperCase(),
      });
    }

    // ── No hs_code → just detail + hierarchy ───────────────────────────────
    const detail = getJurisdictionDetail(jurisdictionId);
    return NextResponse.json({
      ok: true,
      jurisdiction: detail,
      hierarchy: hierarchy.hierarchy,
      hierarchy_depth: hierarchy.hierarchy.length,
      own_rules: typeInfo.rules,
      own_rule_count: typeInfo.rules.length,
      hint: "Pass ?hs_code=081110 to also return applicable rules (filtered by HS code, collected from the full hierarchy)",
    });
  } catch (err: any) {
    logger.error("[api/sgtx/jurisdiction-fabric] GET failed", {
      error: err?.message,
      stack: err?.stack,
    });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

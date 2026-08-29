// @ts-nocheck
/**
 * SGTX Customs Gateway — Regional Gateway Investigations API (§41-42)
 * ===========================================================================
 *
 * GET /api/sgtx/customs-gateway/regional
 *   — Return combined GCC + ASEAN investigation overview + gateway decisions.
 *
 * GET /api/sgtx/customs-gateway/regional?region=gcc
 *   — Return the GCC country assessments (6 GCC member states).
 *
 * GET /api/sgtx/customs-gateway/regional?region=asean
 *   — Return the ASEAN country assessments (10 ASEAN member states).
 *
 * GET /api/sgtx/customs-gateway/regional?region=gcc&countryCode=SA
 *   — Return a single GCC country's assessment.
 *
 * GET /api/sgtx/customs-gateway/regional?region=asean&countryCode=SG
 *   — Return a single ASEAN country's assessment.
 *
 * GET /api/sgtx/customs-gateway/regional?region=gcc&summary=1
 *   — Return the GCC investigation summary (counts by status + class).
 *
 * GET /api/sgtx/customs-gateway/regional?region=asean&summary=1
 *   — Return the ASEAN investigation summary + gateway status.
 *
 * GET /api/sgtx/customs-gateway/regional?gateway=asean
 *   — Return the ASEAN Gateway build-justification decision.
 *
 * GET /api/sgtx/customs-gateway/regional?gateway=gcc
 *   — Return the GCC Gateway build-justification decision.
 *
 * L0 (NON-MARKETPLACE): the regional investigations LIST assessments; they
 *     NEVER auto-select a country or build a gateway without verification.
 *     The Governor + Compliance team make the final build decisions.
 *
 * Critical (§41): GCC single windows (FASAH, UAE National SW, Bayan,
 *     Al Nadeeb, etc.) access model is under investigation. All GCC
 *     countries are CLASS_C (ROADMAP) until verified. No GCC adapter is
 *     built yet — only the investigation stub is shipped.
 *
 * Critical (§42): ASEAN Gateway should ONLY be built where it is legally
 *     justified — at least 3 ASEAN member states must have a verified
 *     CLASS_A or CLASS_B self-build path. Until then, only national
 *     adapters are built (e.g. Singapore TradeNet adapter being built by
 *     Agent A in parallel).
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  getGCCAssessment,
  listGCCAssessments,
  getGCCInvestigationSummary,
} from "@/lib/sgtx/customs-gateway/regional-gateways";
import {
  getASEANAssessment,
  listASEANAssessments,
  getASEANInvestigationSummary,
  getASEANGatewayStatus,
} from "@/lib/sgtx/customs-gateway/regional-gateways";
import { getRegionalGatewayOverview } from "@/lib/sgtx/customs-gateway/regional-gateways";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const region = searchParams.get("region")?.toLowerCase();
    const countryCode = searchParams.get("countryCode");
    const summary = searchParams.get("summary");
    const gateway = searchParams.get("gateway")?.toLowerCase();

    // ── ?gateway=asean → ASEAN Gateway build-justification ─────────────
    if (gateway === "asean") {
      const status = getASEANGatewayStatus();
      return NextResponse.json({
        ok: true,
        gateway: "ASEAN_GATEWAY",
        ...status,
        note:
          "§42 ASEAN Gateway decision. The ASEAN Gateway should ONLY be built where it is " +
          "legally justified — at least 3 ASEAN member states must have a verified CLASS_A " +
          "or CLASS_B self-build path. Until then, only national adapters are built.",
      });
    }

    // ── ?gateway=gcc → GCC Gateway build-justification ─────────────────
    if (gateway === "gcc") {
      const overview = getRegionalGatewayOverview();
      return NextResponse.json({
        ok: true,
        gateway: "GCC_GATEWAY",
        buildJustified: overview.gccGatewayBuildJustified,
        gccSummary: overview.gcc,
        notes: overview.notes,
        note:
          "§41 GCC Gateway decision. The GCC Gateway should ONLY be built where at least 3 " +
          "GCC member states have a verified CLASS_A or CLASS_B self-build path. Currently 0 — " +
          "all GCC countries are CLASS_C (ROADMAP).",
      });
    }

    // ── ?region=gcc → GCC assessments ──────────────────────────────────
    if (region === "gcc") {
      // ?region=gcc&countryCode=SA → single country
      if (countryCode) {
        const assessment = getGCCAssessment(countryCode);
        if (!assessment) {
          return NextResponse.json(
            {
              ok: false,
              error: `${countryCode} is not a GCC member state. Valid codes: SA, AE, OM, QA, KW, BH.`,
            },
            { status: 404 },
          );
        }
        return NextResponse.json({
          ok: true,
          assessment,
          note:
            "§41 GCC country assessment. The GCC countries (SA, AE, OM, QA, KW, BH) each " +
            "operate a national single window, but the access model is highly heterogeneous " +
            "and under investigation. All GCC countries are CLASS_C (ROADMAP) until verified.",
        });
      }

      // ?region=gcc&summary=1 → GCC investigation summary
      if (summary === "1") {
        const s = getGCCInvestigationSummary();
        return NextResponse.json({
          ok: true,
          summary: s,
          note:
            "§41 GCC investigation summary. All GCC countries are CLASS_C (ROADMAP) until " +
            "their access model is verified. No GCC adapter is built yet — only the " +
            "investigation stub is shipped.",
        });
      }

      // Default: full GCC list
      const assessments = listGCCAssessments();
      return NextResponse.json({
        ok: true,
        count: assessments.length,
        assessments,
        note:
          "§41 GCC Special Rule. All 6 GCC member states (SA, AE, OM, QA, KW, BH) are " +
          "classified CLASS_C (ROADMAP) until their customs single-window access model is " +
          "verified. NON-MARKETPLACE: the regional investigation LISTS assessments; it NEVER " +
          "auto-selects a country or builds a gateway without verification.",
      });
    }

    // ── ?region=asean → ASEAN assessments ──────────────────────────────
    if (region === "asean") {
      // ?region=asean&countryCode=SG → single country
      if (countryCode) {
        const assessment = getASEANAssessment(countryCode);
        if (!assessment) {
          return NextResponse.json(
            {
              ok: false,
              error:
                `${countryCode} is not an ASEAN member state. Valid codes: SG, MY, TH, ID, ` +
                `VN, PH, BN, MM, KH, LA.`,
            },
            { status: 404 },
          );
        }
        return NextResponse.json({
          ok: true,
          assessment,
          note:
            "§42 ASEAN country assessment. Each ASEAN member state operates its own national " +
            "single window + participates in the ASEAN Single Window (ASW) for cross-border " +
            "document exchange. Most are CLASS_C (ROADMAP) — only SG is IN_PROGRESS.",
        });
      }

      // ?region=asean&summary=1 → ASEAN investigation summary + gateway status
      if (summary === "1") {
        const s = getASEANInvestigationSummary();
        const gatewayStatus = getASEANGatewayStatus();
        return NextResponse.json({
          ok: true,
          summary: s,
          gatewayStatus,
          note:
            "§42 ASEAN investigation summary + ASEAN Gateway decision. The ASEAN Gateway " +
            "should ONLY be built where at least 3 ASEAN member states have a verified " +
            "CLASS_A or CLASS_B self-build path. Until then, only national adapters are built.",
        });
      }

      // Default: full ASEAN list
      const assessments = listASEANAssessments();
      return NextResponse.json({
        ok: true,
        count: assessments.length,
        assessments,
        note:
          "§42 ASEAN Special Rule. Each ASEAN member state operates its own national single " +
          "window + participates in the ASEAN Single Window (ASW). Most are CLASS_C (ROADMAP) " +
          "— only Singapore is IN_PROGRESS (Agent A is building the TradeNet adapter). " +
          "NON-MARKETPLACE: the regional investigation LISTS assessments; it NEVER auto-selects " +
          "a country or builds a gateway without verification.",
      });
    }

    // ── Default → combined regional overview ──────────────────────────
    const overview = getRegionalGatewayOverview();
    return NextResponse.json({
      ok: true,
      ...overview,
      gccCountries: ["SA", "AE", "OM", "QA", "KW", "BH"],
      aseanCountries: ["SG", "MY", "TH", "ID", "VN", "PH", "BN", "MM", "KH", "LA"],
      note:
        "§41-42 Regional Gateway Investigations. GCC: 6 countries under investigation, all " +
        "CLASS_C (ROADMAP). ASEAN: 10 countries under investigation — only Singapore " +
        "IN_PROGRESS (CLASS_B), the rest CLASS_C (ROADMAP). The ASEAN Gateway + GCC Gateway " +
        "should ONLY be built where at least 3 countries per region have a verified CLASS_A " +
        "or CLASS_B self-build path. Use ?region=gcc or ?region=asean for region-specific " +
        "queries, ?gateway=asean or ?gateway=gcc for build decisions, or ?summary=1 for " +
        "investigation summaries.",
    });
  } catch (err: any) {
    logger.error("[api/customs-gateway/regional] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

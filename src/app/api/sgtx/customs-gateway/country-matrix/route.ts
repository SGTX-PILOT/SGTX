// @ts-nocheck
/**
 * SGTX Customs Gateway — Country Verification Matrix API (§9, §33-37, §50)
 * ===========================================================================
 *
 * GET /api/sgtx/customs-gateway/country-matrix
 *   — Return the full country verification matrix (single source of truth).
 *
 * GET /api/sgtx/customs-gateway/country-matrix?countryCode=US
 *   — Return a single country's verification record.
 *
 * GET /api/sgtx/customs-gateway/country-matrix?class=CLASS_A
 *   — Filter countries by integration class (CLASS_A / CLASS_B / CLASS_C / REJECTED).
 *
 * GET /api/sgtx/customs-gateway/country-matrix?decision=IMPLEMENT_NOW
 *   — Filter countries by implementation decision.
 *
 * GET /api/sgtx/customs-gateway/country-matrix?ready=1
 *   — Return only IMPLEMENT_NOW + IMPLEMENT_AFTER_ONBOARDING countries.
 *
 * GET /api/sgtx/customs-gateway/country-matrix?summary=1
 *   — Return the matrix summary (counts by class + decision).
 *
 * GET /api/sgtx/customs-gateway/country-matrix?score=1&countryCode=KR
 *   — Run the §36 scoring engine on the given country and return the
 *     score + classification + reasoning breakdown.
 *
 * GET /api/sgtx/customs-gateway/country-matrix?verify=1&countryCode=KR
 *   — Audit a country's recorded classification against the scoring engine.
 *
 * L0 (NON-MARKETPLACE): the matrix LISTS countries; it NEVER auto-selects
 *     one for a declaration. The broker + Governor choose.
 *
 * Critical (§9, §33): the matrix is the SINGLE SOURCE OF TRUTH for adapter
 *     classification. Adapters must NOT self-declare a higher class than
 *     what the matrix records — the matrix is reviewed and updated by the
 *     SGTX Governor + Compliance team.
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  getCountryVerification,
  listCountriesByClass,
  getImplementationReadyCountries,
  getFullMatrix,
  getMatrixSummary,
  calculateClassScore,
  verifyClassification,
  type IntegrationClass,
} from "@/lib/sgtx/customs-gateway/country-verification-matrix";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const countryCode = searchParams.get("countryCode");
    const classFilter = searchParams.get("class") as IntegrationClass | null;
    const decisionFilter = searchParams.get("decision");
    const ready = searchParams.get("ready");
    const summary = searchParams.get("summary");
    const score = searchParams.get("score");
    const verify = searchParams.get("verify");

    // ── ?summary=1 → matrix summary ────────────────────────────────────
    if (summary === "1") {
      const s = getMatrixSummary();
      return NextResponse.json({
        ok: true,
        summary: s,
        note:
          "§50 matrix summary (counts by class + decision). The matrix is the SINGLE " +
          "SOURCE OF TRUTH for adapter classification. Updates require Governor review (§33-37).",
      });
    }

    // ── ?score=1&countryCode=KR → run scoring engine ──────────────────
    if (score === "1") {
      if (!countryCode) {
        return NextResponse.json(
          { ok: false, error: "countryCode is required when score=1" },
          { status: 400 },
        );
      }
      const country = getCountryVerification(countryCode);
      if (!country) {
        return NextResponse.json(
          { ok: false, error: `Unknown countryCode: ${countryCode}` },
          { status: 404 },
        );
      }
      const result = calculateClassScore(country);
      return NextResponse.json({
        ok: true,
        countryCode: country.countryCode,
        countryName: country.countryName,
        recordedClassification: country.classification,
        scoringEngine: result,
        note:
          "§36 scoring engine output. The scoring engine applies the §36 criteria to the " +
          "country's verification record and returns a score + classification. If the scoring " +
          "engine output differs from the recorded classification, the Governor + Compliance " +
          "team should review (§33).",
      });
    }

    // ── ?verify=1&countryCode=KR → audit classification ───────────────
    if (verify === "1") {
      if (!countryCode) {
        return NextResponse.json(
          { ok: false, error: "countryCode is required when verify=1" },
          { status: 400 },
        );
      }
      const result = verifyClassification(countryCode);
      return NextResponse.json({
        ok: true,
        countryCode: countryCode.toUpperCase(),
        ...result,
        note:
          "§36 classification audit. If `consistent` is false, the recorded classification " +
          "in the matrix does NOT match what the scoring engine would produce from the same " +
          "fields. The Governor + Compliance team should review.",
      });
    }

    // ── ?countryCode=US → single country lookup ────────────────────────
    if (countryCode) {
      const country = getCountryVerification(countryCode);
      if (!country) {
        return NextResponse.json(
          {
            ok: false,
            error: `Unknown countryCode: ${countryCode}. See the full matrix for valid codes.`,
          },
          { status: 404 },
        );
      }
      return NextResponse.json({
        ok: true,
        country,
        note:
          "§33 country verification record. The matrix is the SINGLE SOURCE OF TRUTH for " +
          "adapter classification — adapters must NOT self-declare a higher class than what " +
          "the matrix records.",
      });
    }

    // ── ?ready=1 → implementation-ready countries ──────────────────────
    if (ready === "1") {
      const countries = getImplementationReadyCountries();
      return NextResponse.json({
        ok: true,
        count: countries.length,
        countries,
        note:
          "Countries with decision=IMPLEMENT_NOW or IMPLEMENT_AFTER_ONBOARDING (i.e. adapter " +
          "is being built or has been built). NON-MARKETPLACE: the matrix LISTS these countries; " +
          "it NEVER auto-selects one for a declaration.",
      });
    }

    // ── ?class=CLASS_A → filter by class ───────────────────────────────
    if (classFilter) {
      const validClasses: IntegrationClass[] = ["CLASS_A", "CLASS_B", "CLASS_C", "REJECTED"];
      if (!validClasses.includes(classFilter)) {
        return NextResponse.json(
          {
            ok: false,
            error: `Invalid class: ${classFilter}. Valid: ${validClasses.join(", ")}`,
          },
          { status: 400 },
        );
      }
      const countries = listCountriesByClass(classFilter);
      return NextResponse.json({
        ok: true,
        class: classFilter,
        count: countries.length,
        countries,
        note: `§5 / §50 — countries classified ${classFilter}.`,
      });
    }

    // ── ?decision=IMPLEMENT_NOW → filter by decision ───────────────────
    if (decisionFilter) {
      const all = getFullMatrix();
      const filtered = all.filter((c) => c.decision === decisionFilter);
      return NextResponse.json({
        ok: true,
        decision: decisionFilter,
        count: filtered.length,
        countries: filtered,
      });
    }

    // ── Default → full matrix ──────────────────────────────────────────
    const matrix = getFullMatrix();
    const matrixSummary = getMatrixSummary();
    return NextResponse.json({
      ok: true,
      count: matrix.length,
      matrix,
      summary: matrixSummary,
      note:
        "§50 Country Verification Matrix — the SINGLE SOURCE OF TRUTH for adapter " +
        "classification. Each row is the evidence-based classification of one target " +
        "country. Updates require Governor review (§33-37). NON-MARKETPLACE: the matrix " +
        "LISTS countries; it NEVER auto-selects one for a declaration. The broker + " +
        "Governor choose. Use ?countryCode=, ?class=, ?decision=, ?ready=, ?summary=, " +
        "?score=1&countryCode=, or ?verify=1&countryCode= for specific queries.",
    });
  } catch (err: any) {
    logger.error("[api/customs-gateway/country-matrix] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// @ts-nocheck
/**
 * POST /api/sgtx/trade-request/compliance-check  (FIX-10)
 * =======================================================
 *
 * Pre-submission compliance gate for the New Trade Request wizard. Runs the
 * SGTX Brain compliance modules against the trade being assembled and returns
 * a combined result so the buyer can see EUDR, CBAM, sanctions, and force
 * majeure outcomes BEFORE the trade is submitted to the seller.
 *
 * Body:
 *   {
 *     hsCode:           string  — HS code of the commodity (e.g. "1801" / "1801.00")
 *     originCountry:    string  — ISO 3166-1 alpha-2 (e.g. "GH")
 *     destCountry:      string  — ISO 3166-1 alpha-2 (e.g. "DE")
 *     buyerName?:       string  — buyer legal name (sanctions screening)
 *     sellerName?:      string  — seller legal name (sanctions screening)
 *     commodity?:       string  — free-text description (informational)
 *     weightTonnes?:    number  — shipped weight (informational)
 *     carbonIntensityKgCO2e?: number — production carbon intensity (CBAM decl)
 *     hasGeoLocationData?: boolean — EUDR geo-location data on file
 *     hasDueDiligenceStatement?: boolean — EUDR DDS submitted
 *   }
 *
 * Response:
 *   {
 *     ok: true,
 *     eudr:          EudrDueDiligence,
 *     cbam:          { applicable, cbamGood, carbonDeclared, condition, ... },
 *     sanctions:     { buyer: SanctionsScreenResult, seller: SanctionsScreenResult, clear },
 *     forceMajeure:  TradeForceMajeureAssessment,
 *     overall:       BrainPrescreenResult,  // from autoCheckCompliance
 *     overallVerdict: "ALLOW" | "CONDITIONAL" | "DENY",
 *     conditions:    BrainCondition[],     // merged from all modules
 *   }
 *
 * The endpoint is non-mutating — no DB writes, no external network calls. All
 * sub-modules are deterministic and self-contained (the sanctions + force
 * majeure modules use seeded lists until real providers are registered).
 *
 * This route is consumed by the New Trade Request wizard's "Compliance Gates"
 * step (Step 10 in the wizard). The wizard renders the result via the
 * BrainDecisionPanel + a per-module checklist. If `overallVerdict === "DENY"`,
 * the wizard's Submit button is disabled.
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { autoCheckCompliance } from "@/lib/sgtx/ai/compliance-gate";
import { assessEudr } from "@/lib/sgtx/compliance/eudr";
import { assessTradeForceMajeure } from "@/lib/sgtx/compliance/force-majeure";
import { screenForSanctions } from "@/lib/sgtx/compliance/sanctions";

// ─────────────────────────────────────────────────────────────────────────────
// CBAM Annex I goods — local replica of `matchCbamGood` from
// `src/app/api/sgtx/customs/cbam/route.ts` + `src/lib/sgtx/ai/compliance-gate.ts`.
// Replicated (rather than imported from the route file) because importing from
// a Next.js route handler is an anti-pattern.
// ─────────────────────────────────────────────────────────────────────────────

const EU_COUNTRIES: ReadonlySet<string> = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE",
]);

const CBAM_GOODS: Array<{ chapter?: string; chapters?: string[]; name: string }> = [
  { chapter: "2523", name: "Cement clinker" },
  { chapter: "2814", name: "Ammonia" },
  { chapter: "2845", name: "Hydrogen" },
  { chapter: "3102", name: "Nitrogen fertilisers" },
  { chapter: "3103", name: "Phosphatic fertilisers" },
  { chapter: "3104", name: "Potassic fertilisers" },
  { chapter: "3105", name: "Mixed fertilisers" },
  { chapter: "2716", name: "Electricity" },
  {
    chapters: [
      "7201","7202","7203","7204","7205","7206","7207","7208","7209","7210",
      "7211","7212","7213","7214","7215","7216","7217","7218","7219","7220",
      "7221","7222","7223","7224","7225","7226","7227","7228","7229","7230",
    ],
    name: "Iron and steel",
  },
  {
    chapters: [
      "7301","7302","7303","7304","7305","7306","7307","7308","7309","7310",
      "7311","7312","7313","7314","7315","7316","7317","7318","7319","7320",
      "7321","7322","7323","7324","7325","7326",
    ],
    name: "Iron/steel articles",
  },
  {
    chapters: [
      "7601","7602","7603","7604","7605","7606","7607","7608","7609","7610",
      "7611","7612","7613","7614","7615","7616",
    ],
    name: "Aluminium",
  },
];

/** Match an HS code to a CBAM Annex I good by first-4-digit heading. */
function matchCbamGood(hsCode: string): { name: string } | null {
  const head4 = (hsCode || "").replace(/[^0-9]/g, "").substring(0, 4);
  if (head4.length < 4) return null;
  for (const g of CBAM_GOODS) {
    if (g.chapter && g.chapter === head4) return { name: g.name };
    if (g.chapters && g.chapters.includes(head4)) return { name: g.name };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function normCountry(c?: string): string {
  return (c || "").toUpperCase().trim();
}

function present(s?: string): boolean {
  return !!s && String(s).trim().length > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const {
      hsCode = "",
      originCountry = "",
      destCountry = "",
      buyerName,
      sellerName,
      commodity,
      weightTonnes,
      carbonIntensityKgCO2e,
      hasGeoLocationData,
      hasDueDiligenceStatement,
    } = body || {};

    const origin = normCountry(originCountry);
    const dest = normCountry(destCountry);
    const hs = (hsCode || "").trim();

    // ── Step 1: Sanctions screening (buyer + seller) ───────────────────────
    let buyerScreen: any = null;
    let sellerScreen: any = null;
    if (present(buyerName)) {
      try {
        buyerScreen = await screenForSanctions({
          name: buyerName,
          country: origin || undefined,
        });
      } catch (err: any) {
        logger.error("[compliance-check] sanctions screening threw for buyer", {
          buyerName,
          error: err?.message,
        });
        buyerScreen = {
          screenedEntity: { name: buyerName },
          hits: [],
          clear: false, // fail-closed
          screenedAt: new Date().toISOString(),
          provider: "screen-error",
          error: err?.message,
        };
      }
    }
    if (present(sellerName)) {
      try {
        sellerScreen = await screenForSanctions({
          name: sellerName,
          country: origin || undefined,
        });
      } catch (err: any) {
        logger.error("[compliance-check] sanctions screening threw for seller", {
          sellerName,
          error: err?.message,
        });
        sellerScreen = {
          screenedEntity: { name: sellerName },
          hits: [],
          clear: false,
          screenedAt: new Date().toISOString(),
          provider: "screen-error",
          error: err?.message,
        };
      }
    }
    const sanctionsClear =
      (buyerScreen?.clear ?? true) && (sellerScreen?.clear ?? true);

    // ── Step 2: Force Majeure (corridor assessment) ────────────────────────
    let fm: any = null;
    if (present(origin) && present(dest)) {
      try {
        fm = await assessTradeForceMajeure({
          ustn: "trade-request-compliance-check",
          originCountry: origin,
          destCountry: dest,
        });
      } catch (err: any) {
        logger.error("[compliance-check] FM assessment threw", {
          origin,
          dest,
          error: err?.message,
        });
        fm = {
          ustn: "trade-request-compliance-check",
          affected: false,
          events: [],
          recommendedAction: "proceed",
          autoSuspensionRecommended: false,
          conditions: [
            {
              condition_id: "FM-ASSESSMENT-ERROR",
              label: `Force Majeure assessment failed to evaluate: ${err?.message || "internal error"}. Manual review required.`,
              status: "unmet",
            },
          ],
        };
      }
    } else {
      fm = {
        ustn: "trade-request-compliance-check",
        affected: false,
        events: [],
        recommendedAction: "proceed",
        autoSuspensionRecommended: false,
        conditions: [],
        skipped: true,
        skipReason: "origin / destination country missing",
      };
    }

    // ── Step 3: EUDR (Regulation (EU) 2023/1115) ───────────────────────────
    let eudr: any = null;
    if (present(hs) && present(dest) && present(origin)) {
      try {
        eudr = assessEudr({
          ustn: "trade-request-compliance-check",
          hsCode: hs,
          destCountry: dest,
          originCountry: origin,
          hasGeoLocationData,
          hasDueDiligenceStatement,
        });
      } catch (err: any) {
        logger.error("[compliance-check] EUDR assessment threw", {
          hs,
          origin,
          dest,
          error: err?.message,
        });
        eudr = {
          ustn: "trade-request-compliance-check",
          applicable: false,
          commodity: "none",
          hsCodesCovered: [],
          geoLocationsRequired: false,
          dueDiligenceStatementRequired: false,
          riskLevel: "medium",
          conditions: [
            {
              condition_id: "EUDR-ASSESSMENT-ERROR",
              label: `EUDR assessment failed to evaluate: ${err?.message || "internal error"}. Manual review required.`,
              status: "unmet",
            },
          ],
          deadline: "2025-12-30",
        };
      }
    } else {
      eudr = {
        ustn: "trade-request-compliance-check",
        applicable: false,
        commodity: "none",
        hsCodesCovered: [],
        geoLocationsRequired: false,
        dueDiligenceStatementRequired: false,
        riskLevel: "medium",
        conditions: [],
        skipped: true,
        skipReason: "hsCode / origin / destination missing",
        deadline: "2025-12-30",
      };
    }

    // ── Step 4: CBAM (Regulation (EU) 2023/956) ────────────────────────────
    const cbamGood = matchCbamGood(hs);
    const cbamApplicable = !!cbamGood && EU_COUNTRIES.has(dest);
    const carbonDeclared =
      typeof carbonIntensityKgCO2e === "number" && carbonIntensityKgCO2e > 0;
    const cbam: any = cbamApplicable
      ? {
          applicable: true,
          cbamGood: cbamGood!.name,
          destCountry: dest,
          carbonDeclared,
          carbonIntensityKgCO2e:
            typeof carbonIntensityKgCO2e === "number"
              ? carbonIntensityKgCO2e
              : null,
          weightTonnes: typeof weightTonnes === "number" ? weightTonnes : null,
          condition: {
            condition_id: "CBAM-DECL",
            label: `CBAM carbon declaration required for ${cbamGood!.name} (EU Reg 2023/956 Annex I). Production emissions intensity (kg CO2e/tonne) must be declared; definitive period financial obligation begins 2026-01-01.`,
            status: carbonDeclared ? "met" : "unmet",
          },
        }
      : {
          applicable: false,
          cbamGood: cbamGood?.name ?? null,
          destCountry: dest,
          carbonDeclared: false,
          carbonIntensityKgCO2e:
            typeof carbonIntensityKgCO2e === "number"
              ? carbonIntensityKgCO2e
              : null,
          weightTonnes: typeof weightTonnes === "number" ? weightTonnes : null,
          condition: null,
          message:
            "CBAM not applicable — HS code is not a CBAM Annex I good, or destination is outside the EU customs territory.",
        };

    // ── Step 5: autoCheckCompliance (the Brain aggregate verdict) ──────────
    // autoCheckCompliance runs sanctions + FM + EUDR + CBAM + FTA internally
    // and returns the canonical BrainPrescreenResult. The per-module results
    // above are surfaced separately so the UI can show the checklist; the
    // aggregate verdict here is the authoritative answer for the Submit gate.
    let overall: any = null;
    try {
      overall = await autoCheckCompliance({
        ustn: "trade-request-compliance-check",
        buyerName,
        sellerName,
        buyerCountry: dest, // buyer is in the destination country
        sellerCountry: origin, // seller is in the origin country
        hsCode: hs,
        commodity,
        destCountry: dest,
        originCountry: origin,
        weightTonnes,
        carbonIntensityKgCO2e,
        hasGeoLocationData,
        hasDueDiligenceStatement,
      });
    } catch (err: any) {
      logger.error("[compliance-check] autoCheckCompliance threw", {
        hs,
        origin,
        dest,
        error: err?.message,
      });
      overall = {
        verdict: "CONDITIONAL",
        conditions: [
          {
            condition_id: "BRAIN-INTERNAL-ERROR",
            label: `SGTX Brain aggregate compliance gate failed to evaluate: ${err?.message || "internal error"}. Manual compliance review required before submission.`,
            status: "unmet",
          },
        ],
        aiConfidence: 0.4,
        brainModule: "autoCheckCompliance",
      };
    }

    // ── Step 6: Merge all unmet conditions into a single list ──────────────
    // This is the "conditions[]" array returned to the UI. It's a superset of
    // `overall.conditions` (which already includes sanctions/FM/EUDR/CBAM
    // conditions) — we add the per-module met conditions too so the wizard
    // checklist can render ✓ rows for cleared gates.
    const conditions: any[] = [...(overall.conditions || [])];
    // EUDR conditions (met + unmet) — for the per-module checklist.
    for (const c of eudr.conditions || []) {
      if (!conditions.some((x) => x.condition_id === c.condition_id)) {
        conditions.push(c);
      }
    }
    // CBAM condition — if not already present from autoCheckCompliance.
    if (cbam.condition && !conditions.some((x) => x.condition_id === cbam.condition.condition_id)) {
      conditions.push(cbam.condition);
    }
    // FM conditions — if not already present.
    for (const c of fm.conditions || []) {
      if (!conditions.some((x) => x.condition_id === c.condition_id)) {
        conditions.push(c);
      }
    }
    // Sanctions clear condition (synthesized for the checklist).
    if ((present(buyerName) || present(sellerName)) && !conditions.some((x) => x.condition_id === "SANCTIONS-CLEAR")) {
      conditions.push({
        condition_id: "SANCTIONS-CLEAR",
        label: `Counterparty sanctions screening clear (buyer: ${present(buyerName) ? "screened" : "skipped — name not provided"}; seller: ${present(sellerName) ? "screened" : "skipped — name not provided"}).`,
        status: sanctionsClear ? "met" : "unmet",
      });
    }

    return NextResponse.json({
      ok: true,
      eudr,
      cbam,
      sanctions: {
        buyer: buyerScreen,
        seller: sellerScreen,
        clear: sanctionsClear,
      },
      forceMajeure: fm,
      // `overall` is the full BrainPrescreenResult (verdict, conditions,
      // aiConfidence, brainModule, denialReason?). `overallVerdict` is a
      // top-level alias so the UI can read it without nested access.
      overall,
      overallVerdict: overall.verdict,
      aiConfidence: overall.aiConfidence,
      brainModule: overall.brainModule,
      conditions,
    });
  } catch (e: any) {
    logger.error("[compliance-check] fatal error:", e);
    return NextResponse.json(
      {
        ok: false,
        error: e?.message || "Compliance check failed",
        overallVerdict: "CONDITIONAL",
        conditions: [
          {
            condition_id: "COMPLIANCE-CHECK-ERROR",
            label: `Compliance gate evaluation failed: ${e?.message || "internal error"}. Manual review required before submission.`,
            status: "unmet",
          },
        ],
      },
      { status: 500 },
    );
  }
}

// GET — convenience for health checks + discovery. Returns the module list +
// the request shape so the wizard can show a friendly placeholder before the
// first compliance run.
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "/api/sgtx/trade-request/compliance-check",
    method: "POST",
    description:
      "SGTX Brain pre-submission compliance gate. Runs sanctions + force majeure + EUDR + CBAM and returns a combined verdict for the New Trade Request wizard.",
    modules: [
      "autoCheckCompliance",
      "assessEudr",
      "assessTradeForceMajeure",
      "screenForSanctions",
    ],
    requestShape: {
      hsCode: "string (required)",
      originCountry: "ISO 3166-1 alpha-2 (required)",
      destCountry: "ISO 3166-1 alpha-2 (required)",
      buyerName: "string (optional, sanctions screening)",
      sellerName: "string (optional, sanctions screening)",
      commodity: "string (optional, informational)",
      weightTonnes: "number (optional, informational)",
      carbonIntensityKgCO2e: "number (optional, CBAM carbon declaration)",
      hasGeoLocationData: "boolean (optional, EUDR)",
      hasDueDiligenceStatement: "boolean (optional, EUDR)",
    },
  });
}

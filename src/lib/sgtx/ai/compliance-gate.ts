/**
 * autoCheckCompliance — SGTX Brain Pre-Contract Compliance Gate (IMPL-5)
 * =====================================================================
 *
 * Aggregates the SGTX compliance modules into a single pre-contract gate that
 * returns an ALLOW / DENY / CONDITIONAL verdict for use by the
 * `withBrainPrescreen` HOC. This is the Brain module that makes
 * "SGTX Brain AI orchestrates ALL" true on the contract-signing mutation —
 * previously the Brain was advisory only and 0% of mutating routes were
 * Brain-gated (AUDIT-1 finding).
 *
 * Modules consulted (in evaluation order — DENY short-circuits):
 *
 *   1. Sanctions screening (OFAC SDN / EU Consolidated / UK OFSI / UN 1267)
 *        — buyer AND seller screened. ANY hit with `!clear` → DENY.
 *   2. Force Majeure (war / pandemic / port closure / civil unrest / sanctions
 *        / act of government / natural disaster) — corridor assessment.
 *        `recommendedAction === "cancel"` → DENY;
 *        `"suspend"` → add unmet FM conditions as CONDITIONAL.
 *   3. EUDR (Regulation (EU) 2023/1115) — when the trade is in scope (EU
 *        destination + Annex I HS code + non-intra-EU), require geo-location
 *        data + Due Diligence Statement. Unmet → CONDITIONAL.
 *   4. CBAM (Regulation (EU) 2023/956) — when the HS code matches a CBAM
 *        Annex I good AND destination is the EU, require a production carbon
 *        emissions declaration. Missing → CONDITIONAL.
 *   5. FTA / duty lookup — when no preferential FTA applies AND MFN duty > 0,
 *        surface an informational note (NOT blocking; status "met" so the
 *        aggregate verdict is not promoted to CONDITIONAL by this rule alone).
 *   6. Aggregate — if any DENY → DENY. Else if any unmet CONDITIONAL →
 *        CONDITIONAL. Else ALLOW.
 *
 * The function is deterministic, side-effect-free, and self-contained: it
 * makes no DB writes and no external HTTP calls. All network behaviour is
 * confined to the underlying sanctions / force-majeure modules (and those are
 * seed-list-based until real providers are registered).
 *
 * Public surface: `autoCheckCompliance` + `ComplianceGateInput`.
 */

import type { BrainPrescreenResult, BrainCondition } from "./with-brain-prescreen";
import { screenForSanctions } from "@/lib/sgtx/compliance/sanctions";
import { assessTradeForceMajeure } from "@/lib/sgtx/compliance/force-majeure";
import { assessEudr } from "@/lib/sgtx/compliance/eudr";
import { applyFta } from "@/lib/sgtx/ai/customs-pricing";
import { logger } from "@/lib/sgtx/logger";

// ─────────────────────────────────────────────────────────────────────────────
// CBAM Annex I goods — local replica of matchCbamGood from
// `src/app/api/sgtx/customs/cbam/route.ts`. Replicated (rather than imported)
// because (a) the source file is a Next.js route handler with `@ts-nocheck`,
// and importing from a route file is an anti-pattern, and (b) the spec
// explicitly permits replicating the check.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * EU member states — CBAM applies to imports INTO the EU customs territory.
 * Local copy kept here to avoid coupling the compliance gate to the route
 * file's import graph. Identical to the list in `cbam/route.ts`.
 */
const EU_COUNTRIES: ReadonlySet<string> = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE",
]);

/** CBAM Annex I goods — match by first-4-digit heading. Source: Reg (EU)
 *  2023/956 Annex I. */
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

/** Match an HS code to a CBAM Annex I good by first-4-digit heading.
 *  Replica of `matchCbamGood` in `cbam/route.ts`. */
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
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/** Input to `autoCheckCompliance`. All fields optional — the function degrades
 *  gracefully to ALLOW when insufficient data is provided (the contract sign
 *  route's prescreen looks up missing fields from the Trade + Tenant rows). */
export interface ComplianceGateInput {
  /** Trade USTN — used for audit logging + FM assessment. */
  ustn?: string;
  /** Buyer legal name (for sanctions screening). */
  buyerName?: string;
  /** Buyer country ISO 3166-1 alpha-2 (e.g. "DE"). */
  buyerCountry?: string;
  /** Seller legal name (for sanctions screening). */
  sellerName?: string;
  /** Seller country ISO 3166-1 alpha-2 (e.g. "EG"). */
  sellerCountry?: string;
  /** HS code of the traded commodity (e.g. "1801.00"). */
  hsCode?: string;
  /** Free-text commodity description (informational; not used for matching). */
  commodity?: string;
  /** Destination country ISO alpha-2 — drives EUDR + CBAM applicability. */
  destCountry?: string;
  /** Origin country ISO alpha-2 — drives EUDR risk-level + FTA lookup. */
  originCountry?: string;
  /** Optional loading port UN/LOCODE (e.g. "EGPSD") — improves FM overlap. */
  loadingPort?: string;
  /** Optional discharge port UN/LOCODE (e.g. "DEHAM") — improves FM overlap. */
  dischargePort?: string;
  /** Shipped weight in metric tonnes — informational. */
  weightTonnes?: number;
  /** Production carbon intensity (kg CO2e per tonne of product). When provided
   *  AND > 0, the CBAM carbon-declaration condition is marked `met`. */
  carbonIntensityKgCO2e?: number;
  /** Operator has EUDR geo-location data on file for the production plots. */
  hasGeoLocationData?: boolean;
  /** Operator has submitted the EUDR Due Diligence Statement. */
  hasDueDiligenceStatement?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Normalise a country code to uppercase ISO alpha-2, or `""` if absent. */
function normCountry(c?: string): string {
  return (c || "").toUpperCase().trim();
}

/** True if the value is present and non-empty (after trimming). */
function present(s?: string): boolean {
  return !!s && String(s).trim().length > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the SGTX Brain pre-contract compliance gate.
 *
 * Aggregates sanctions, force majeure, EUDR, CBAM, and FTA/duty assessments
 * into a single {@link BrainPrescreenResult} suitable for the
 * `withBrainPrescreen` HOC.
 *
 * Evaluation order (DENY short-circuits):
 *   1. Sanctions screening — buyer + seller names. Any non-clear hit → DENY.
 *   2. Force Majeure — corridor assessment. `cancel` → DENY; `suspend` →
 *      add unmet FM conditions.
 *   3. EUDR — when applicable, surface unmet geo-location / DDS / deforestation
 *      / legality / risk-mitigation conditions.
 *   4. CBAM — when applicable (EU destination + Annex I HS code), surface a
 *      carbon-declaration condition.
 *   5. FTA / duty — informational note when no FTA applies and MFN > 0 (NOT
 *      blocking; marked `met` so it does not promote the verdict).
 *   6. Aggregate — DENY if any DENY; else CONDITIONAL if any unmet; else ALLOW.
 *
 * Confidence heuristic:
 *   • 0.97 — sanctions screening ran and cleared (authoritative for both
 *     parties) + no FM event.
 *   • 0.90 — sanctions cleared + minor FM event (suspend verdict).
 *   • 0.80 — one or more inputs were partial (e.g. seller name missing) —
 *     sanctions screening was skipped for that party.
 *   • 0.95 — CBAM or EUDR condition surfaced (deterministic rule, high
 *     confidence in the verdict itself).
 *
 * The function NEVER throws — a failure inside a sub-module is logged and
 * treated as a soft CONDITIONAL with a "BRAIN_INTERNAL_ERROR-..." condition,
 * so the HOC's fail-closed 500 path is reserved for truly unrecoverable
 * prescreen-function failures.
 */
export async function autoCheckCompliance(
  input: ComplianceGateInput,
): Promise<BrainPrescreenResult> {
  const conditions: BrainCondition[] = [];
  const ustn = (input.ustn || "").trim();
  const dest = normCountry(input.destCountry);
  const origin = normCountry(input.originCountry);
  const hsCode = (input.hsCode || "").trim();

  // Track whether sanctions screening actually ran for both parties — drives
  // the confidence heuristic.
  let sanctionsRanFor = { buyer: false, seller: false };
  let sanctionsCleared = { buyer: true, seller: true };
  let fmAssessed = false;
  let fmRecommended: "proceed" | "suspend" | "cancel" | null = null;

  // ── Step 1: Sanctions screening ──────────────────────────────────────────
  // Screen BOTH buyer and seller names. ANY non-clear hit → DENY immediately.
  if (present(input.buyerName)) {
    sanctionsRanFor.buyer = true;
    try {
      const buyerScreen = await screenForSanctions({
        name: input.buyerName as string,
        country: normCountry(input.buyerCountry) || undefined,
      });
      sanctionsCleared.buyer = buyerScreen.clear;
      if (!buyerScreen.clear) {
        const topHit = buyerScreen.hits[0];
        return {
          verdict: "DENY",
          conditions: [
            {
              condition_id: "SANCTIONS-CLEAR-BUYER",
              label: `Buyer "${input.buyerName}" cleared all sanctions lists (OFAC SDN, EU Consolidated, UK OFSI, UN 1267).`,
              status: "unmet",
            },
          ],
          denialReason: `Sanctions hit detected on buyer "${input.buyerName}" — contract cannot proceed. Top match: ${topHit?.entityName ?? "unknown"} (${topHit?.list ?? "?"}, score ${topHit?.matchScore ?? "?"}). Compliance review required.`,
          aiConfidence: 0.97,
          brainModule: "autoCheckCompliance",
        };
      }
    } catch (err: any) {
      logger.error("[autoCheckCompliance] sanctions screening threw for buyer", {
        ustn,
        buyerName: input.buyerName,
        error: err?.message,
      });
      conditions.push({
        condition_id: "BRAIN_INTERNAL_ERROR-SANCTIONS-BUYER",
        label: `Sanctions screening encountered an internal error for buyer "${input.buyerName}". Manual compliance review required.`,
        status: "unmet",
      });
    }
  }

  if (present(input.sellerName)) {
    sanctionsRanFor.seller = true;
    try {
      const sellerScreen = await screenForSanctions({
        name: input.sellerName as string,
        country: normCountry(input.sellerCountry) || undefined,
      });
      sanctionsCleared.seller = sellerScreen.clear;
      if (!sellerScreen.clear) {
        const topHit = sellerScreen.hits[0];
        return {
          verdict: "DENY",
          conditions: [
            {
              condition_id: "SANCTIONS-CLEAR-SELLER",
              label: `Seller "${input.sellerName}" cleared all sanctions lists (OFAC SDN, EU Consolidated, UK OFSI, UN 1267).`,
              status: "unmet",
            },
          ],
          denialReason: `Sanctions hit detected on seller "${input.sellerName}" — contract cannot proceed. Top match: ${topHit?.entityName ?? "unknown"} (${topHit?.list ?? "?"}, score ${topHit?.matchScore ?? "?"}). Compliance review required.`,
          aiConfidence: 0.97,
          brainModule: "autoCheckCompliance",
        };
      }
    } catch (err: any) {
      logger.error("[autoCheckCompliance] sanctions screening threw for seller", {
        ustn,
        sellerName: input.sellerName,
        error: err?.message,
      });
      conditions.push({
        condition_id: "BRAIN_INTERNAL_ERROR-SANCTIONS-SELLER",
        label: `Sanctions screening encountered an internal error for seller "${input.sellerName}". Manual compliance review required.`,
        status: "unmet",
      });
    }
  }

  // Sanctions-clear condition (MET) — surfaced so the UI can show the gate ran.
  if (sanctionsRanFor.buyer || sanctionsRanFor.seller) {
    conditions.push({
      condition_id: "SANCTIONS-CLEAR",
      label: `Counterparty sanctions screening clear (buyer: ${sanctionsRanFor.buyer ? "screened" : "skipped — name not provided"}; seller: ${sanctionsRanFor.seller ? "screened" : "skipped — name not provided"}).`,
      status:
        sanctionsCleared.buyer && sanctionsCleared.seller ? "met" : "unmet",
    });
  }

  // ── Step 2: Force Majeure ────────────────────────────────────────────────
  if (present(origin) && present(dest)) {
    fmAssessed = true;
    try {
      const fm = await assessTradeForceMajeure({
        ustn: ustn || "prescreen",
        originCountry: origin,
        destCountry: dest,
        loadingPort: input.loadingPort,
        dischargePort: input.dischargePort,
      });
      fmRecommended = fm.recommendedAction;
      if (fm.recommendedAction === "cancel") {
        return {
          verdict: "DENY",
          conditions: fm.conditions.map((c) => ({
            condition_id: c.condition_id,
            label: c.label,
            status: c.status,
          })),
          denialReason:
            fm.events[0]
              ? `Force Majeure event on the ${origin}→${dest} corridor recommends CANCEL — contract cannot proceed. Top event: ${fm.events[0].title} (severity ${fm.events[0].severity}).`
              : `Force Majeure assessment recommends CANCEL on the ${origin}→${dest} corridor — contract cannot proceed.`,
          aiConfidence: 0.93,
          brainModule: "autoCheckCompliance",
        };
      }
      if (fm.recommendedAction === "suspend" || fm.affected) {
        // Surface unmet FM conditions (insurance, carrier confirmation,
        // executive override). These promote the aggregate verdict to
        // CONDITIONAL.
        for (const c of fm.conditions) {
          if (c.status === "unmet") {
            conditions.push({
              condition_id: c.condition_id,
              label: c.label,
              status: "unmet",
            });
          }
        }
      }
    } catch (err: any) {
      logger.error("[autoCheckCompliance] FM assessment threw", {
        ustn,
        origin,
        dest,
        error: err?.message,
      });
      conditions.push({
        condition_id: "BRAIN_INTERNAL_ERROR-FM",
        label: `Force Majeure assessment encountered an internal error for the ${origin}→${dest} corridor. Manual review required.`,
        status: "unmet",
      });
    }
  }

  // ── Step 3: EUDR (Regulation (EU) 2023/1115) ─────────────────────────────
  if (present(hsCode) && present(dest) && present(origin)) {
    try {
      const eudr = assessEudr({
        ustn: ustn || "prescreen",
        hsCode,
        destCountry: dest,
        originCountry: origin,
        hasGeoLocationData: input.hasGeoLocationData,
        hasDueDiligenceStatement: input.hasDueDiligenceStatement,
      });
      if (eudr.applicable) {
        // Surface unmet EUDR conditions (EUDR-GEO, EUDR-DDS, EUDR-DEFOREST,
        // EUDR-LEGALITY, EUDR-RISK-MITIGATION for high-risk origins).
        for (const c of eudr.conditions) {
          if (c.status === "unmet") {
            conditions.push({
              condition_id: c.condition_id,
              label: c.label,
              status: "unmet",
            });
          }
        }
      }
    } catch (err: any) {
      logger.error("[autoCheckCompliance] EUDR assessment threw", {
        ustn,
        hsCode,
        origin,
        dest,
        error: err?.message,
      });
      conditions.push({
        condition_id: "BRAIN_INTERNAL_ERROR-EUDR",
        label: `EUDR assessment encountered an internal error for HS ${hsCode} on the ${origin}→${dest} corridor. Manual review required.`,
        status: "unmet",
      });
    }
  }

  // ── Step 4: CBAM (Regulation (EU) 2023/956) ──────────────────────────────
  if (present(hsCode) && EU_COUNTRIES.has(dest)) {
    const cbamGood = matchCbamGood(hsCode);
    if (cbamGood) {
      const carbonDeclared =
        typeof input.carbonIntensityKgCO2e === "number" &&
        input.carbonIntensityKgCO2e > 0;
      conditions.push({
        condition_id: "CBAM-DECL",
        label: `CBAM carbon declaration required for ${cbamGood.name} (EU Reg 2023/956 Annex I). Production emissions intensity (kg CO2e/tonne) must be declared; definitive period financial obligation begins 2026-01-01.`,
        status: carbonDeclared ? "met" : "unmet",
      });
    }
  }

  // ── Step 5: FTA / duty lookup (informational, NOT blocking) ──────────────
  // When no FTA applies AND MFN duty > 0, surface an informational note. The
  // status is "met" so this rule alone does NOT promote the aggregate verdict
  // to CONDITIONAL — most world trade ships under MFN, and that is normal.
  if (present(hsCode) && present(origin) && present(dest) && origin !== dest) {
    try {
      const fta = applyFta(hsCode, origin, dest, 0);
      if (!fta.applicable && fta.mfnDutyRatePct > 0) {
        conditions.push({
          condition_id: "FTA-INFO",
          label: `No preferential FTA applies on the ${origin}→${dest} corridor for HS ${hsCode}. MFN duty ${fta.mfnDutyRatePct}% will apply at destination customs. (Informational — not a compliance block.)`,
          status: "met",
        });
      } else if (fta.applicable) {
        conditions.push({
          condition_id: "FTA-APPLIED",
          label: `Preferential FTA applies: ${fta.ftaName} — duty reduced from MFN ${fta.mfnDutyRatePct}% to ${fta.dutyRatePct}%. Certificate required: ${fta.certificateType ?? "n/a"}.`,
          status: "met",
        });
      }
    } catch (err: any) {
      // Non-blocking — FTA lookup is informational only.
      logger.warn("[autoCheckCompliance] FTA lookup threw (non-blocking)", {
        ustn,
        hsCode,
        origin,
        dest,
        error: err?.message,
      });
    }
  }

  // ── Step 6: Aggregate verdict ────────────────────────────────────────────
  const hasUnmet = conditions.some((c) => c.status === "unmet");
  const verdict: BrainPrescreenResult["verdict"] = hasUnmet
    ? "CONDITIONAL"
    : "ALLOW";

  // ── Confidence heuristic ─────────────────────────────────────────────────
  let aiConfidence = 0.97; // baseline: sanctions cleared + no FM
  if (fmRecommended === "suspend") aiConfidence = 0.90;
  // Partial sanctions screening (one party name missing) lowers confidence.
  const sanctionsRanForBoth =
    sanctionsRanFor.buyer && sanctionsRanFor.seller;
  if (!sanctionsRanForBoth && (present(input.buyerName) || present(input.sellerName))) {
    // One name was provided but the other wasn't — screening was asymmetric.
    aiConfidence = Math.min(aiConfidence, 0.80);
  } else if (!sanctionsRanForBoth && !present(input.buyerName) && !present(input.sellerName)) {
    // Neither name provided — sanctions screening skipped entirely. Lower
    // confidence sharply: the Brain cannot make a strong claim without
    // screening counterparties.
    aiConfidence = Math.min(aiConfidence, 0.60);
  }
  // If EUDR/CBAM conditions surfaced, the verdict itself is deterministic —
  // bump confidence back up.
  if (hasUnmet && conditions.some((c) => c.condition_id.startsWith("EUDR-") || c.condition_id === "CBAM-DECL")) {
    aiConfidence = Math.max(aiConfidence, 0.92);
  }
  // If FM assessment was skipped (missing origin/dest), reduce confidence.
  if (!fmAssessed) {
    aiConfidence = Math.min(aiConfidence, 0.75);
  }

  return {
    verdict,
    conditions,
    aiConfidence,
    brainModule: "autoCheckCompliance",
  };
}

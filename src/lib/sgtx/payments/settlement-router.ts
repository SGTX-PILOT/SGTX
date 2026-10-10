// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX — Settlement Router Engine
// ═══════════════════════════════════════════════════════════════════════════════
//
// Given a trade (source country, destination country, amount, currency, financing
// needed), the router SOLVES the optimal settlement path:
//
//   1. Identify rails available in BOTH source + destination (intersection)
//   2. Rank by speed, cost, and regulatory fit
//   3. Check if crypto settlement is possible (both countries must allow)
//   4. Check if open banking can be used for faster settlement
//   5. Merge finance-approval requirements from both jurisdictions
//   6. Produce a ranked list of settlement options with rationale
//
// This is the ENGINE behind the cinematic Settlement Router section. It reads
// from country-payment-profiles.ts + finance-approval-matrix.ts — single source
// of truth.
// ═══════════════════════════════════════════════════════════════════════════════

import {
  COUNTRY_BY_CODE, getCountryProfile, type CountryPaymentProfile, type PaymentRail,
} from "./country-payment-profiles";
import { buildFinanceApprovalChecklist, type FinanceApprovalChecklist } from "./finance-approval-matrix";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type SettlementMethod = "BANK_RAIL" | "OPEN_BANKING" | "CRYPTO" | "SWIFT";
export type SettlementTier = "OPTIMAL" | "RECOMMENDED" | "FALLBACK" | "BLOCKED";

export interface SettlementOption {
  method: SettlementMethod;
  tier: SettlementTier;
  rail?: PaymentRail;            // the specific rail (for BANK_RAIL)
  railName: string;              // human-readable
  speed: string;                 // "INSTANT", "T_PLUS_1"
  speedLabel: string;            // "Instant", "Same-day", "T+1"
  estimatedTime: string;         // "10 seconds", "1 business day"
  costEstimate: string;          // "0.01-0.05%", "fixed $5"
  fxRequired: boolean;           // does this require FX conversion?
  cryptoAsset?: string;          // for CRYPTO method
  openBankingProvider?: string;  // for OPEN_BANKING method
  rationale: string;             // why this option
  requirements: string[];        // what's needed to use this
  blockers: string[];            // what prevents this
}

export interface SettlementRoute {
  sourceCountry: CountryPaymentProfile;
  destinationCountry: CountryPaymentProfile;
  amount: number;
  currency: string;
  financingNeeded: boolean;
  options: SettlementOption[];
  financeChecklistSource?: FinanceApprovalChecklist;
  financeChecklistDestination?: FinanceApprovalChecklist;
  summary: {
    totalOptions: number;
    optimal: number;
    recommended: number;
    fallback: number;
    blocked: number;
    cryptoPossible: boolean;
    openBankingPossible: boolean;
    instantPossible: boolean;
  };
  warnings: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// SPEED + COST METADATA
// ─────────────────────────────────────────────────────────────────────────────

const SPEED_LABEL: Record<string, string> = {
  INSTANT: "Instant",
  SAME_DAY: "Same-day",
  T_PLUS_1: "T+1",
  T_PLUS_2: "T+2",
  MULTI_DAY: "Multi-day",
};

const SPEED_TIME: Record<string, string> = {
  INSTANT: "< 60 seconds",
  SAME_DAY: "Same business day",
  T_PLUS_1: "1 business day",
  T_PLUS_2: "2 business days",
  MULTI_DAY: "3-5 business days",
};

const SPEED_RANK: Record<string, number> = {
  INSTANT: 1,
  SAME_DAY: 2,
  T_PLUS_1: 3,
  T_PLUS_2: 4,
  MULTI_DAY: 5,
};

const TIER_RANK: Record<SettlementTier, number> = {
  OPTIMAL: 1,
  RECOMMENDED: 2,
  FALLBACK: 3,
  BLOCKED: 4,
};

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE SOLVER
// ─────────────────────────────────────────────────────────────────────────────

export function solveSettlementRoute(
  sourceCode: string,
  destinationCode: string,
  amount: number,
  currency: string,
  financingNeeded = false
): SettlementRoute | null {
  const source = getCountryProfile(sourceCode);
  const destination = getCountryProfile(destinationCode);
  if (!source || !destination) return null;

  const options: SettlementOption[] = [];
  const warnings: string[] = [];

  // ── 1. BANK RAILS — find intersection of source + destination rails ──────
  // SWIFT is always available if both are SWIFT-connected
  // Domestic rails only match if same currency
  // Cross-border rails (SWIFT, ISO 20022) always match
  const sourceRails = source.paymentRails;
  const destRails = destination.paymentRails;

  // SWIFT — universal cross-border
  if (source.swiftConnected && destination.swiftConnected) {
    options.push({
      method: "SWIFT",
      tier: "FALLBACK",
      rail: destRails.find(r => r.code === "SWIFT"),
      railName: "SWIFT MT/CBP (ISO 20022)",
      speed: "T_PLUS_1",
      speedLabel: SPEED_LABEL.T_PLUS_1,
      estimatedTime: SPEED_TIME.T_PLUS_1,
      costEstimate: "0.05-0.15% (correspondent banking)",
      fxRequired: source.currency !== destination.currency,
      rationale: "Universal cross-border rail — works between any two SWIFT-connected countries. Always available as fallback.",
      requirements: ["SWIFT BIC codes (both parties)", "Correspondent bank relationship", "ISO 20022 CBPR+ message"],
      blockers: [],
    });
  }

  // Same-currency domestic rails (e.g., SEPA between two EUR countries)
  if (source.currency === destination.currency) {
    const matchingCodes = new Set(
      sourceRails.filter(r => r.code !== "SWIFT" && r.currency === source.currency)
        .map(r => r.code)
    );
    for (const destRail of destRails) {
      if (destRail.code === "SWIFT") continue;
      if (matchingCodes.has(destRail.code)) {
        const sourceRail = sourceRails.find(r => r.code === destRail.code)!;
        // Use the faster of the two (instant beats T+1)
        const rail = SPEED_RANK[sourceRail.speed] <= SPEED_RANK[destRail.speed] ? sourceRail : destRail;
        const isInstant = rail.type === "INSTANT";
        options.push({
          method: "BANK_RAIL",
          tier: isInstant ? "OPTIMAL" : "RECOMMENDED",
          rail,
          railName: rail.name,
          speed: rail.speed,
          speedLabel: SPEED_LABEL[rail.speed],
          estimatedTime: SPEED_TIME[rail.speed],
          costEstimate: isInstant ? "0.01-0.03% (instant rail)" : "0.02-0.05% (domestic)",
          fxRequired: false,
          rationale: `Same-currency (${source.currency}) domestic rail available in both jurisdictions. ${isInstant ? "Instant settlement 24/7." : "Standard settlement."}`,
          requirements: [`IBAN/account in ${source.code}`, `IBAN/account in ${destination.code}`, `${rail.settlementSystem} connectivity`],
          blockers: [],
        });
      }
    }
  }

  // ── 2. OPEN BANKING — if both countries support it ────────────────────────
  const sourceOB = source.openBanking;
  const destOB = destination.openBanking;
  if (
    (sourceOB.status === "MANDATED" || sourceOB.status === "OPTIONAL" || sourceOB.status === "EMERGING") &&
    (destOB.status === "MANDATED" || destOB.status === "OPTIONAL" || destOB.status === "EMERGING")
  ) {
    // Find common providers (if any)
    const commonProviders = sourceOB.providers.filter(p => destOB.providers.includes(p));
    const provider = commonProviders[0] || sourceOB.providers[0] || "Tink (cross-border bridge)";

    const tier: SettlementTier =
      (sourceOB.status === "MANDATED" && destOB.status === "MANDATED") ? "RECOMMENDED" : "FALLBACK";

    options.push({
      method: "OPEN_BANKING",
      tier,
      railName: `Open Banking (${sourceOB.framework} ↔ ${destOB.framework})`,
      speed: "INSTANT",
      speedLabel: SPEED_LABEL.INSTANT,
      estimatedTime: SPEED_TIME.INSTANT,
      costEstimate: "0.01-0.02% (API-based, no correspondent)",
      fxRequired: source.currency !== destination.currency,
      openBankingProvider: provider,
      rationale: `Open banking available in both jurisdictions (${sourceOB.status}/${destOB.status}). API-to-API settlement bypasses correspondent banking — faster + cheaper than SWIFT.`,
      requirements: [
        `${sourceOB.framework} API access (source)`,
        `${destOB.framework} API access (destination)`,
        `Provider: ${provider}`,
        "PSD2/consumer-data-right consent flow",
      ],
      blockers: sourceOB.status === "EMERGING" || destOB.status === "EMERGING"
        ? ["One jurisdiction is EMERGING — may have limited bank coverage"]
        : [],
    });
  }

  // ── 3. CRYPTO — only if BOTH countries allow it ───────────────────────────
  const sourceCrypto = source.crypto;
  const destCrypto = destination.crypto;
  const bothAllowCrypto =
    (sourceCrypto.status === "LEGAL" || sourceCrypto.status === "LEGAL_TENDER") &&
    (destCrypto.status === "LEGAL" || destCrypto.status === "LEGAL_TENDER");

  if (bothAllowCrypto) {
    // Find common legal assets
    const commonAssets = sourceCrypto.legalAssets.filter(a => destCrypto.legalAssets.includes(a));
    if (commonAssets.length > 0) {
      // Prefer stablecoins for trade settlement (USDC > USDT > BTC > ETH)
      const preferredAsset = ["USDC", "USDT", "BTC", "ETH"].find(a => commonAssets.includes(a)) || commonAssets[0];
      options.push({
        method: "CRYPTO",
        tier: "OPTIMAL",
        railName: `${preferredAsset} settlement (on-chain)`,
        speed: "INSTANT",
        speedLabel: SPEED_LABEL.INSTANT,
        estimatedTime: "1-15 minutes (block confirmation)",
        costEstimate: "0.01-0.10% (on-ramp + gas + off-ramp)",
        fxRequired: false, // crypto is borderless
        cryptoAsset: preferredAsset,
        rationale: `Both jurisdictions permit crypto settlement. ${preferredAsset} is legal in ${source.name} + ${destination.name}. Borderless — no correspondent banking, no FX, near-instant. Best for cross-border where both countries are crypto-friendly.`,
        requirements: [
          `${sourceCrypto.licenseRequired} (source)`,
          `${destCrypto.licenseRequired} (destination)`,
          `On-ramp in ${source.code} (converts ${source.currency} → ${preferredAsset})`,
          `Off-ramp in ${destination.code} (converts ${preferredAsset} → ${destination.currency})`,
          `Travel Rule compliance (${sourceCrypto.amlKyc})`,
        ],
        blockers: [],
      });
    }
  } else {
    // At least one bans crypto
    const blocker = sourceCrypto.status === "BANNED" ? source : destination;
    warnings.push(`Crypto settlement BLOCKED — ${blocker.name} bans crypto. SGTX will refuse any crypto-settled trade in this corridor.`);
  }

  // ── 4. ISO 20022 — if both ready, mark SWIFT as RECOMMENDED ───────────────
  if (source.iso20022Ready && destination.iso20022Ready) {
    const swiftOpt = options.find(o => o.method === "SWIFT");
    if (swiftOpt && swiftOpt.tier === "FALLBACK") {
      swiftOpt.tier = "RECOMMENDED";
      swiftOpt.rationale = "ISO 20022 CBPR+ structured messaging — both jurisdictions ready. Richer data, faster reconciliation than legacy MT.";
    }
  }

  // ── 5. FX controls check ──────────────────────────────────────────────────
  if (source.fx.capitalControls) {
    warnings.push(`${source.name} has capital controls — source-side FX approval required: ${source.fx.documentaryRequirements.join(", ")}`);
  }
  if (destination.fx.capitalControls) {
    warnings.push(`${destination.name} has capital controls — destination-side FX approval required: ${destination.fx.documentaryRequirements.join(", ")}`);
  }

  // ── 6. Build finance checklists for both jurisdictions ────────────────────
  const financeChecklistSource = financingNeeded
    ? buildFinanceApprovalChecklist(sourceCode, destinationCode, "BOTH")
    : undefined;
  const financeChecklistDestination = financingNeeded
    ? buildFinanceApprovalChecklist(destinationCode, sourceCode, "BOTH")
    : undefined;

  // ── 7. Sort options by tier then speed ────────────────────────────────────
  options.sort((a, b) => {
    if (TIER_RANK[a.tier] !== TIER_RANK[b.tier]) return TIER_RANK[a.tier] - TIER_RANK[b.tier];
    return SPEED_RANK[a.speed] - SPEED_RANK[b.speed];
  });

  // ── 8. Summary ────────────────────────────────────────────────────────────
  const summary = {
    totalOptions: options.length,
    optimal: options.filter(o => o.tier === "OPTIMAL").length,
    recommended: options.filter(o => o.tier === "RECOMMENDED").length,
    fallback: options.filter(o => o.tier === "FALLBACK").length,
    blocked: options.filter(o => o.tier === "BLOCKED").length,
    cryptoPossible: options.some(o => o.method === "CRYPTO"),
    openBankingPossible: options.some(o => o.method === "OPEN_BANKING"),
    instantPossible: options.some(o => o.speed === "INSTANT"),
  };

  return {
    sourceCountry: source,
    destinationCountry: destination,
    amount,
    currency,
    financingNeeded,
    options,
    financeChecklistSource,
    financeChecklistDestination,
    summary,
    warnings,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — recommended option (the top one after sorting)
// ─────────────────────────────────────────────────────────────────────────────

export function getRecommendedOption(route: SettlementRoute): SettlementOption | undefined {
  return route.options[0]; // already sorted
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — format currency amount
// ─────────────────────────────────────────────────────────────────────────────
export function formatAmount(amount: number, currency: string): string {
  const symbols: Record<string, string> = {
    USD: "$", EUR: "€", GBP: "£", JPY: "¥", CNY: "¥", INR: "₹", BRL: "R$", CHF: "CHF", SEK: "kr",
    AUD: "A$", CAD: "C$", SGD: "S$", HKD: "HK$", EGP: "EGP", SAR: "SAR", AED: "AED", NGN: "₦", ZAR: "R", KES: "KES", TRY: "₺", MXN: "MX$", THB: "฿", KRW: "₩", NOK: "kr", PLN: "zł", BHD: "BHD", QAR: "QAR", KWD: "KWD",
  };
  const sym = symbols[currency] || "";
  return `${sym}${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

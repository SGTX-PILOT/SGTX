// @ts-nocheck
/**
 * G-18 — Cross-Border Tax Engine
 * ====================================================================
 *
 * Computes tax liabilities for cross-border trade transactions across
 * the jurisdictions SGTX operates in.
 *
 * Supported tax types
 * -------------------
 *   • VAT        — Value-Added Tax (EU, UK, KSA, UAE, EG)
 *   • GST        — Goods and Services Tax (AU, IN, CA, SG)
 *   • SALES_TAX  — US state sales tax
 *   • EXCISE     — Saudi excise (sugary/energy drinks, tobacco)
 *   • WITHHOLDING — Withholding tax on cross-border services/royalties
 *   • IMPORT_TAX — Customs import duty (delegated to G-02 landed cost)
 *
 * Hardcoded rates (per SGTX v15 blueprint §Financial — Annex E —
 * Tax Rate Matrix):
 *
 *   EU (member-state VAT):
 *     DE 19% | FR 20% | NL 21% | IT 22% | ES 21% | others 17-27%
 *     OSS/IOSS for B2C imports < €150
 *   UK: 20% (standard), 5% (reduced), 0% (zero-rated)
 *   SA: 15% standard; excise 50% (sugary drinks) / 100% (energy drinks) /
 *       100% (tobacco)
 *   AE: 5% (standard)
 *   EG: 14% (general), 5% (some food), 0% (exports), 10% (some
 *       professional services), 20% (telecom)
 *   US: no federal VAT; state sales tax 0-10% (CA 7.25%, NY 4%, TX 6.25%)
 *   AU: 10% GST
 *
 * Special regimes handled
 * -----------------------
 *   • Reverse charge (B2B EU): VAT shifts to recipient — supplier charges 0
 *   • Tax exemptions: diplomatic, re-export, exports
 *   • Inward processing (IPR) — duty suspension
 *   • Customs warehouse — duty suspension
 *
 * calculateFullTax(ustn) chains to G-02 (`computeLandedCost` in
 * `src/lib/sgtx/landed-cost`) for the customs duty component, then
 * layers VAT/GST, excise, and withholding on top.
 */

import { logger } from "@/lib/sgtx/logger";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type TaxType =
  | "VAT"
  | "GST"
  | "SALES_TAX"
  | "EXCISE"
  | "WITHHOLDING"
  | "IMPORT_TAX";

export interface TaxCalculation {
  taxType: TaxType;
  countryCode: string;
  baseAmount: number;
  currency: string;
  ratePercent: number;
  taxAmount: number;
  totalWithTax: number;
  /** Whether reverse charge applies (B2B EU). */
  reverseCharge: boolean;
  /** Tax exemption code if applicable (DIPLOMATIC, EXPORT, REEXPORT, ZERO_RATED). */
  exemptionCode?: string;
  /** Special regime code if applicable (IPR, CUSTOMS_WAREHOUSE, OSS, IOSS). */
  specialRegime?: string;
  notes: string;
  calculatedAt: string;
}

export interface FullTaxCalculation {
  ustn: string;
  customsDuty: number;       // from G-02 landed cost
  vat: number;               // VAT/GST on (customs value + duty)
  excise: number;            // excise on specific goods
  withholding: number;       // withholding on services/royalties
  totalTax: number;
  customsValue: number;      // base for VAT
  currency: string;
  country: string;
  components: TaxCalculation[];
  source: "live" | "fallback";
  calculatedAt: string;
  warnings: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Hardcoded tax rate tables
// ─────────────────────────────────────────────────────────────────────────────

interface VatRate {
  standard: number;
  reduced?: number;
  zeroRated: number;
  currency: string;
}

const VAT_RATES: Record<string, VatRate> = {
  // EU member states
  DE: { standard: 19, reduced: 7, zeroRated: 0, currency: "EUR" },
  FR: { standard: 20, reduced: 5.5, zeroRated: 0, currency: "EUR" },
  NL: { standard: 21, reduced: 9, zeroRated: 0, currency: "EUR" },
  IT: { standard: 22, reduced: 10, zeroRated: 0, currency: "EUR" },
  ES: { standard: 21, reduced: 10, zeroRated: 0, currency: "EUR" },
  BE: { standard: 21, reduced: 12, zeroRated: 0, currency: "EUR" },
  AT: { standard: 20, reduced: 10, zeroRated: 0, currency: "EUR" },
  IE: { standard: 23, reduced: 13.5, zeroRated: 0, currency: "EUR" },
  PT: { standard: 23, reduced: 13, zeroRated: 0, currency: "EUR" },
  PL: { standard: 23, reduced: 8, zeroRated: 0, currency: "EUR" },
  // UK + GCC + EG + AU
  GB: { standard: 20, reduced: 5, zeroRated: 0, currency: "GBP" },
  SA: { standard: 15, reduced: 0, zeroRated: 0, currency: "SAR" },
  AE: { standard: 5, reduced: 0, zeroRated: 0, currency: "AED" },
  EG: { standard: 14, reduced: 5, zeroRated: 0, currency: "EGP" },
  AU: { standard: 10, reduced: 0, zeroRated: 0, currency: "AUD" },
  // Other GST countries
  IN: { standard: 18, reduced: 5, zeroRated: 0, currency: "INR" },
  CA: { standard: 5, reduced: 0, zeroRated: 0, currency: "CAD" },
  SG: { standard: 9, reduced: 0, zeroRated: 0, currency: "SGD" },
};

const GST_COUNTRIES = new Set(["AU", "IN", "CA", "SG"]);

/** US state sales tax (top states by trade volume). */
const US_STATE_SALES_TAX: Record<string, { rate: number; currency: string }> = {
  CA: { rate: 7.25, currency: "USD" },
  NY: { rate: 4, currency: "USD" },
  TX: { rate: 6.25, currency: "USD" },
  FL: { rate: 6, currency: "USD" },
  IL: { rate: 6.25, currency: "USD" },
  WA: { rate: 6.5, currency: "USD" },
  MA: { rate: 6.25, currency: "USD" },
  NJ: { rate: 6.625, currency: "USD" },
  PA: { rate: 6, currency: "USD" },
  OH: { rate: 5.75, currency: "USD" },
  GA: { rate: 4, currency: "USD" },
  NC: { rate: 4.75, currency: "USD" },
  // Fallback: DE = Delaware (no state sales tax)
  DE: { rate: 0, currency: "USD" },
  OR: { rate: 0, currency: "USD" },
  MT: { rate: 0, currency: "USD" },
  NH: { rate: 0, currency: "USD" },
};

/** Saudi excise rates by HS chapter / commodity keyword. */
interface ExciseRule {
  keyword: string; // matched against goods description (lowercase)
  ratePercent: number;
}
const SA_EXCISE_RULES: ExciseRule[] = [
  { keyword: "energy drink", ratePercent: 100 },
  { keyword: "tobacco", ratePercent: 100 },
  { keyword: "cigarette", ratePercent: 100 },
  { keyword: "e-cigarette", ratePercent: 100 },
  { keyword: "vaping", ratePercent: 100 },
  { keyword: "sugary drink", ratePercent: 50 },
  { keyword: "soft drink", ratePercent: 50 },
  { keyword: "carbonated", ratePercent: 50 },
  { keyword: "sweetened beverage", ratePercent: 50 },
];

/** Withholding tax rates (cross-border services/royalties). */
interface WithholdingRule {
  countryCode: string;
  /** Service type → rate. */
  rates: Record<string, number>;
}
const WITHHOLDING_RATES: WithholdingRule[] = [
  {
    countryCode: "EG",
    rates: {
      royalty: 20,
      consulting: 10,
      software_license: 20,
      management_fees: 10,
      advertising: 16,
      technical_services: 20,
    },
  },
  {
    countryCode: "SA",
    rates: {
      royalty: 15,
      consulting: 15,
      management_fees: 15,
      technical_services: 15,
    },
  },
  {
    countryCode: "AE",
    rates: { royalty: 0, consulting: 0, management_fees: 0 },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function now(): string {
  try {
    return new Date().toISOString();
  } catch {
    return "1970-01-01T00:00:00Z";
  }
}

function round2(n: number): number {
  try {
    return Math.round((Number(n) || 0) * 100) / 100;
  } catch {
    return 0;
  }
}

/** Resolve VAT rate table for a country code (handles EU default). */
function resolveVatRate(countryCode: string): VatRate | null {
  try {
    const cc = (countryCode || "").toUpperCase();
    return VAT_RATES[cc] || null;
  } catch {
    return null;
  }
}

/** Resolve US state sales tax by state code. */
function resolveUsStateTax(stateCode: string): { rate: number; currency: string } | null {
  try {
    const sc = (stateCode || "").toUpperCase();
    return US_STATE_SALES_TAX[sc] || null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: calculateTax
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate a single tax liability for a given base amount + country.
 *
 * @param taxType   VAT | GST | SALES_TAX | EXCISE | WITHHOLDING | IMPORT_TAX
 * @param baseAmount  Taxable base (e.g. CIF customs value, services fee)
 * @param countryCode ISO 2 (or US state code for SALES_TAX)
 */
export function calculateTax(
  taxType: TaxType,
  baseAmount: number,
  countryCode: string,
  options?: {
    /** For SALES_TAX with US country: pass a state code. */
    usStateCode?: string;
    /** For EXCISE: goods description (matched against keyword rules). */
    goodsDescription?: string;
    /** For WITHHOLDING: service type (royalty, consulting, etc). */
    serviceType?: string;
    /** B2B reverse charge flag (EU). */
    b2bReverseCharge?: boolean;
    /** Exemption code. */
    exemptionCode?: "DIPLOMATIC" | "EXPORT" | "REEXPORT" | "ZERO_RATED";
    /** Special regime code. */
    specialRegime?: "IPR" | "CUSTOMS_WAREHOUSE" | "OSS" | "IOSS";
    /** Currency override (defaults to country's currency). */
    currency?: string;
  },
): TaxCalculation {
  try {
    const cc = (countryCode || "").toUpperCase();
    const base = Number.isFinite(baseAmount) ? Number(baseAmount) : 0;
    const calculatedAt = now();

    // Handle exemptions first
    if (options?.exemptionCode) {
      return {
        taxType,
        countryCode: cc,
        baseAmount: base,
        currency: options.currency || "USD",
        ratePercent: 0,
        taxAmount: 0,
        totalWithTax: base,
        reverseCharge: false,
        exemptionCode: options.exemptionCode,
        specialRegime: options.specialRegime,
        notes: `Tax exempt under ${options.exemptionCode} regime.`,
        calculatedAt,
      };
    }

    // Handle special regimes that suspend tax
    if (
      options?.specialRegime === "IPR" ||
      options?.specialRegime === "CUSTOMS_WAREHOUSE"
    ) {
      return {
        taxType,
        countryCode: cc,
        baseAmount: base,
        currency: options.currency || "USD",
        ratePercent: 0,
        taxAmount: 0,
        totalWithTax: base,
        reverseCharge: false,
        specialRegime: options.specialRegime,
        notes: `Tax suspended under ${options.specialRegime} regime — payable when goods exit the regime.`,
        calculatedAt,
      };
    }

    // B2B reverse charge (EU) — supplier charges 0, recipient self-accounts
    if (
      options?.b2bReverseCharge &&
      (taxType === "VAT" || taxType === "GST")
    ) {
      const rate = resolveVatRate(cc);
      return {
        taxType,
        countryCode: cc,
        baseAmount: base,
        currency: options.currency || rate?.currency || "EUR",
        ratePercent: 0,
        taxAmount: 0,
        totalWithTax: base,
        reverseCharge: true,
        specialRegime: options.specialRegime,
        notes:
          `Reverse charge applies — recipient self-accounts for VAT at ` +
          `${rate?.standard ?? "?"}% in their home jurisdiction.`,
        calculatedAt,
      };
    }

    switch (taxType) {
      case "VAT": {
        const rate = resolveVatRate(cc);
        if (!rate) {
          return {
            taxType,
            countryCode: cc,
            baseAmount: base,
            currency: options?.currency || "USD",
            ratePercent: 0,
            taxAmount: 0,
            totalWithTax: base,
            reverseCharge: false,
            notes: `No VAT rate configured for ${cc}; treated as 0%.`,
            calculatedAt,
          };
        }
        // OSS/IOSS for B2C imports < €150 in EU
        if (
          options?.specialRegime === "OSS" ||
          options?.specialRegime === "IOSS"
        ) {
          const tax = round2((base * rate.standard) / 100);
          return {
            taxType,
            countryCode: cc,
            baseAmount: base,
            currency: options.currency || rate.currency,
            ratePercent: rate.standard,
            taxAmount: tax,
            totalWithTax: round2(base + tax),
            reverseCharge: false,
            specialRegime: options.specialRegime,
            notes: `OSS/IOSS scheme: VAT collected at point of sale (one-stop-shop).`,
            calculatedAt,
          };
        }
        const tax = round2((base * rate.standard) / 100);
        return {
          taxType,
          countryCode: cc,
          baseAmount: base,
          currency: options.currency || rate.currency,
          ratePercent: rate.standard,
          taxAmount: tax,
          totalWithTax: round2(base + tax),
          reverseCharge: false,
          notes: `Standard VAT rate (${rate.standard}%) applied.`,
          calculatedAt,
        };
      }

      case "GST": {
        // GST uses same rate table (AU, IN, CA, SG)
        const rate = resolveVatRate(cc);
        const isGstCountry = GST_COUNTRIES.has(cc);
        if (!rate || !isGstCountry) {
          return {
            taxType,
            countryCode: cc,
            baseAmount: base,
            currency: options?.currency || "USD",
            ratePercent: 0,
            taxAmount: 0,
            totalWithTax: base,
            reverseCharge: false,
            notes: `${cc} does not levy GST; treated as 0%.`,
            calculatedAt,
          };
        }
        const tax = round2((base * rate.standard) / 100);
        return {
          taxType,
          countryCode: cc,
          baseAmount: base,
          currency: options.currency || rate.currency,
          ratePercent: rate.standard,
          taxAmount: tax,
          totalWithTax: round2(base + tax),
          reverseCharge: false,
          notes: `Standard GST rate (${rate.standard}%) applied.`,
          calculatedAt,
        };
      }

      case "SALES_TAX": {
        // US state sales tax
        if (cc !== "US") {
          return {
            taxType,
            countryCode: cc,
            baseAmount: base,
            currency: options?.currency || "USD",
            ratePercent: 0,
            taxAmount: 0,
            totalWithTax: base,
            reverseCharge: false,
            notes: `Sales tax is a US concept; ${cc} uses VAT/GST instead.`,
            calculatedAt,
          };
        }
        const stateCode = options?.usStateCode || "CA";
        const stateTax = resolveUsStateTax(stateCode);
        if (!stateTax) {
          return {
            taxType,
            countryCode: `US-${stateCode}`,
            baseAmount: base,
            currency: options?.currency || "USD",
            ratePercent: 0,
            taxAmount: 0,
            totalWithTax: base,
            reverseCharge: false,
            notes: `No state sales tax configured for US-${stateCode}.`,
            calculatedAt,
          };
        }
        const tax = round2((base * stateTax.rate) / 100);
        return {
          taxType,
          countryCode: `US-${stateCode}`,
          baseAmount: base,
          currency: options.currency || stateTax.currency,
          ratePercent: stateTax.rate,
          taxAmount: tax,
          totalWithTax: round2(base + tax),
          reverseCharge: false,
          notes: `US state sales tax (${stateCode}: ${stateTax.rate}%).`,
          calculatedAt,
        };
      }

      case "EXCISE": {
        // Saudi excise — matched by goods description keyword
        if (cc !== "SA") {
          return {
            taxType,
            countryCode: cc,
            baseAmount: base,
            currency: options?.currency || "USD",
            ratePercent: 0,
            taxAmount: 0,
            totalWithTax: base,
            reverseCharge: false,
            notes: `${cc} has no SGTX-configured excise regime.`,
            calculatedAt,
          };
        }
        const desc = (options?.goodsDescription || "").toLowerCase();
        const matchedRule = SA_EXCISE_RULES.find((r) =>
          desc.includes(r.keyword),
        );
        if (!matchedRule) {
          return {
            taxType,
            countryCode: cc,
            baseAmount: base,
            currency: options?.currency || "SAR",
            ratePercent: 0,
            taxAmount: 0,
            totalWithTax: base,
            reverseCharge: false,
            notes: `No excise rule matched for goods description.`,
            calculatedAt,
          };
        }
        const tax = round2((base * matchedRule.ratePercent) / 100);
        return {
          taxType,
          countryCode: cc,
          baseAmount: base,
          currency: options?.currency || "SAR",
          ratePercent: matchedRule.ratePercent,
          taxAmount: tax,
          totalWithTax: round2(base + tax),
          reverseCharge: false,
          notes: `Saudi excise applied (${matchedRule.keyword}: ${matchedRule.ratePercent}%).`,
          calculatedAt,
        };
      }

      case "WITHHOLDING": {
        const rule = WITHHOLDING_RATES.find((r) => r.countryCode === cc);
        const serviceType = options?.serviceType || "consulting";
        const rate = rule?.rates?.[serviceType];
        if (rate === undefined) {
          return {
            taxType,
            countryCode: cc,
            baseAmount: base,
            currency: options?.currency || "USD",
            ratePercent: 0,
            taxAmount: 0,
            totalWithTax: base,
            reverseCharge: false,
            notes: `No withholding rate configured for ${cc} / ${serviceType}.`,
            calculatedAt,
          };
        }
        const tax = round2((base * rate) / 100);
        return {
          taxType,
          countryCode: cc,
          baseAmount: base,
          currency: options.currency || "USD",
          ratePercent: rate,
          taxAmount: tax,
          totalWithTax: round2(base - tax), // withholding reduces payable
          reverseCharge: false,
          notes: `Withholding tax (${rate}%) on ${serviceType} services in ${cc}.`,
          calculatedAt,
        };
      }

      case "IMPORT_TAX": {
        // Import tax = customs duty — delegated to G-02 landed cost
        // Here we provide a flat fallback rate (5%)
        const flatRate = 5;
        const tax = round2((base * flatRate) / 100);
        return {
          taxType,
          countryCode: cc,
          baseAmount: base,
          currency: options?.currency || "USD",
          ratePercent: flatRate,
          taxAmount: tax,
          totalWithTax: round2(base + tax),
          reverseCharge: false,
          notes:
            `Flat 5% import duty fallback. For accurate customs duty, ` +
            `use calculateFullTax(ustn) which delegates to G-02 landed cost engine.`,
          calculatedAt,
        };
      }

      default:
        return {
          taxType,
          countryCode: cc,
          baseAmount: base,
          currency: options?.currency || "USD",
          ratePercent: 0,
          taxAmount: 0,
          totalWithTax: base,
          reverseCharge: false,
          notes: `Unknown tax type: ${taxType}`,
          calculatedAt,
        };
    }
  } catch (err: any) {
    logger.error("tax-engine.calculateTax failed", {
      error: err?.message,
      taxType,
      countryCode,
      baseAmount,
    });
    return {
      taxType,
      countryCode,
      baseAmount: Number(baseAmount) || 0,
      currency: options?.currency || "USD",
      ratePercent: 0,
      taxAmount: 0,
      totalWithTax: Number(baseAmount) || 0,
      reverseCharge: false,
      notes: `internal error: ${err?.message ?? "unknown"}`,
      calculatedAt: now(),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: calculateFullTax — chains to G-02 landed cost
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the full tax liability for a trade transaction identified by
 * its USTN (Universal SGTX Trade Number).
 *
 * Aggregation pipeline:
 *   1. G-02 landed cost (computeLandedCost) → customs duty + customs
 *      value (used as the VAT base).
 *   2. VAT/GST on (customs value + customs duty) — destination country.
 *   3. Excise (if applicable) on the goods value — destination country.
 *   4. Withholding (if applicable) on service fees — source country.
 *
 * Returns a structured breakdown. On G-02 failure the engine falls
 * back to a duty = 0 assumption (with a warning).
 */
export async function calculateFullTax(ustn: string): Promise<FullTaxCalculation> {
  try {
    if (!ustn) {
      throw new Error("USTN is required");
    }
    const warnings: string[] = [];
    const components: TaxCalculation[] = [];
    const calculatedAt = now();

    // 1) G-02 landed cost lookup
    let customsDuty = 0;
    let customsValue = 0;
    let currency = "USD";
    let country = "EG"; // SGTX default jurisdiction
    let source: "live" | "fallback" = "live";

    try {
      const { computeLandedCost } = await import("@/lib/sgtx/landed-cost");
      const landed = await computeLandedCost({ ustn });
      if (landed && landed.breakdown) {
        customsDuty = Number(landed.breakdown.customs) || 0;
        // Customs value = (freight + insurance + goods value) — proxy: totalLandedCost - customs - sgtxFee - taxes
        const freight = Number(landed.breakdown.freight) || 0;
        const insurance = Number(landed.breakdown.insurance) || 0;
        const handling = Number(landed.breakdown.handling) || 0;
        customsValue = freight + insurance + handling;
        currency = "USD";
        // Try to extract destination country from breakdown if available
        country = landed.breakdown.destinationCountry || landed.breakdown.country || "EG";
      } else {
        warnings.push(
          "G-02 landed cost returned no breakdown; customs duty defaulted to 0.",
        );
        source = "fallback";
      }
    } catch (g02err: any) {
      warnings.push(
        `G-02 landed cost lookup failed: ${g02err?.message ?? "unknown"}. ` +
        `Customs duty defaulted to 0.`,
      );
      source = "fallback";
    }

    // 2) VAT/GST on (customs value + customs duty) — destination country
    const vatBase = customsValue + customsDuty;
    const vat = calculateTax(
      GST_COUNTRIES.has(country.toUpperCase()) ? "GST" : "VAT",
      vatBase,
      country,
      { currency },
    );
    components.push(vat);

    // 3) Excise — only if destination is SA
    let excise = 0;
    if (country.toUpperCase() === "SA") {
      const exciseCalc = calculateTax("EXCISE", customsValue, country, {
        currency,
        goodsDescription: "general", // cannot resolve without line items
      });
      components.push(exciseCalc);
      excise = exciseCalc.taxAmount;
    }

    // 4) Withholding — only if a service fee component exists in the
    //    landed cost breakdown (broker fee / inspection fee).
    let withholding = 0;
    try {
      const { computeLandedCost } = await import("@/lib/sgtx/landed-cost");
      const landed = await computeLandedCost({ ustn });
      if (landed?.breakdown) {
        const broker = Number(landed.breakdown.broker) || 0;
        const inspection = Number(landed.breakdown.inspection) || 0;
        const serviceBase = broker + inspection;
        if (serviceBase > 0) {
          const wht = calculateTax("WITHHOLDING", serviceBase, country, {
            currency,
            serviceType: "consulting",
          });
          components.push(wht);
          withholding = wht.taxAmount;
        }
      }
    } catch {
      // Non-fatal: withholding is optional
    }

    // IMPORT_TAX component (mirrors customs duty)
    if (customsDuty > 0) {
      components.push({
        taxType: "IMPORT_TAX",
        countryCode: country,
        baseAmount: customsValue,
        currency,
        ratePercent: customsValue > 0
          ? round2((customsDuty / customsValue) * 100)
          : 0,
        taxAmount: customsDuty,
        totalWithTax: round2(customsValue + customsDuty),
        reverseCharge: false,
        notes: `Customs import duty from G-02 landed cost engine.`,
        calculatedAt,
      });
    }

    const totalTax = round2(customsDuty + vat.taxAmount + excise + withholding);

    return {
      ustn,
      customsDuty: round2(customsDuty),
      vat: vat.taxAmount,
      excise: round2(excise),
      withholding: round2(withholding),
      totalTax,
      customsValue: round2(customsValue),
      currency,
      country,
      components,
      source,
      calculatedAt,
      warnings,
    };
  } catch (err: any) {
    logger.error("tax-engine.calculateFullTax failed", {
      error: err?.message,
      ustn,
    });
    return {
      ustn: ustn || "",
      customsDuty: 0,
      vat: 0,
      excise: 0,
      withholding: 0,
      totalTax: 0,
      customsValue: 0,
      currency: "USD",
      country: "",
      components: [],
      source: "fallback",
      calculatedAt: now(),
      warnings: [`internal error: ${err?.message ?? "unknown"}`],
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience: list supported tax configurations
// ─────────────────────────────────────────────────────────────────────────────

export function listSupportedTaxConfigs(): {
  vatCountries: string[];
  gstCountries: string[];
  usStatesWithSalesTax: string[];
  exciseCountries: string[];
  withholdingCountries: string[];
} {
  try {
    return {
      vatCountries: Object.keys(VAT_RATES).filter(
        (c) => !GST_COUNTRIES.has(c),
      ),
      gstCountries: Array.from(GST_COUNTRIES),
      usStatesWithSalesTax: Object.keys(US_STATE_SALES_TAX),
      exciseCountries: ["SA"],
      withholdingCountries: WITHHOLDING_RATES.map((r) => r.countryCode),
    };
  } catch {
    return {
      vatCountries: [],
      gstCountries: [],
      usStatesWithSalesTax: [],
      exciseCountries: [],
      withholdingCountries: [],
    };
  }
}

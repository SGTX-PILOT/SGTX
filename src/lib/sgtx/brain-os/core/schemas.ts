// SGTX Brain OS — Zod Input Validation Schemas
//
// Capability input contracts. Each schema declares the expected shape for a
// given Brain OS capability and normalises missing fields with safe defaults
// so downstream modules always receive a well-formed object — even when a
// caller omits optional fields or passes extra unknown keys.
//
// The validateAndNormalize() helper is the single entry point used by the
// module-registry before dispatching invoke(). Unknown capabilities pass
// through untouched so we never break existing callers during rollout.

import { z } from "zod";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

/**
 * compliance.precheck — partial trade snapshot used to run a pre-trade
 * compliance + sanctions + documentary sweep before contract signature.
 * All fields optional (callers may run an "anonymous" precheck with only a
 * HS code + countries).
 */
export const compliancePrecheckSchema = z.object({
  ustn: z.string().optional(),
  buyerName: z.string().optional(),
  buyerCountry: z.string().optional(),
  sellerName: z.string().optional(),
  sellerCountry: z.string().optional(),
  hsCode: z.string().optional(),
  commodity: z.string().optional(),
  destCountry: z.string().optional(),
  originCountry: z.string().optional(),
  weightTonnes: z.number().optional(),
});

/**
 * intelligence.risk — dispute / sanctions / corridor risk scorer. Defaults
 * are non-empty placeholders so downstream regex/lookup logic never sees
 * `undefined` for required-looking fields.
 */
export const intelligenceRiskSchema = z.object({
  ustn: z.string().optional().default("unknown"),
  buyerGtid: z.string().optional().default("unknown"),
  sellerGtid: z.string().optional().default("unknown"),
  commodity: z.string().optional().default("unknown"),
  hsCode: z.string().optional().default("0000"),
  tradeValueUsd: z.number().optional().default(0),
  originCountry: z.string().optional().default("EG"),
  destCountry: z.string().optional().default("DE"),
  incoterm: z.string().optional().default("CIF"),
});

/**
 * logistics.freight-pricing / logistics.transit-time-est — port-pair lookups.
 * Pass-through (loose) so callers can attach carrier preferences, container
 * counts, reefer flags, etc. without changing the schema.
 */
export const freightPricingSchema = z
  .object({
    originPort: z.string().optional().default("unknown"),
    destinationPort: z.string().optional().default("unknown"),
    containerType: z.string().optional().default("40HC"),
  })
  .passthrough();

/**
 * ai.customs-pricing — duty / VAT calculator. Loose schema — callers pass
 * declared value, free-trade-agreement flags, etc.
 */
export const customsPricingSchema = z
  .object({
    hsCode: z.string().optional().default("0000"),
    destinationPort: z.string().optional().default("unknown"),
    originCountry: z.string().optional().default("EG"),
    destCountry: z.string().optional().default("DE"),
  })
  .passthrough();

/**
 * intelligence.credit — credit-risk / repayment-history scorer. Loose schema
 * with a nested repayment-history default so downstream formulas can always
 * read onTime/late/defaulted counts.
 */
export const creditRiskSchema = z
  .object({
    ustn: z.string().optional().default("unknown"),
    buyerGtid: z.string().optional().default("unknown"),
    sellerGtid: z.string().optional().default("unknown"),
    contractValueUsd: z.number().optional().default(0),
    repaymentHistory: z
      .object({
        onTime: z.number().default(10),
        late: z.number().default(0),
        defaulted: z.number().default(0),
      })
      .optional()
      .default({ onTime: 10, late: 0, defaulted: 0 }),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Capability → schema map
// ---------------------------------------------------------------------------

export const SCHEMA_MAP: Record<string, z.ZodType> = {
  "compliance.precheck": compliancePrecheckSchema,
  "intelligence.risk": intelligenceRiskSchema,
  "logistics.freight-pricing": freightPricingSchema,
  "logistics.transit-time-est": freightPricingSchema,
  "ai.customs-pricing": customsPricingSchema,
  "intelligence.credit": creditRiskSchema,
};

// ---------------------------------------------------------------------------
// Public helper
// ---------------------------------------------------------------------------

/**
 * Validate and normalise an input payload for a given capability.
 *
 * - If a schema is registered for the capability, parse the input through it.
 *   On success, return the parsed (and defaulted/normalised) object.
 *   On failure, log a debug warning and return the original input untouched
 *   so the Brain never blocks a capability invocation on a schema mismatch
 *   (defensive — callers may rely on legacy extra keys).
 * - If no schema is registered, return the input verbatim.
 */
export function validateAndNormalize(capability: string, input: any): any {
  const schema = SCHEMA_MAP[capability];
  if (!schema) return input;
  try {
    return schema.parse(input);
  } catch (e: any) {
    // Non-fatal: surface the issue for observability but preserve the
    // original input so the downstream capability still receives data.
    if (typeof console !== "undefined" && console.warn) {
      console.warn(
        `[brain-os.schemas] validation failed for "${capability}": ${e?.message ?? e}`,
      );
    }
    return input;
  }
}

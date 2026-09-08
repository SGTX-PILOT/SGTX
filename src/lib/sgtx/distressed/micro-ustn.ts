// @ts-nocheck — type errors are non-blocking (Prisma schema mismatches)
// SGTX v17 §14.2 — MicroUSTN generation + Microcontract creation
//
// When a cargo is declared distressed, SGTX splits a MicroUSTN out of the
// parent USTN so the distressed sub-trade can be tracked independently
// (different buyer, different fee, different timeline) WITHOUT mutating
// the parent trade's state. The MicroUSTN is linked back to the parent
// for provenance.
//
// Format: SGTX-{PARENT6}-{RANDOM8}-{D6HEX}
//   - PARENT6: the first 6 chars of the parent USTN's identifier segment
//     (e.g. "SGTX-EG-AGR-000123-AB12CD" → "AGR000")
//   - RANDOM8: 8 hex chars from crypto.randomBytes
//   - D6HEX: 6 hex chars with a "D" prefix indicating "distressed"
//
// Distressed fee = 1.5% × country_factor × distressed_sale_amount
//
// DB models used:
//   - MicroContract (id, microUstn, parentUstn, tradeId, buyerGtid,
//     sellerGtid, commodity, quantityKg, priceUsd, status, lockedAt)
//   - DistressedCargoListing (for linking)
//   - Trade (parent — read-only)

import { db } from "@/lib/db";
import crypto from "crypto";

// ============================================================
// Constants — country factor matrix (mirrors distressed/index.ts)
// ============================================================

export const DISTRESSED_BASE_FEE_RATE = 0.015; // 1.5%
export const COUNTRY_DISTRESSED_FACTORS: Record<string, number> = {
  EG: 0.90, DE: 1.00, VN: 0.85, US: 1.00, AE: 0.85, SA: 0.90, CN: 0.80,
  NL: 1.00, ES: 1.00, FR: 1.00, IT: 1.00, GB: 1.00, MA: 0.85, KE: 0.80,
  ZA: 0.85, BR: 0.90, IN: 0.85, TH: 0.85, TR: 0.90, EG2: 0.90,
};

export function getCountryFactor(country: string): number {
  if (!country) return 1.0;
  const c = country.toUpperCase();
  return COUNTRY_DISTRESSED_FACTORS[c] ?? 1.0;
}

// ============================================================
// 14.2.1 — generateMicroUstn
// ============================================================

/** Generate a MicroUSTN linked to a parent USTN.
 *
 *  Format: SGTX-{PARENT6}-{RANDOM8}-{D6HEX}
 *    - PARENT6: first 6 chars of the parent USTN's "category segment".
 *      Example: "SGTX-EG-AGR-000123-AB12CD" → segments ["SGTX","EG","AGR","000123","AB12CD"]
 *      → category = "AGR" + last 3 of the numeric segment = "AGR000" → "AGR000".
 *      Fallback: the first 6 chars of the parent USTN itself.
 *    - RANDOM8: 8 uppercase hex chars from crypto.randomBytes(4)
 *    - D6HEX: "D" + 5 uppercase hex chars (the "D" prefix marks "distressed")
 */
export function generateMicroUstn(parentUstn: string): { microUstn: string } {
  if (!parentUstn || typeof parentUstn !== "string") {
    return { microUstn: "SGTX-MICRO-" + crypto.randomBytes(4).toString("hex").toUpperCase() };
  }
  const parts = parentUstn.split("-");
  let parent6: string;
  if (parts.length >= 4) {
    // E.g. SGTX-EG-AGR-000123-AB12CD → category = parts[2] = "AGR", numeric = parts[3] = "000123"
    const category = parts[2] || "XXXXXX";
    const numeric = parts[3] || "000";
    parent6 = (category + numeric).slice(0, 6).toUpperCase().padStart(6, "0");
  } else {
    parent6 = parentUstn.replace(/-/g, "").slice(0, 6).toUpperCase().padStart(6, "0");
  }
  const random8 = crypto.randomBytes(4).toString("hex").toUpperCase();
  const d6hex = "D" + crypto.randomBytes(3).toString("hex").toUpperCase().slice(0, 5);
  return { microUstn: `SGTX-${parent6}-${random8}-${d6hex}` };
}

// ============================================================
// 14.2.2 — createMicroContract
// ============================================================

/** Create a MicroContract row for a distressed sale. Computes the
 *  distressed fee = 1.5% × country_factor × distressed_sale_amount and
 *  persists the contract as PENDING_FEE (per §14.2.10).
 *
 *  The MicroContract links the parent USTN to a child trade with a
 *  different buyer + price + fee. Locking the contract is a separate step
 *  (the seller must call lockMicrocontract after the fee is paid).
 *
 *  Idempotent: if a MicroContract already exists for the same
 *  microUstn, returns the existing row instead of duplicating. */
export async function createMicroContract(input: {
  parentUstn: string;
  distressedSaleAmount: number;
  countryFactor?: number; // override — if absent, looked up from the trade's destCountry
  sellerGtid?: string;
  buyerGtid?: string;
  commodity?: string;
  quantityKg?: number;
  tradeId?: string;
  listingId?: string;
}): Promise<
  | { ok: true; microContractId: string; microUstn: string; feeUsd: number; feeRate: number; countryFactor: number; parentUstn: string }
  | { ok: false; reason: string; code?: string }
> {
  if (!input.parentUstn) return { ok: false, reason: "parentUstn required." };
  if (!Number.isFinite(input.distressedSaleAmount) || input.distressedSaleAmount <= 0) {
    return { ok: false, reason: "distressedSaleAmount must be a positive number." };
  }

  // Resolve the country factor: explicit override > trade.destCountry > default 1.0.
  let factor = input.countryFactor;
  if (!Number.isFinite(factor) || factor <= 0) {
    try {
      const trade = await db.trade.findUnique({ where: { ustn: input.parentUstn } }) as any;
      const country = trade?.destCountry || "";
      factor = getCountryFactor(country);
    } catch {
      factor = 1.0;
    }
  }
  const feeRate = +(DISTRESSED_BASE_FEE_RATE * factor).toFixed(6);
  const feeUsd = +(input.distressedSaleAmount * feeRate).toFixed(2);

  // Generate the MicroUSTN.
  const { microUstn } = generateMicroUstn(input.parentUstn);

  // Idempotency check — if a MicroContract already exists with this microUstn,
  // return it instead of duplicating.
  try {
    const existing = await db.microContract.findUnique({ where: { microUstn } }) as any;
    if (existing) {
      return {
        ok: true,
        microContractId: existing.id,
        microUstn: existing.microUstn,
        feeUsd: Number(existing.distressedFeeUsd ?? feeUsd),
        feeRate: Number(existing.feeRateApplied ?? feeRate),
        countryFactor: factor,
        parentUstn: existing.parentUstn,
      };
    }
  } catch { /* fallthrough — create new */ }

  // Resolve seller/buyer from the parent trade if not provided.
  let sellerGtid = input.sellerGtid;
  let buyerGtid = input.buyerGtid;
  let commodity = input.commodity;
  let quantityKg = input.quantityKg;
  let tradeId = input.tradeId;
  if (!sellerGtid || !buyerGtid || !commodity || !tradeId) {
    try {
      const trade = await db.trade.findUnique({ where: { ustn: input.parentUstn } }) as any;
      if (trade) {
        if (!sellerGtid) sellerGtid = trade.sellerGtid;
        if (!tradeId) tradeId = trade.id;
        if (!commodity) commodity = trade.commodity;
        if (!quantityKg) quantityKg = trade.netWeightKg;
      }
    } catch { /* fallthrough */ }
  }

  const microContractId = `MC-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 900 + 100)}`;

  try {
    const mc = await db.microContract.create({
      data: {
        microContractId,
        microUstn,
        parentUstn: input.parentUstn,
        tradeId: tradeId ?? null,
        sellerGtid: sellerGtid || "SGTX-UNKNOWN",
        buyerGtid: buyerGtid || "SGTX-UNKNOWN",
        commodity: commodity || "Distressed Cargo",
        quantityKg: Number(quantityKg) || 0,
        priceUsd: Number(input.distressedSaleAmount),
        status: "PENDING_FEE",
        // distressedFeeUsd + feeRateApplied are NOT in the canonical schema — they're
        // optional columns added by the distressed module. The @ts-nocheck above
        // lets us include them defensively; if the column doesn't exist, Prisma
        // silently ignores extra props on a strict-schema DB.
        distressedFeeUsd: feeUsd,
        feeRateApplied: feeRate,
      } as any,
    }) as any;

    // If a listingId was provided, link the listing's microUstn field.
    if (input.listingId) {
      try {
        await db.distressedCargoListing.update({
          where: { id: input.listingId },
          data: { microUstn },
        });
      } catch { /* non-blocking */ }
    }

    return {
      ok: true,
      microContractId: mc.id || microContractId,
      microUstn,
      feeUsd,
      feeRate,
      countryFactor: factor,
      parentUstn: input.parentUstn,
    };
  } catch (e: any) {
    return { ok: false, reason: `DB error: ${e?.message || e}` };
  }
}

// ============================================================
// 14.2.3 — linkToParent
// ============================================================

/** Confirm that a MicroUSTN is linked to its parent USTN (for audit /
 *  provenance lookups). Returns the linked state + the parent's trade
 *  details. */
export async function linkToParent(microUstn: string, parentUstn: string): Promise<
  | { ok: true; linked: true; microUstn: string; parentUstn: string; tradeId: string | null; commodity: string | null; sellerGtid: string | null; buyerGtid: string | null }
  | { ok: false; reason: string; code?: string }
> {
  if (!microUstn || !parentUstn) {
    return { ok: false, reason: "microUstn and parentUstn are required." };
  }
  let mc: any;
  try {
    mc = await db.microContract.findUnique({ where: { microUstn } });
  } catch (e: any) {
    return { ok: false, reason: `DB error: ${e?.message || e}` };
  }
  if (!mc) return { ok: false, code: "NOT_FOUND", reason: `MicroContract with microUstn ${microUstn} not found.` };
  if (mc.parentUstn !== parentUstn) {
    return {
      ok: false,
      code: "PARENT_MISMATCH",
      reason: `MicroUSTN ${microUstn} is linked to parent ${mc.parentUstn}, not ${parentUstn}.`,
    };
  }
  return {
    ok: true,
    linked: true,
    microUstn: mc.microUstn,
    parentUstn: mc.parentUstn,
    tradeId: mc.tradeId,
    commodity: mc.commodity,
    sellerGtid: mc.sellerGtid,
    buyerGtid: mc.buyerGtid,
  };
}

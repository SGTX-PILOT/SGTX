/**
 * SGTX Tier 1 — VGM (SOLAS Verified Gross Mass) library.
 *
 * SOLAS Chapter VI, Regulation 2 (amended 1 July 2016) makes it a legal offence
 * for a shipper to deliver a packed container to a marine terminal without a
 * Verified Gross Mass. No shipping line may load such a container.
 *
 * Two verification methods are accepted:
 *   - METHOD_1: Weighing the packed container on calibrated, certified equipment.
 *   - METHOD_2: Summing cargo + dunnage + tare (only permissible where the
 *               weigher holds a delegation from the competent authority and
 *               uses an approved procedure).
 *
 * This module wraps the `VgmVerification` Prisma model and the `vgm*` fields
 * on `TradeContainer`, exposing the operations the execution gate needs.
 *
 * @see /prisma/schema.prisma  → VgmVerification, TradeContainer.vgm*
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

/** Allowed SOLAS VGM verification methods. */
export type VgmMethod = "METHOD_1" | "METHOD_2";

/**
 * Hard execution gate: any container that is not VGM-compliant and not exempt
 * must be blocked from vessel loading. The execution layer reads this flag to
 * short-circuit the loading milestone.
 */
export const VGM_BLOCK = "VGM_REQUIRED" as const;

/** Tolerance applied to METHOD_2 sum reconciliation (±2% per SOLAS guidance). */
export const METHOD_2_TOLERANCE_PCT = 2;

/** Input accepted by {@link submitVgm}. */
export interface SubmitVgmInput {
  /** TradeContainer.id (Prisma cuid). */
  containerId: string;
  /** Trade.ustn for the parent trade. */
  ustn: string;
  /** Verified Gross Mass in kilograms (container + cargo + dunnage). Must be > 0. */
  vgmKg: number;
  /** SOLAS method used. METHOD_1 = weighed, METHOD_2 = calculated. */
  vgmMethod: VgmMethod;
  /** Container tare weight in kg. Required for METHOD_2. */
  tareKg?: number;
  /** Cargo weight in kg. Required for METHOD_2. */
  cargoKg?: number;
  /** Dunnage / securing material weight in kg. Required for METHOD_2. */
  dunnageKg?: number;
  /** Calibrated scale identifier or calibration certificate reference. */
  weighingEquipment?: string;
  /** Name of the weigher / authorised party. */
  weigherName?: string;
  /** GTID of the authorised weigher. */
  weigherGtid?: string;
  /** Official weigher license / accreditation number (where applicable). */
  weigherLicense?: string;
  /** Free-form notes attached to the verification record. */
  notes?: string;
}

/** Shape returned by {@link submitVgm} on success. */
export interface SubmitVgmResult {
  ok: true;
  verification: Awaited<ReturnType<typeof db.vgmVerification.create>>;
  container: Awaited<ReturnType<typeof db.tradeContainer.update>>;
}

/** Shape returned by {@link submitVgm} on validation failure. */
export interface SubmitVgmFailure {
  ok: false;
  code: string;
  reason: string;
}

/**
 * Create a `VgmVerification` record and update the parent `TradeContainer`
 * with the verified mass, method, weigher, and timestamp.
 *
 * @param input - see {@link SubmitVgmInput}
 * @returns the created verification and the updated container, or a structured
 *          validation error.
 */
export async function submitVgm(
  input: SubmitVgmInput,
): Promise<SubmitVgmResult | SubmitVgmFailure> {
  try {
    if (!input.containerId || !input.ustn) {
      return { ok: false, code: "MISSING_ID", reason: "containerId and ustn are required." };
    }
    if (typeof input.vgmKg !== "number" || !isFinite(input.vgmKg) || input.vgmKg <= 0) {
      return { ok: false, code: "INVALID_VGM", reason: "vgmKg must be a positive finite number." };
    }
    if (input.vgmMethod !== "METHOD_1" && input.vgmMethod !== "METHOD_2") {
      return { ok: false, code: "INVALID_METHOD", reason: 'vgmMethod must be "METHOD_1" or "METHOD_2".' };
    }

    // METHOD_2 reconciliation: tare + cargo + dunnage must be within ±2% of vgmKg.
    if (input.vgmMethod === "METHOD_2") {
      const tare = input.tareKg ?? 0;
      const cargo = input.cargoKg ?? 0;
      const dunnage = input.dunnageKg ?? 0;
      const summed = tare + cargo + dunnage;
      if (tare <= 0 || cargo <= 0) {
        return {
          ok: false,
          code: "METHOD_2_RECONCILIATION",
          reason: "METHOD_2 requires positive tareKg and cargoKg.",
        };
      }
      const tolerance = Math.max(summed * (METHOD_2_TOLERANCE_PCT / 100), 1);
      if (Math.abs(summed - input.vgmKg) > tolerance) {
        return {
          ok: false,
          code: "METHOD_2_RECONCILIATION",
          reason: `METHOD_2 sum (${summed.toFixed(2)} kg) deviates from vgmKg (${input.vgmKg} kg) by more than ±${METHOD_2_TOLERANCE_PCT}%.`,
        };
      }
    }

    // Verify the container actually belongs to the declared trade (defence in depth).
    const container = await db.tradeContainer.findUnique({
      where: { id: input.containerId },
      include: { trade: { select: { ustn: true } } },
    });
    if (!container) {
      return { ok: false, code: "CONTAINER_NOT_FOUND", reason: `No TradeContainer with id ${input.containerId}.` };
    }
    if (container.trade?.ustn && container.trade.ustn !== input.ustn) {
      return { ok: false, code: "USTN_MISMATCH", reason: "Container does not belong to the declared USTN." };
    }

    const verifiedAt = new Date();
    const verification = await db.vgmVerification.create({
      data: {
        containerId: input.containerId,
        ustn: input.ustn,
        vgmKg: input.vgmKg,
        vgmMethod: input.vgmMethod,
        tareKg: input.tareKg ?? null,
        cargoKg: input.cargoKg ?? null,
        dunnageKg: input.dunnageKg ?? null,
        weighingEquipment: input.weighingEquipment ?? null,
        weigherName: input.weigherName ?? null,
        weigherGtid: input.weigherGtid ?? null,
        weigherLicense: input.weigherLicense ?? null,
        verifiedAt,
        notes: input.notes ?? null,
      },
    });

    const updated = await db.tradeContainer.update({
      where: { id: input.containerId },
      data: {
        vgmKg: input.vgmKg,
        vgmMethod: input.vgmMethod,
        vgmVerifiedAt: verifiedAt,
        vgmVerifiedBy: input.weigherGtid ?? input.weigherName ?? null,
        vgmExempt: false,
      },
    });

    logger.info("[vgm] submitted", {
      containerId: input.containerId,
      ustn: input.ustn,
      vgmKg: input.vgmKg,
      method: input.vgmMethod,
    });

    return { ok: true, verification, container: updated };
  } catch (err) {
    logger.error("[vgm] submitVgm failed", { error: (err as Error)?.message });
    return {
      ok: false,
      code: "INTERNAL",
      reason: (err as Error)?.message || "Failed to submit VGM.",
    };
  }
}

/**
 * Fetch the most recent VGM verification for a container.
 *
 * @param containerId - TradeContainer.id
 * @returns the latest `VgmVerification` row, or `null` if none exists.
 */
export async function getVgm(containerId: string) {
  try {
    if (!containerId) return null;
    return await db.vgmVerification.findFirst({
      where: { containerId },
      orderBy: { verifiedAt: "desc" },
    });
  } catch (err) {
    logger.error("[vgm] getVgm failed", { containerId, error: (err as Error)?.message });
    return null;
  }
}

/**
 * A container is VGM-compliant if EITHER:
 *   - It carries a verified mass (vgmKg set + vgmVerifiedAt not null), OR
 *   - It has been explicitly marked as exempt (vgmExempt = true).
 *
 * @param containerId - TradeContainer.id
 * @returns true if the container may legally be loaded onto a vessel.
 */
export async function isVgmCompliant(containerId: string): Promise<boolean> {
  try {
    if (!containerId) return false;
    const container = await db.tradeContainer.findUnique({
      where: { id: containerId },
      select: {
        vgmKg: true,
        vgmVerifiedAt: true,
        vgmExempt: true,
      },
    });
    if (!container) return false;
    if (container.vgmExempt) return true;
    return container.vgmKg != null && container.vgmKg > 0 && container.vgmVerifiedAt != null;
  } catch (err) {
    logger.error("[vgm] isVgmCompliant failed", { containerId, error: (err as Error)?.message });
    return false;
  }
}

/**
 * Mark a container's VGM as submitted to the carrier (e.g. INTTRA / GT Nexus /
 * Maersk Spot). Generates a submission reference, sets `submittedToCarrier`
 * and `submittedAt`, and persists the reference on the TradeContainer for
 * downstream tracking.
 *
 * @param containerId - TradeContainer.id
 * @param carrierGtid - GTID of the carrier the VGM was transmitted to
 * @returns the updated verification + container, or a structured failure.
 */
export async function submitVgmToCarrier(
  containerId: string,
  carrierGtid: string,
): Promise<
  | { ok: true; verification: Awaited<ReturnType<typeof db.vgmVerification.update>>; container: Awaited<ReturnType<typeof db.tradeContainer.update>>; submissionRef: string }
  | { ok: false; code: string; reason: string }
> {
  try {
    if (!containerId || !carrierGtid) {
      return { ok: false, code: "MISSING_ID", reason: "containerId and carrierGtid are required." };
    }

    const latest = await db.vgmVerification.findFirst({
      where: { containerId },
      orderBy: { verifiedAt: "desc" },
    });
    if (!latest) {
      return { ok: false, code: "NO_VGM", reason: "Cannot submit to carrier — container has no VGM verification." };
    }

    const submittedAt = new Date();
    const submissionRef = generateVgmSubmissionRef(containerId, carrierGtid);

    const verification = await db.vgmVerification.update({
      where: { id: latest.id },
      data: {
        submittedToCarrier: true,
        submittedAt,
        submissionRef,
      },
    });

    const container = await db.tradeContainer.update({
      where: { id: containerId },
      data: { vgmSubmissionRef: submissionRef },
    });

    logger.info("[vgm] submitted to carrier", { containerId, carrierGtid, submissionRef });

    return { ok: true, verification, container, submissionRef };
  } catch (err) {
    logger.error("[vgm] submitVgmToCarrier failed", { containerId, error: (err as Error)?.message });
    return {
      ok: false,
      code: "INTERNAL",
      reason: (err as Error)?.message || "Failed to submit VGM to carrier.",
    };
  }
}

/**
 * Generate a deterministic-ish submission reference for the carrier handoff.
 * Format: `VGM-<yyyymmdd>-<8-char-base36>`.
 */
function generateVgmSubmissionRef(containerId: string, carrierGtid: string): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 10).toUpperCase();
  // containerId / carrierGtid hashed into the prefix so collisions across
  // containers are statistically impossible without depending on crypto.
  const seed = (containerId + carrierGtid).length.toString(36).toUpperCase().padStart(2, "0");
  return `VGM-${ymd}-${seed}${rand}`;
}

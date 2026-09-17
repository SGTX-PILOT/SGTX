/**
 * SGTX Tier 1 — Dangerous Goods (IMDG Code) declaration library.
 *
 * The International Maritime Dangerous Goods (IMDG) Code, made mandatory under
 * SOLAS Chapter VII, requires every packed container carrying dangerous goods
 * to be accompanied by a signed Dangerous Goods Declaration (DGD) and a
 * transport document specifying the proper shipping name, UN number, IMDG
 * class, packing group, subsidiary risks, flashpoint, and emergency contact.
 *
 * This module wraps the `DangerousGoodsDeclaration` Prisma model and the DG
 * fields on `TradeContainer`, plus exposes a basic IMDG segregation validator
 * covering the most common conflict pairs.
 *
 * @see /prisma/schema.prisma → DangerousGoodsDeclaration, TradeContainer.isDangerous*
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

/** IMDG packing groups. */
export type PackingGroup = "I" | "II" | "III";

/** Input accepted by {@link declareDangerousGoods}. */
export interface DeclareDgInput {
  /** TradeContainer.id (Prisma cuid). */
  containerId: string;
  /** Trade.ustn for the parent trade. */
  ustn: string;
  /** Proper shipping name per IMDG Code (e.g. "Corrosive liquid, acidic, inorganic, n.o.s."). */
  shippingName: string;
  /** Technical name if the proper shipping name ends in "n.o.s.". */
  technicalName?: string;
  /** IMDG class, e.g. "3", "8", "4.1", "5.1", "5.2", "6.1", "7", "1". */
  imdgClass: string;
  /** UN number, e.g. "1760", "1203", "1950". */
  unNumber: string;
  /** Packing group I / II / III. */
  packingGroup: PackingGroup;
  /** Subsidiary risk class(es), comma-separated if multiple. */
  subsidiaryRisk?: string;
  /** Flash point in °C (closed-cup). Required for Class 3 flammable liquids. */
  flashpointC?: number;
  /** Boiling point in °C (used to classify packing group for some Class 3 entries). */
  boilingPointC?: number;
  /** Whether the substance is a marine pollutant per IMDG 2.9.3. */
  marinePollutant: boolean;
  /** Limited Quantities exemption (Col 7a of the Dangerous Goods List). */
  limitedQuantities: boolean;
  /** Excepted Quantities exemption (Col 7b of the Dangerous Goods List). */
  exceptedQuantities?: boolean;
  /** Net explosive mass in kg — required for Class 1 (explosives). */
  netExplosiveMassKg?: number;
  /** Radioactivity in Becquerels — required for Class 7 (radioactive). */
  radioactivityBq?: number;
  /** IMDG segregation code (e.g. "SGG1", "SGG18", "SG49"). */
  segregationCode?: string;
  /** Transport category 1 / 2 / 3 (Class 7 only). */
  transportCategory?: string;
  /** Packaging type (IBC / drum / box / bag / cylinder / etc.). */
  packagingType?: string;
  /** Number of packagings. */
  packagingCount?: number;
  /** 24-hour emergency contact (name or organisation). */
  emergencyContact: string;
  /** 24-hour emergency phone number (preferably with country code). */
  emergencyPhone?: string;
  /** Name of the person signing the declaration. */
  declarantName: string;
  /** GTID of the declarant. */
  declarantGtid: string;
  /** PIH (Poison Inhalation Hazard) flag. */
  inhalationHazard?: boolean;
  /** PIH zone — "Zone A" or "Zone B". */
  poisonInhalationHazard?: string;
  /** CERCLA reportable quantity in kg (US-only). */
  reportableQuantityKg?: number;
}

/** Result shape for {@link declareDangerousGoods}. */
export interface DeclareDgResult {
  ok: true;
  declaration: Awaited<ReturnType<typeof db.dangerousGoodsDeclaration.create>>;
  container: Awaited<ReturnType<typeof db.tradeContainer.update>>;
}

/** Result shape for {@link declareDangerousGoods} validation failure. */
export interface DeclareDgFailure {
  ok: false;
  code: string;
  reason: string;
}

/**
 * Basic IMDG segregation table — covers the most common conflict pairs
 * observed in containerised ocean freight. This is NOT a complete
 * implementation of IMDG 7.5.4 (the full segregation matrix is 9×9 with
 * per-cell "away from" / "separated from" / "separated by a complete
 * compartment" rules) — it covers the high-frequency regulatory conflicts
 * that must NEVER be co-loaded:
 *
 *   - Class 1 (explosives) ↔ Class 5.1 (oxidizers)
 *   - Class 3 (flammable liquids) ↔ Class 5.1
 *   - Class 4.1 (flammable solids) ↔ Class 5.1
 *   - Class 5.1 (oxidizers) ↔ Class 5.2 (organic peroxides)
 *   - Class 6.1 (toxic) ↔ Class 8 (corrosive) when packing group I/II
 *   - Class 7 (radioactive) — full isolation (must not co-load with any
 *     other DG except under specific stowage provisions)
 *   - Class 8 (corrosive) ↔ Class 5.1
 *
 * Each entry is keyed by an ordered class pair, lower-lexicographically first.
 */
export const IMDG_SEGREGATION_TABLE: Record<string, { rule: string; severity: "BLOCK" | "WARN" }> = {
  "1|5.1": { rule: "Class 1 (explosives) must be segregated from Class 5.1 (oxidizers) — IMDG 7.5.4", severity: "BLOCK" },
  "1|5.2": { rule: "Class 1 (explosives) must be segregated from Class 5.2 (organic peroxides) — IMDG 7.5.4", severity: "BLOCK" },
  "1|7": { rule: "Class 1 (explosives) must be segregated from Class 7 (radioactive) — IMDG 7.5.4", severity: "BLOCK" },
  "1|8": { rule: "Class 1 (explosives) must be segregated from Class 8 (corrosive) — IMDG 7.5.4", severity: "BLOCK" },
  "3|5.1": { rule: "Class 3 (flammable liquids) must be segregated from Class 5.1 (oxidizers) — IMDG 7.5.4", severity: "BLOCK" },
  "3|7": { rule: "Class 3 (flammable liquids) should be segregated from Class 7 (radioactive) — IMDG 7.5.4", severity: "WARN" },
  "4.1|5.1": { rule: "Class 4.1 (flammable solids) must be segregated from Class 5.1 (oxidizers) — IMDG 7.5.4", severity: "BLOCK" },
  "4.1|5.2": { rule: "Class 4.1 (flammable solids) must be segregated from Class 5.2 (organic peroxides) — IMDG 7.5.4", severity: "BLOCK" },
  "4.2|5.1": { rule: "Class 4.2 (spontaneously combustible) must be segregated from Class 5.1 (oxidizers) — IMDG 7.5.4", severity: "BLOCK" },
  "4.3|5.1": { rule: "Class 4.3 (dangerous when wet) must be segregated from Class 5.1 (oxidizers) — IMDG 7.5.4", severity: "BLOCK" },
  "5.1|5.2": { rule: "Class 5.1 (oxidizers) must be segregated from Class 5.2 (organic peroxides) — IMDG 7.5.4", severity: "BLOCK" },
  "5.1|7": { rule: "Class 5.1 (oxidizers) must be segregated from Class 7 (radioactive) — IMDG 7.5.4", severity: "BLOCK" },
  "5.1|8": { rule: "Class 5.1 (oxidizers) must be segregated from Class 8 (corrosive) — IMDG 7.5.4", severity: "BLOCK" },
  "5.2|7": { rule: "Class 5.2 (organic peroxides) must be segregated from Class 7 (radioactive) — IMDG 7.5.4", severity: "BLOCK" },
  "6.1|8": { rule: "Class 6.1 (toxic, PG I/II) must be segregated from Class 8 (corrosive, PG I/II) — IMDG 7.5.4", severity: "BLOCK" },
};

/**
 * Create a Dangerous Goods Declaration and mark the parent container as
 * `isDangerous = true`. The container's `imdgClass`, `unNumber`,
 * `properShippingName`, `packingGroup`, `flashpointC`, `marinePollutant`,
 * `segregationCode`, `emergencyContact`, and `limitedQuantities` fields are
 * mirrored for fast lookup by the loading gate.
 *
 * @param input - see {@link DeclareDgInput}
 */
export async function declareDangerousGoods(
  input: DeclareDgInput,
): Promise<DeclareDgResult | DeclareDgFailure> {
  try {
    if (!input.containerId || !input.ustn) {
      return { ok: false, code: "MISSING_ID", reason: "containerId and ustn are required." };
    }

    const shippingName = (input.shippingName || "").trim();
    if (!shippingName) {
      return { ok: false, code: "VALIDATION", reason: "shippingName is required." };
    }
    const imdgClass = (input.imdgClass || "").trim();
    if (!imdgClass) {
      return { ok: false, code: "VALIDATION", reason: 'imdgClass is required (e.g. "3", "8", "4.1").' };
    }
    const unNumber = (input.unNumber || "").trim();
    if (!unNumber) {
      return { ok: false, code: "VALIDATION", reason: 'unNumber is required (e.g. "1760").' };
    }
    if (!["I", "II", "III"].includes(input.packingGroup)) {
      return { ok: false, code: "VALIDATION", reason: 'packingGroup must be "I", "II", or "III".' };
    }
    if (!input.emergencyContact?.trim()) {
      return { ok: false, code: "VALIDATION", reason: "emergencyContact (24h) is required." };
    }
    if (!input.declarantName?.trim() || !input.declarantGtid?.trim()) {
      return { ok: false, code: "VALIDATION", reason: "declarantName and declarantGtid are required." };
    }

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

    const declaration = await db.dangerousGoodsDeclaration.create({
      data: {
        containerId: input.containerId,
        ustn: input.ustn,
        shippingName,
        technicalName: input.technicalName?.trim() || null,
        imdgClass,
        unNumber,
        packingGroup: input.packingGroup,
        subsidiaryRisk: input.subsidiaryRisk?.trim() || null,
        flashpointC: input.flashpointC ?? null,
        boilingPointC: input.boilingPointC ?? null,
        marinePollutant: input.marinePollutant,
        limitedQuantities: input.limitedQuantities,
        exceptedQuantities: input.exceptedQuantities ?? false,
        netExplosiveMassKg: input.netExplosiveMassKg ?? null,
        radioactivityBq: input.radioactivityBq ?? null,
        segregationCode: input.segregationCode?.trim() || null,
        transportCategory: input.transportCategory?.trim() || null,
        packagingType: input.packagingType?.trim() || null,
        packagingCount: input.packagingCount ?? null,
        emergencyContact: input.emergencyContact.trim(),
        emergencyPhone: input.emergencyPhone?.trim() || null,
        declarantName: input.declarantName.trim(),
        declarantGtid: input.declarantGtid.trim(),
        declarantSigned: false,
        signedAt: null,
        inhalationHazard: input.inhalationHazard ?? false,
        poisonInhalationHazard: input.poisonInhalationHazard?.trim() || null,
        reportableQuantityKg: input.reportableQuantityKg ?? null,
      },
    });

    const updated = await db.tradeContainer.update({
      where: { id: input.containerId },
      data: {
        isDangerous: true,
        imdgClass,
        unNumber,
        properShippingName: shippingName,
        packingGroup: input.packingGroup,
        flashpointC: input.flashpointC ?? null,
        marinePollutant: input.marinePollutant,
        segregationCode: input.segregationCode?.trim() || null,
        emergencyContact: input.emergencyContact.trim(),
        limitedQuantities: input.limitedQuantities,
      },
    });

    logger.info("[dg] declared", {
      containerId: input.containerId,
      ustn: input.ustn,
      unNumber,
      imdgClass,
    });

    return { ok: true, declaration, container: updated };
  } catch (err) {
    logger.error("[dg] declareDangerousGoods failed", { error: (err as Error)?.message });
    return {
      ok: false,
      code: "INTERNAL",
      reason: (err as Error)?.message || "Failed to declare dangerous goods.",
    };
  }
}

/**
 * Get the most recent Dangerous Goods Declaration for a container.
 *
 * @param containerId - TradeContainer.id
 */
export async function getDgDeclaration(containerId: string) {
  try {
    if (!containerId) return null;
    return await db.dangerousGoodsDeclaration.findFirst({
      where: { containerId },
      orderBy: { createdAt: "desc" },
    });
  } catch (err) {
    logger.error("[dg] getDgDeclaration failed", { containerId, error: (err as Error)?.message });
    return null;
  }
}

/**
 * Whether the container currently has a Dangerous Goods Declaration on file.
 *
 * @param containerId - TradeContainer.id
 */
export async function hasDgDeclaration(containerId: string): Promise<boolean> {
  try {
    if (!containerId) return false;
    const count = await db.dangerousGoodsDeclaration.count({
      where: { containerId },
    });
    return count > 0;
  } catch (err) {
    logger.error("[dg] hasDgDeclaration failed", { containerId, error: (err as Error)?.message });
    return false;
  }
}

/** Conflict pair returned by {@link validateDgSegregation}. */
export interface DgSegregationConflict {
  container1: string;
  container2: string;
  rule: string;
  severity: "BLOCK" | "WARN";
  /** IMDG classes involved (for client display). */
  classPair: string;
}

/** Result of {@link validateDgSegregation}. */
export interface DgSegregationResult {
  compliant: boolean;
  conflicts: DgSegregationConflict[];
  /** Total containers checked. */
  checked: number;
  /** Containers that were inspected and have DG data. */
  dangerousCount: number;
}

/**
 * IMDG segregation validator: given a set of containers (typically all
 * containers on a single shipment/vessel), detect any prohibited co-loading
 * pairs against the {@link IMDG_SEGREGATION_TABLE}.
 *
 * A container is "dangerous" for the purpose of this check if either:
 *   - `isDangerous = true` AND `imdgClass` is set, OR
 *   - it has a `DangerousGoodsDeclaration` on file.
 *
 * Class 7 (radioactive) gets WARN-level entries with every other DG class
 * because IMDG 7.5.4 requires full isolation — the stowage planner must
 * review manually rather than auto-co-load.
 *
 * @param containerIds - TradeContainer.id values to compare pairwise.
 */
export async function validateDgSegregation(
  containerIds: string[],
): Promise<DgSegregationResult> {
  try {
    if (!containerIds || containerIds.length < 2) {
      return {
        compliant: true,
        conflicts: [],
        checked: containerIds?.length ?? 0,
        dangerousCount: 0,
      };
    }

    const containers = await db.tradeContainer.findMany({
      where: { id: { in: containerIds } },
      select: {
        id: true,
        isDangerous: true,
        imdgClass: true,
        packingGroup: true,
      },
    });

    // Pull DG declarations so we can fall back when container.imdgClass is null.
    const declarations = await db.dangerousGoodsDeclaration.findMany({
      where: { containerId: { in: containerIds } },
      orderBy: { createdAt: "desc" },
      select: { containerId: true, imdgClass: true, packingGroup: true },
    });
    const latestDeclByContainer = new Map<
      string,
      { imdgClass: string; packingGroup: string | null }
    >();
    for (const d of declarations) {
      if (!latestDeclByContainer.has(d.containerId)) {
        latestDeclByContainer.set(d.containerId, {
          imdgClass: d.imdgClass,
          packingGroup: d.packingGroup,
        });
      }
    }

    type DgEntry = { containerId: string; imdgClass: string; packingGroup: string | null };
    const dangerousContainers: DgEntry[] = [];
    for (const c of containers) {
      let imdgClass: string | null = c.imdgClass;
      let packingGroup: string | null = c.packingGroup ?? null;
      if (!imdgClass) {
        const decl = latestDeclByContainer.get(c.id);
        if (decl) {
          imdgClass = decl.imdgClass;
          packingGroup = decl.packingGroup;
        }
      }
      if (imdgClass && (c.isDangerous || latestDeclByContainer.has(c.id))) {
        dangerousContainers.push({ containerId: c.id, imdgClass, packingGroup });
      }
    }

    const conflicts: DgSegregationConflict[] = [];
    for (let i = 0; i < dangerousContainers.length; i++) {
      for (let j = i + 1; j < dangerousContainers.length; j++) {
        const a = dangerousContainers[i];
        const b = dangerousContainers[j];
        const key = segregationKey(a.imdgClass, b.imdgClass);
        const rule = IMDG_SEGREGATION_TABLE[key];
        if (rule) {
          // Special-case: 6.1 ↔ 8 conflict only applies when at least one
          // side is packing group I or II (lower-hazard III is allowed).
          if (key === "6.1|8") {
            const aHigh = a.packingGroup === "I" || a.packingGroup === "II";
            const bHigh = b.packingGroup === "I" || b.packingGroup === "II";
            if (!aHigh && !bHigh) continue;
          }
          conflicts.push({
            container1: a.containerId,
            container2: b.containerId,
            rule: rule.rule,
            severity: rule.severity,
            classPair: key,
          });
          continue;
        }
        // Class 7 → emit WARN against every other DG (full isolation requirement).
        if (a.imdgClass === "7" || b.imdgClass === "7") {
          conflicts.push({
            container1: a.containerId,
            container2: b.containerId,
            rule: "Class 7 (radioactive) requires isolation from other dangerous goods — IMDG 7.5.4 (manual stowage review)",
            severity: "WARN",
            classPair: key,
          });
        }
      }
    }

    const hasBlockingConflict = conflicts.some((c) => c.severity === "BLOCK");
    return {
      compliant: !hasBlockingConflict,
      conflicts,
      checked: containerIds.length,
      dangerousCount: dangerousContainers.length,
    };
  } catch (err) {
    logger.error("[dg] validateDgSegregation failed", { error: (err as Error)?.message });
    // Fail closed: if the validator cannot determine compliance, treat as non-compliant.
    return {
      compliant: false,
      conflicts: [
        {
          container1: "UNKNOWN",
          container2: "UNKNOWN",
          rule: `Segregation validator error: ${(err as Error)?.message || "unknown"}`,
          severity: "BLOCK",
          classPair: "N/A",
        },
      ],
      checked: containerIds.length,
      dangerousCount: 0,
    };
  }
}

/**
 * Build a stable lookup key for two IMDG classes (lexicographic ordering
 * ensures "5.1" + "8" and "8" + "5.1" hit the same row).
 */
function segregationKey(classA: string, classB: string): string {
  const a = classA.trim();
  const b = classB.trim();
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Mark a Dangerous Goods Declaration as signed by the declarant. Mutates
 * `declarantSigned = true` + `signedAt = now()`. Used by the PATCH endpoint
 * to record the declarant's attestation.
 *
 * @param declarationId - DangerousGoodsDeclaration.id
 */
export async function signDgDeclaration(
  declarationId: string,
): Promise<
  | { ok: true; declaration: Awaited<ReturnType<typeof db.dangerousGoodsDeclaration.update>> }
  | { ok: false; code: string; reason: string }
> {
  try {
    if (!declarationId) {
      return { ok: false, code: "MISSING_ID", reason: "declarationId is required." };
    }
    const existing = await db.dangerousGoodsDeclaration.findUnique({
      where: { id: declarationId },
    });
    if (!existing) {
      return {
        ok: false,
        code: "NOT_FOUND",
        reason: `No DangerousGoodsDeclaration with id ${declarationId}.`,
      };
    }
    const declaration = await db.dangerousGoodsDeclaration.update({
      where: { id: declarationId },
      data: { declarantSigned: true, signedAt: new Date() },
    });
    logger.info("[dg] declaration signed", { declarationId });
    return { ok: true, declaration };
  } catch (err) {
    logger.error("[dg] signDgDeclaration failed", { error: (err as Error)?.message });
    return {
      ok: false,
      code: "INTERNAL",
      reason: (err as Error)?.message || "Failed to sign DG declaration.",
    };
  }
}

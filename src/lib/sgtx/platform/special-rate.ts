// SGTX Special Rate Helper
// Looks up any active special rate for a tenant and rate type.
// Falls back to the default rate if no special rate exists.
import { db } from "@/lib/db";
import { freshDb } from "@/lib/db-fresh";

const _db = (freshDb ?? db) as typeof db;

const DEFAULT_RATES: Record<string, number> = {
  SGTX_FEE: 1.5,       // 1.5% standard SGTX platform fee
  CUSTOMS_FEE: 0.5,    // 0.5% customs processing
  PROCESSING_FEE: 0.25, // 0.25% processing fee
};

export async function getEffectiveRate(tenantGtid: string, rateType: string): Promise<{ rate: number; isSpecial: boolean; specialRateId?: string; originalRate: number }> {
  const originalRate = DEFAULT_RATES[rateType] ?? 1.5;

  const special = await _db.specialRate.findFirst({
    where: {
      targetGtid: tenantGtid,
      rateType,
      isActive: true,
      OR: [
        { validUntil: null },
        { validUntil: { gt: new Date() } },
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  if (special) {
    return { rate: special.rateValue, isSpecial: true, specialRateId: special.rateId, originalRate: special.originalRate };
  }
  return { rate: originalRate, isSpecial: false, originalRate };
}

export function getDefaultRate(rateType: string): number {
  return DEFAULT_RATES[rateType] ?? 1.5;
}

// POST /api/sgtx/bonds/sufficiency-check — check bond sufficiency for a given duty amount
//
// Body:
//   {
//     bondId: string,            // required — CustomsBond.id
//     ustn?: string,              // optional — link to a shipment
//     dutyAmount: number,        // required — the duty to cover
//     coveragePercentage?: number // optional override — bond's stored value used otherwise
//   }
//
// Logic:
//   1. Load the CustomsBond row by bondId.
//   2. Compute bondRequired = dutyAmount × (coveragePercentage / 100),
//      where coveragePercentage defaults to the bond's stored value (or 100
//      if the bond has none).
//   3. Compute bondAvailable = bond.amount − Σ(active allocations)
//      − Σ(utilised − released). Falls back to bond.amount if no
//      allocations/utilisations exist.
//   4. sufficient = bondAvailable >= bondRequired.
//   5. Persist a BondSufficiencyCheck row with all values + return it.
//
// Returns:
//   { ok, checkId, sufficient, bondRequired, bondAvailable, dutyAmount,
//     coveragePercentageApplied, bond }
//
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { bondId, ustn, dutyAmount, coveragePercentage } = body || {};

    const missing: string[] = [];
    if (!bondId) missing.push("bondId");
    if (dutyAmount == null) missing.push("dutyAmount");
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 },
      );
    }

    const duty = Number(dutyAmount);
    if (isNaN(duty) || duty < 0) {
      return NextResponse.json({ error: "dutyAmount must be a non-negative number" }, { status: 400 });
    }

    // 1) Load the bond.
    const bond = await (db as any).customsBond.findUnique({
      where: { id: bondId },
    });
    if (!bond) {
      return NextResponse.json({ error: `bond not found: ${bondId}` }, { status: 404 });
    }

    // 2) Determine coveragePercentage to apply.
    const appliedCoveragePct =
      coveragePercentage != null && !isNaN(Number(coveragePercentage))
        ? Number(coveragePercentage)
        : bond.coveragePercentage != null
          ? Number(bond.coveragePercentage)
          : 100;

    // bondRequired = duty × (pct/100)
    const bondRequired = +((duty * appliedCoveragePct) / 100).toFixed(2);

    // 3) Compute available capacity on the bond.
    const activeAllocations = await (db as any).bondAllocation.findMany({
      where: { bondId, status: "ACTIVE" },
      select: { allocatedAmount: true },
    });
    const totalAllocated = (activeAllocations || []).reduce(
      (sum: number, a: any) => sum + Number(a.allocatedAmount || 0),
      0,
    );

    const utilizations = await (db as any).bondUtilisation.findMany({
      where: { bondId },
      select: { utilisedAmount: true, releasedAmount: true },
    });
    const totalNetUtilised = (utilizations || []).reduce(
      (sum: number, u: any) =>
        sum + (Number(u.utilisedAmount || 0) - Number(u.releasedAmount || 0)),
      0,
    );

    const bondTotal = Number(bond.amount || 0);
    const bondAvailable = +(Math.max(0, bondTotal - totalAllocated - totalNetUtilised)).toFixed(2);

    // 4) Sufficient?
    const sufficient = bondAvailable >= bondRequired;

    // 5) Persist the check row.
    const check = await (db as any).bondSufficiencyCheck.create({
      data: {
        bondId,
        ustn: ustn || null,
        dutyAmount: +duty.toFixed(2),
        bondRequired,
        bondAvailable,
        sufficient,
      },
    });

    logger.info("[bonds/sufficiency-check] computed", {
      checkId: check.id,
      bondId,
      ustn: ustn || null,
      dutyAmount: duty,
      bondRequired,
      bondAvailable,
      sufficient,
    });

    return NextResponse.json({
      ok: true,
      checkId: check.id,
      sufficient,
      bondRequired,
      bondAvailable,
      dutyAmount: +duty.toFixed(2),
      coveragePercentageApplied: appliedCoveragePct,
      bond: {
        id: bond.id,
        bondType: bond.bondType,
        bondReference: bond.bondReference,
        amount: bondTotal,
        currency: bond.currency,
        status: bond.status,
        jurisdiction: bond.jurisdiction,
        validTo: bond.validTo,
      },
      rollup: {
        totalAllocated: +totalAllocated.toFixed(2),
        totalNetUtilised: +totalNetUtilised.toFixed(2),
      },
    });
  } catch (e: any) {
    logger.error("[bonds/sufficiency-check] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

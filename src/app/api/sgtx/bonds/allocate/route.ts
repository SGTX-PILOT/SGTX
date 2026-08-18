// POST /api/sgtx/bonds/allocate — Allocate bond amount to a USTN
//
// Body:
//   bondId          (required)
//   ustn            (required — the USTN to allocate against)
//   allocatedAmount (required, > 0)
//   dutyAmount      (optional — used to validate sufficiency)
//   jurisdiction    (optional — used to validate sufficiency; defaults to bond.jurisdiction)
//   commodityType   (optional — used to validate sufficiency)
//
// Checks:
//   1. Bond exists and is verified
//   2. Bond is not EXPIRED/CANCELLED
//   3. Sufficient headroom (bond.amount − existing ACTIVE allocations ≥ allocatedAmount)
//   4. If dutyAmount is provided, validates the bond would cover the
//      jurisdiction-required amount

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import {
  calculateBondRequirement,
  checkBondSufficiency,
} from "@/lib/sgtx/bonds";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }
    const {
      bondId,
      ustn,
      allocatedAmount,
      dutyAmount,
      jurisdiction,
      commodityType,
    } = body as Record<string, unknown>;

    if (!bondId || typeof bondId !== "string") {
      return NextResponse.json({ ok: false, error: "bondId is required" }, { status: 400 });
    }
    if (!ustn || typeof ustn !== "string") {
      return NextResponse.json({ ok: false, error: "ustn is required" }, { status: 400 });
    }
    const allocAmt =
      typeof allocatedAmount === "string"
        ? parseFloat(allocatedAmount)
        : Number(allocatedAmount);
    if (!Number.isFinite(allocAmt) || allocAmt <= 0) {
      return NextResponse.json(
        { ok: false, error: "allocatedAmount must be a positive number" },
        { status: 400 },
      );
    }

    const bond = await db.customsBond.findUnique({
      where: { id: bondId },
      include: {
        allocations: {
          where: { status: "ACTIVE" },
          select: { allocatedAmount: true },
        },
      },
    });
    if (!bond) {
      return NextResponse.json({ ok: false, error: `Bond ${bondId} not found` }, { status: 404 });
    }
    if (!bond.verified) {
      return NextResponse.json(
        { ok: false, error: "Bond has not been verified; call /verify first" },
        { status: 400 },
      );
    }
    if (bond.status === "EXPIRED" || bond.status === "CANCELLED") {
      return NextResponse.json(
        { ok: false, error: `Bond status is ${bond.status}; cannot allocate` },
        { status: 400 },
      );
    }

    const alreadyAllocated = bond.allocations.reduce(
      (s, a) => s + (a.allocatedAmount || 0),
      0,
    );

    // If dutyAmount is given, calculate the required bond for the jurisdiction
    // and ensure the allocation covers it.
    let calc: ReturnType<typeof calculateBondRequirement> | null = null;
    if (typeof dutyAmount === "number" || typeof dutyAmount === "string") {
      const d = typeof dutyAmount === "string" ? parseFloat(dutyAmount) : dutyAmount;
      calc = calculateBondRequirement({
        dutyAmount: d,
        jurisdiction: typeof jurisdiction === "string" ? jurisdiction : bond.jurisdiction,
        aeoStatus: bond.aeoStatus,
        commodityType: typeof commodityType === "string" ? commodityType : undefined,
      });
      if (allocAmt < calc.requiredAmount) {
        return NextResponse.json(
          {
            ok: false,
            error: `Allocation ${allocAmt} is short of jurisdiction-required bond ${calc.requiredAmount.toFixed(2)} (${calc.explanation})`,
            calculation: calc,
          },
          { status: 400 },
        );
      }
    }

    // Check headroom against face value − active allocations
    const sufficiency = checkBondSufficiency(
      {
        amount: bond.amount,
        jurisdiction: bond.jurisdiction,
        aeoStatus: bond.aeoStatus,
        bondType: bond.bondType,
        status: bond.status,
        validTo: bond.validTo,
        verified: bond.verified,
      },
      allocAmt,
      alreadyAllocated,
    );
    if (!sufficiency.sufficient) {
      return NextResponse.json(
        {
          ok: false,
          error: sufficiency.reason || "Insufficient bond headroom",
          available: sufficiency.available,
          shortfall: sufficiency.shortfall,
        },
        { status: 400 },
      );
    }

    // Create the allocation
    const allocation = await db.bondAllocation.create({
      data: {
        bondId,
        ustn,
        allocatedAmount: allocAmt,
        status: "ACTIVE",
      },
    });

    // Update bond status based on remaining headroom
    const remaining = bond.amount - alreadyAllocated - allocAmt;
    const nextStatus =
      remaining <= 0
        ? "FULLY_UTILISED"
        : alreadyAllocated > 0 || allocAmt < bond.amount
          ? "PARTIALLY_UTILISED"
          : bond.status;
    if (nextStatus !== bond.status) {
      await db.customsBond.update({
        where: { id: bondId },
        data: { status: nextStatus },
      });
    }

    logger.info("Bond allocated", {
      bondId,
      ustn,
      allocationId: allocation.id,
      allocatedAmount: allocAmt,
      nextStatus,
    });

    return NextResponse.json({
      ok: true,
      allocation,
      bondStatus: nextStatus,
      remainingHeadroom: Math.max(0, remaining),
      calculation: calc,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[bonds/allocate] error", { msg, raw: String(e) });
    return NextResponse.json({ ok: false, error: msg || "allocate failed" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/sgtx/bonds/allocate",
    description: "Allocate bond amount to a USTN (creates BondAllocation record)",
    body: {
      bondId: "string (required)",
      ustn: "string (required)",
      allocatedAmount: "number (required, > 0)",
      dutyAmount: "number (optional — used to validate sufficiency)",
      jurisdiction: "string (optional — defaults to bond.jurisdiction)",
      commodityType: "string (optional)",
    },
  });
}

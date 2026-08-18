// POST /api/sgtx/bonds/release — Release a bond allocation
//
// Marks the BondAllocation as RELEASED and (if appropriate) transitions the
// parent CustomsBond status back toward ACTIVE.
//
// Body:
//   allocationId   (required) — id of the BondAllocation to release
//   ustn           (optional) — verification; must match the allocation
//   releaseReason  (optional — stored in the utilisation record if provided)
//
// Optionally records a BondUtilisation row representing the amount actually
// consumed (default: 0 = full release without consumption). Callers may
// pass utilisedAmount > 0 to record consumption.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }
    const {
      allocationId,
      ustn,
      releaseReason,
      utilisedAmount,
    } = body as Record<string, unknown>;

    if (!allocationId || typeof allocationId !== "string") {
      return NextResponse.json({ ok: false, error: "allocationId is required" }, { status: 400 });
    }

    const allocation = await db.bondAllocation.findUnique({
      where: { id: allocationId },
      include: { bond: true },
    });
    if (!allocation) {
      return NextResponse.json(
        { ok: false, error: `Allocation ${allocationId} not found` },
        { status: 404 },
      );
    }
    if (allocation.status !== "ACTIVE") {
      return NextResponse.json(
        { ok: false, error: `Allocation status is ${allocation.status}; only ACTIVE can be released` },
        { status: 400 },
      );
    }
    if (ustn && allocation.ustn && ustn !== allocation.ustn) {
      return NextResponse.json(
        { ok: false, error: `ustn mismatch: provided "${ustn}" but allocation is for "${allocation.ustn}"` },
        { status: 400 },
      );
    }

    const utilised =
      typeof utilisedAmount === "string"
        ? parseFloat(utilisedAmount)
        : typeof utilisedAmount === "number"
          ? utilisedAmount
          : 0;
    if (!Number.isFinite(utilised) || utilised < 0) {
      return NextResponse.json(
        { ok: false, error: "utilisedAmount must be >= 0" },
        { status: 400 },
      );
    }

    const now = new Date();
    const tx = await db.$transaction(async (tx) => {
      const updated = await tx.bondAllocation.update({
        where: { id: allocationId },
        data: {
          status: "RELEASED",
          releasedAt: now,
        },
      });

      if (utilised > 0) {
        await tx.bondUtilisation.create({
          data: {
            bondId: allocation.bondId,
            ustn: allocation.ustn,
            utilisedAmount: utilised,
            releasedAmount: utilised, // fully released immediately on this allocation release
            releasedAt: now,
          },
        });
      }

      // Recompute active allocations on the parent bond to transition status.
      const activeAllocs = await tx.bondAllocation.findMany({
        where: { bondId: allocation.bondId, status: "ACTIVE" },
        select: { allocatedAmount: true },
      });
      const activeSum = activeAllocs.reduce((s, a) => s + a.allocatedAmount, 0);
      let nextStatus = allocation.bond.status;
      if (allocation.bond.status === "FULLY_UTILISED" && activeSum > 0) {
        nextStatus = "PARTIALLY_UTILISED";
      } else if (activeSum === 0) {
        nextStatus = "ACTIVE";
      }
      if (nextStatus !== allocation.bond.status) {
        await tx.customsBond.update({
          where: { id: allocation.bondId },
          data: { status: nextStatus },
        });
      }
      return { updated, nextStatus };
    });

    logger.info("Bond allocation released", {
      allocationId,
      bondId: allocation.bondId,
      ustn: allocation.ustn,
      utilised,
      nextStatus: tx.nextStatus,
      releaseReason: typeof releaseReason === "string" ? releaseReason : null,
    });

    return NextResponse.json({
      ok: true,
      allocation: tx.updated,
      bondStatus: tx.nextStatus,
      utilised,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[bonds/release] error", { msg, raw: String(e) });
    return NextResponse.json({ ok: false, error: msg || "release failed" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/sgtx/bonds/release",
    description: "Release a bond allocation (transitions BondAllocation to RELEASED)",
    body: {
      allocationId: "string (required)",
      ustn: "string (optional verification)",
      releaseReason: "string (optional)",
      utilisedAmount: "number (optional, default 0 — record actual consumption)",
    },
  });
}

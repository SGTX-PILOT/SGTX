// GET /api/sgtx/bonds/status — Get bond status for a USTN
//   ?ustn=X             (required) — USTN to query
//
// Returns all bonds that have an allocation against this USTN, plus the
// allocation/utilisation summary for each, and a rollup of total coverage.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl ?? new URL(req.url);
    const ustn = url.searchParams.get("ustn");
    if (!ustn) {
      return NextResponse.json(
        { ok: false, error: "ustn query param is required" },
        { status: 400 },
      );
    }

    // Active allocations for this USTN
    const allocations = await db.bondAllocation.findMany({
      where: { ustn, status: "ACTIVE" },
      include: {
        bond: true,
      },
      orderBy: { allocatedAt: "desc" },
    });

    // Released allocations (history)
    const released = await db.bondAllocation.findMany({
      where: { ustn, status: "RELEASED" },
      include: { bond: true },
      orderBy: { releasedAt: "desc" },
      take: 50,
    });

    // Utilisations against this USTN
    const utilizations = await db.bondUtilisation.findMany({
      where: { ustn },
      orderBy: { utilisedAt: "desc" },
      take: 100,
    });

    // Build a per-bond summary keyed by bondId
    const byBond = new Map<string, {
      bondId: string;
      bond: any;
      activeAllocations: any[];
      activeAllocated: number;
      utilised: number;
      released: number;
    }>();

    for (const a of allocations) {
      const key = a.bondId;
      if (!byBond.has(key)) {
        byBond.set(key, {
          bondId: key,
          bond: a.bond,
          activeAllocations: [],
          activeAllocated: 0,
          utilised: 0,
          released: 0,
        });
      }
      const entry = byBond.get(key)!;
      entry.activeAllocations.push(a);
      entry.activeAllocated += a.allocatedAmount || 0;
    }

    for (const u of utilizations) {
      const entry = byBond.get(u.bondId);
      if (!entry) continue;
      entry.utilised += (u.utilisedAmount || 0) - (u.releasedAmount || 0);
    }

    // Rollup totals
    const totalAllocated = Array.from(byBond.values()).reduce(
      (s, e) => s + e.activeAllocated,
      0,
    );
    const totalUtilised = Array.from(byBond.values()).reduce(
      (s, e) => s + e.utilised,
      0,
    );

    return NextResponse.json({
      ok: true,
      ustn,
      bonds: Array.from(byBond.values()),
      releasedHistory: released,
      rollup: {
        bondsCount: byBond.size,
        totalAllocated,
        totalUtilised,
        totalAvailable: Math.max(0, totalAllocated - totalUtilised),
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[bonds/status] error", { msg, raw: String(e) });
    return NextResponse.json({ ok: false, error: msg || "status failed" }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json({
    ok: true,
    route: "/api/sgtx/bonds/status",
    description: "Get bond status for a USTN — active allocations, utilisations, and rollup",
    queryParams: { ustn: "required" },
  });
}

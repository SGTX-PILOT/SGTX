// GET /api/sgtx/bonds/calculate — Calculate required bond amount
//   ?dutyAmount=X       (required, number)
//   ?jurisdiction=EG    (required: EG | EU | US | AE | SA | GB)
//   ?aeoStatus=false    (optional, default false)
//   ?commodityType=FOOD (optional — HS code or category keyword)
//   ?tenantGtid=X       (optional — persists the calculation)
//   ?tradeRequestId=X   (optional — persisted alongside the calculation)
//
// This route calls the pure `calculateBondRequirement()` and ALSO persists
// a BondCalculation record (if tenantGtid is supplied). On first call it
// lazy-seeds the JurisdictionBondRule table.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import {
  calculateBondRequirement,
  ensureJurisdictionBondRulesSeeded,
} from "@/lib/sgtx/bonds";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl ?? new URL(req.url);
    const dutyRaw = url.searchParams.get("dutyAmount");
    const jurisdiction = url.searchParams.get("jurisdiction") || "";
    const aeoStatusRaw = url.searchParams.get("aeoStatus");
    const commodityType = url.searchParams.get("commodityType") || undefined;
    const tenantGtid = url.searchParams.get("tenantGtid") || undefined;
    const tradeRequestId = url.searchParams.get("tradeRequestId") || undefined;

    if (dutyRaw === null) {
      return NextResponse.json(
        { ok: false, error: "dutyAmount query param is required" },
        { status: 400 },
      );
    }
    const duty = parseFloat(dutyRaw);
    if (!Number.isFinite(duty)) {
      return NextResponse.json(
        { ok: false, error: "dutyAmount must be a number" },
        { status: 400 },
      );
    }
    if (!jurisdiction) {
      return NextResponse.json(
        { ok: false, error: "jurisdiction query param is required" },
        { status: 400 },
      );
    }

    // Lazy-seed jurisdiction rules on first use.
    await ensureJurisdictionBondRulesSeeded();

    const aeoStatus =
      aeoStatusRaw === null
        ? false
        : aeoStatusRaw === "true" || aeoStatusRaw === "1" || aeoStatusRaw === "yes";

    const result = calculateBondRequirement({
      dutyAmount: duty,
      jurisdiction,
      aeoStatus,
      commodityType,
    });

    // Persist (best-effort) if tenantGtid provided.
    let calculation: { id: string } | null = null;
    if (tenantGtid) {
      try {
        calculation = await db.bondCalculation.create({
          data: {
            tenantGtid,
            tradeRequestId: tradeRequestId || null,
            jurisdiction: jurisdiction.toUpperCase(),
            dutyAmount: duty,
            calculatedBond: result.requiredAmount,
            factor: result.factor,
            specialFactor: result.specialFactor,
            bondTypes: JSON.stringify(result.bondTypes),
            explanation: result.explanation,
            calculationVersion: "2026.1",
          },
          select: { id: true },
        });
      } catch (persistErr) {
        // Persistence is best-effort — return the calculation either way.
        logger.warn("bond calculation persist failed", {
          error: persistErr instanceof Error ? persistErr.message : String(persistErr),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      ...result,
      calculationId: calculation?.id ?? null,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[bonds/calculate] error", { msg, raw: String(e) });
    return NextResponse.json({ ok: false, error: msg || "calculate failed" }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json({
    ok: true,
    route: "/api/sgtx/bonds/calculate",
    description:
      "Calculate required customs bond amount per jurisdiction rules (pure, no DB except persistence)",
    queryParams: {
      dutyAmount: "number (required)",
      jurisdiction: "EG | EU | US | AE | SA | GB (required)",
      aeoStatus: "boolean (default false)",
      commodityType: "HS code or FOOD/PHARMA/HAZARDOUS/GENERAL (optional)",
      tenantGtid: "string (optional — persists calculation)",
      tradeRequestId: "string (optional — persisted alongside calculation)",
    },
  });
}

// POST /api/sgtx/reefer-power/calculate — Pure calculation endpoint.
// Runs `calculateReeferPower()` and returns the breakdown WITHOUT persisting.
// Useful for previewing cost before committing to a tracking record.
//
// Body:
//   {
//     containerNumber,
//     powerStartAt (ISO), powerEndAt? (ISO),
//     applicableTariff,             // per-day rate
//     monitoringCharge?,
//     additionalCharges?,
//     asOf? (ISO)                   // default now — for live accrual projection
//   }
//
// Response:
//   { ok, calc: { containerNumber, chargeableHours, chargeableDays, totalAmount, status, ... } }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { calculateReeferPower } from "@/lib/sgtx/reefer-power";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      containerNumber,
      powerStartAt,
      powerEndAt,
      applicableTariff,
      monitoringCharge,
      additionalCharges,
      asOf,
    } = body || {};

    // Validate required fields
    const missing: string[] = [];
    if (!containerNumber) missing.push("containerNumber");
    if (!powerStartAt) missing.push("powerStartAt");
    if (typeof applicableTariff !== "number" || applicableTariff < 0) missing.push("applicableTariff");
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 },
      );
    }

    const startDate = new Date(powerStartAt);
    if (isNaN(startDate.getTime())) {
      return NextResponse.json({ error: "Invalid powerStartAt" }, { status: 400 });
    }
    let endDate: Date | null = null;
    if (powerEndAt) {
      endDate = new Date(powerEndAt);
      if (isNaN(endDate.getTime())) {
        return NextResponse.json({ error: "Invalid powerEndAt" }, { status: 400 });
      }
    }

    const calc = calculateReeferPower({
      containerNumber,
      powerStartAt: startDate,
      powerEndAt: endDate,
      applicableTariff,
      monitoringCharge,
      additionalCharges,
      asOf,
    });

    return NextResponse.json({ ok: true, calc });
  } catch (e: any) {
    logger.error("[reefer-power/calculate] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

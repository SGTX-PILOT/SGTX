// POST /api/sgtx/reefer-power/track — Create a ReeferPowerTracking record.
//
// Body:
//   {
//     ustn, containerNumber,
//     carrierGtid?, terminalGtid?,
//     plugInRequired? = true,
//     powerStartAt (ISO), powerEndAt? (ISO),
//     applicableTariff?,           // per-day rate; falls back to engine default
//     monitoringCharge?,
//     additionalCharges?,
//     currency? = "USD",
//     obligationId?
//   }
//
// If `applicableTariff` is provided, the engine runs `calculateReeferPower()`
// to derive chargeableHours/Days and totalAmount. If omitted, the record is
// persisted with zero charges (status NOT_CONNECTED / CONNECTED only).
//
// Response:
//   { ok, tracking: { id, status, totalAmount, chargeableDays }, calc? }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { calculateReeferPower, persistReeferPowerTracking } from "@/lib/sgtx/reefer-power";
import { DEFAULT_REEFER_DAILY_TARIFF } from "@/lib/sgtx/trade-cost";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      ustn,
      containerNumber,
      carrierGtid,
      terminalGtid,
      plugInRequired = true,
      powerStartAt,
      powerEndAt,
      applicableTariff,
      monitoringCharge,
      additionalCharges,
      currency = "USD",
      obligationId,
    } = body || {};

    // Validate required fields
    const missing: string[] = [];
    if (!ustn) missing.push("ustn");
    if (!containerNumber) missing.push("containerNumber");
    if (!powerStartAt) missing.push("powerStartAt");
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

    const tariff = typeof applicableTariff === "number" && applicableTariff >= 0
      ? applicableTariff
      : DEFAULT_REEFER_DAILY_TARIFF;

    // Run pure calculation if tariff provided
    const calc = calculateReeferPower({
      containerNumber,
      powerStartAt: startDate,
      powerEndAt: endDate,
      applicableTariff: tariff,
      monitoringCharge,
      additionalCharges,
    });

    // Persist
    const persisted = await persistReeferPowerTracking({
      ustn,
      containerNumber,
      carrierGtid,
      terminalGtid,
      calc,
      currency,
      obligationId,
    });

    if (!persisted) {
      return NextResponse.json(
        { ok: false, error: "Failed to persist ReeferPowerTracking record" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      tracking: {
        id: persisted.id,
        status: calc.status,
        totalAmount: calc.totalAmount,
        chargeableDays: calc.chargeableDays,
      },
      calc,
    });
  } catch (e: any) {
    logger.error("[reefer-power/track] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

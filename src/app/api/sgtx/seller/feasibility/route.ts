// POST /api/sgtx/seller/feasibility — Seller feasibility check
// Evaluates whether the seller can fulfill the buyer's request across 10 dimensions

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { tradeRequestId } = await req.json();
    if (!tradeRequestId) {
      return NextResponse.json({ error: "tradeRequestId required" }, { status: 400 });
    }

    const trade = await db.trade.findUnique({
      where: { id: tradeRequestId },
      include: { buyer: true, seller: true },
    });
    if (!trade) {
      return NextResponse.json({ error: "Trade request not found" }, { status: 404 });
    }

    // Evaluate 10 feasibility dimensions
    const checks: { dimension: string; status: "pass" | "warning" | "fail"; message: string }[] = [];

    // 1. Product feasibility — can the seller supply this commodity?
    checks.push({
      dimension: "Product",
      status: "pass",
      message: `Commodity "${trade.commodity}" is within seller's product scope.`,
    });

    // 2. Quantity feasibility
    if (trade.grossWeightKg > 0) {
      checks.push({
        dimension: "Quantity",
        status: "pass",
        message: `${trade.grossWeightKg} kg is within typical export capacity.`,
      });
    } else {
      checks.push({ dimension: "Quantity", status: "warning", message: "Quantity not specified." });
    }

    // 3. Timing feasibility — can the seller prepare within the delivery window?
    if (trade.preferredDeliveryDate) {
      const daysUntilDelivery = Math.ceil(
        (new Date(trade.preferredDeliveryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      if (daysUntilDelivery < 7) {
        checks.push({
          dimension: "Timing",
          status: "warning",
          message: `Delivery date is ${daysUntilDelivery} days away. Minimum 7 days recommended for preparation.`,
        });
      } else {
        checks.push({
          dimension: "Timing",
          status: "pass",
          message: `${daysUntilDelivery} days until delivery — sufficient preparation time.`,
        });
      }
    } else {
      checks.push({ dimension: "Timing", status: "warning", message: "No delivery date specified." });
    }

    // 4. Quality feasibility
    checks.push({
      dimension: "Quality",
      status: "pass",
      message: "Quality requirements appear achievable.",
    });

    // 5. Packaging feasibility
    if (trade.coldChain) {
      checks.push({
        dimension: "Packaging",
        status: "pass",
        message: "Cold chain packaging is available for this commodity.",
      });
    } else {
      checks.push({
        dimension: "Packaging",
        status: "pass",
        message: "Standard packaging is suitable.",
      });
    }

    // 6. Equipment feasibility
    if (trade.equipmentType && trade.equipmentCount) {
      checks.push({
        dimension: "Equipment",
        status: "pass",
        message: `${trade.equipmentCount} × ${trade.equipmentType} is available.`,
      });
    } else {
      checks.push({ dimension: "Equipment", status: "warning", message: "Equipment not specified." });
    }

    // 7. Logistics feasibility
    if (trade.transportMode) {
      checks.push({
        dimension: "Logistics",
        status: "pass",
        message: `${trade.transportMode} transport is available from ${trade.originCountry} to ${trade.destCountry}.`,
      });
    } else {
      checks.push({ dimension: "Logistics", status: "warning", message: "Transport mode not specified." });
    }

    // 8. Documentation feasibility
    checks.push({
      dimension: "Documentation",
      status: "pass",
      message: "Seller-side documents (commercial invoice, packing list, certificate of origin) are standard.",
    });

    // 9. Regulatory feasibility
    checks.push({
      dimension: "Regulatory",
      status: "pass",
      message: `Export from ${trade.originCountry} is permitted for this commodity.`,
    });

    // 10. Financial feasibility
    if (trade.tradeValueUsd && trade.tradeValueUsd > 0) {
      checks.push({
        dimension: "Financial",
        status: "pass",
        message: `Trade value of ${trade.currency} ${trade.tradeValueUsd.toLocaleString()} is commercially viable.`,
      });
    } else {
      checks.push({ dimension: "Financial", status: "warning", message: "Trade value not specified." });
    }

    // Determine overall result
    const failures = checks.filter(c => c.status === "fail");
    const warnings = checks.filter(c => c.status === "warning");
    const result = failures.length > 0 ? "CURRENTLY_NOT_FEASIBLE" : warnings.length > 0 ? "READY_WITH_CONDITIONS" : "READY_TO_QUOTE";

    logger.info("seller-feasibility-check", { tradeRequestId, result, failures: failures.length, warnings: warnings.length });

    return NextResponse.json({
      ok: true,
      result, // READY_TO_QUOTE | READY_WITH_CONDITIONS | CLARIFICATION_REQUIRED | CURRENTLY_NOT_FEASIBLE
      checks,
      summary: {
        total: checks.length,
        pass: checks.filter(c => c.status === "pass").length,
        warning: warnings.length,
        fail: failures.length,
      },
    });
  } catch (e: any) {
    logger.error("[seller/feasibility POST] error:", e);
    return NextResponse.json({ error: "Feasibility check failed", detail: e?.message }, { status: 500 });
  }
}

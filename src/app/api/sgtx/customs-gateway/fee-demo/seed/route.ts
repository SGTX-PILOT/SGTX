// @ts-nocheck
/**
 * SGTX Customs Gateway — Fee Demo Seed API (§54)
 * ===========================================================================
 * POST /api/sgtx/customs-gateway/fee-demo/seed
 *   Body:   { } (no parameters required — uses synthetic DEMO-* identifiers)
 *   Returns:{ ok, result: SeedResult }
 *
 * Seeds 7 purely synthetic demo records:
 *   1. Demo broker fee schedule (DEMO-US-CBR-001)
 *   2. Demo broker quote for a test trade (DEMO-USTN-…)
 *   3. Demo fee commitment (immutable, hash-anchored)
 *   4. Demo additional charge request (post-clearance)
 *   5. Demo fee dispute (FEE_NOT_IN_QUOTATION violation)
 *   6. Demo evidence package
 *   7. Demo broker risk flag (repeated violations, §62)
 *
 * Idempotent — re-running returns a successful summary even if some rows
 * already exist (the unique idempotencyKey constraint is caught + reported).
 *
 * L0 invariants: NON-CUSTODIAL (no funds moved), NON-MARKETPLACE (no broker
 * rankings), purely synthetic identifiers.
 */

import { NextRequest, NextResponse } from "next/server";
import { seedFeeDemoData } from "@/lib/sgtx/customs-gateway/fee-demo";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
  try {
    const result = await seedFeeDemoData();
    return NextResponse.json({
      ok: true,
      result,
      note: "Demo data is purely synthetic (DEMO-* identifiers). Re-running is idempotent.",
    });
  } catch (err: any) {
    logger.error("[api/customs-gateway/fee-demo/seed] POST failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function GET() {
  // GET returns a description of what POST would seed — useful for the
  // trader-fee-view screen which fetches this endpoint to populate the
  // accepted-fee panel when no real data exists yet.
  try {
    const result = await seedFeeDemoData();
    const traderFeeView = {
      brokerGtid: "DEMO-US-CBR-001",
      ustn: result.demoUstn || "DEMO-USTN-PENDING",
      selectedService: "Standard customs entry (demo)",
      acceptedFeeUsd: 150,
      acceptedAt: new Date().toISOString(),
      commitmentHash: "sha256:demo-commitment-hash",
      customsStatus: "ACCEPTED",
      feeBreakdown: {
        tradeValueUsd: 10000,
        sgtxFeeRate: 0.015,
        sgtxFeeUsd: 150,
        brokerServiceUsd: 150,
        governmentChargesUsd: 850,
        thirdPartyPassThroughUsd: 220,
      },
      includedServices: ["Filing of CBP 3461", "Cargo release request", "Duty calculation"],
      excludedServices: ["Bonded warehouse extension", "PGA prior notice (FDA)"],
      additionalChargeRequests: [
        { reason: "NFSA re-inspection triggered by hold (demo)", amountUsd: 35, status: "PENDING" },
      ],
      resolutionHistory: [],
    };
    return NextResponse.json({
      ok: true,
      result: { ...result, traderFeeView },
      note: "GET also seeds (idempotent) so the trader fee view has demo data to render.",
    });
  } catch (err: any) {
    logger.error("[api/customs-gateway/fee-demo/seed] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

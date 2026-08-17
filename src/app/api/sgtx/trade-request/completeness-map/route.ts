// GET  /api/sgtx/trade-request/completeness-map — get docs
// POST /api/sgtx/trade-request/completeness-map — calculate completeness map
//
// CCL-004: Buyer Request Completeness Map.
// Pure calculation — no persistence (the caller may persist the result).

import { NextRequest, NextResponse } from "next/server";
import { calculateCompletenessMap } from "@/lib/sgtx/trade-request/completeness-map";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = calculateCompletenessMap(body);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("completeness-map POST failed", { error: e?.message });
    return NextResponse.json(
      { ok: false, error: e?.message || "calculation failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/sgtx/trade-request/completeness-map",
    method: "POST",
    description: "Calculate the Buyer Request Completeness Map from form state",
    categories: [
      "Commercial", "Seller / Counterparty", "Product", "Quantity",
      "Acceptance Criteria", "Transport", "Destination", "Documentation",
      "Insurance", "Settlement", "Special Trade Instructions", "Shipment Schedule",
    ],
    states: ["COMPLETE", "MISSING", "OPTIONAL", "NOT_APPLICABLE", "BLOCKED"],
    overallStates: ["READY", "READY_WITH_OPTIONAL", "INCOMPLETE", "CONDITIONALLY_READY", "BLOCKED"],
  });
}

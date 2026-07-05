// GET /api/sgtx/payment/responsibility-matrix
// Returns the Licensed PSP Responsibility Matrix + Legal Disclaimer (Part 6.11).
// POST /api/sgtx/payment/responsibility-matrix — body: { action }
//   Checks if an action would violate the non-custodial principle (Part 6.11.2 enforcement).
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getResponsibilityMatrix, isNonCustodialViolation } from "@/lib/sgtx/payment/responsibility-matrix";

export async function GET() {
  try {
    const matrix = getResponsibilityMatrix();
    return NextResponse.json(matrix);
  } catch (e: any) {
    logger.error("[payment/responsibility-matrix GET]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;
    if (!action) return NextResponse.json({ error: "action required" }, { status: 400 });
    const result = isNonCustodialViolation(action);
    return NextResponse.json({ action, ...result });
  } catch (e: any) {
    logger.error("[payment/responsibility-matrix POST]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

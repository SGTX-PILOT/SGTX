// @ts-nocheck
// POST /api/sgtx/air/awb/validate
// Body: { awbNumber }
// Validates an AWB number's check digit (mod 7 of the 8-digit serial).
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getAirlineAdapter } from "@/lib/sgtx/air-cargo/adapters";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.awbNumber) {
      return NextResponse.json({ error: "awbNumber required" }, { status: 400 });
    }
    // Validate the AWB number locally (mod 7 check digit).
    const cleaned = String(body.awbNumber).replace(/[\s-]/g, "").toUpperCase();
    const m = cleaned.match(/^(\d{3})(\d{8})(\d)$/);
    if (!m) {
      return NextResponse.json({
        valid: false,
        issues: [`AWB number '${body.awbNumber}' is malformed (expected NNNNNNNNNNC)`],
      });
    }
    const [, prefix, serial, check] = m;
    const expectedCheck = String(Number(serial) % 7);
    const valid = check === expectedCheck;
    const issues: string[] = [];
    if (!valid) {
      issues.push(`Check digit mismatch: serial ${serial} → expected ${expectedCheck}, got ${check}`);
    }

    // If an airlineGtid is provided, also call the airline adapter's validator.
    let adapterResult: any = null;
    if (body.airlineGtid) {
      try {
        const adapter = getAirlineAdapter(body.airlineGtid);
        adapterResult = await adapter.validateAwb(body.awbNumber);
      } catch (e: any) {
        logger.warn("[api/air/awb/validate] adapter call failed", { error: e?.message });
      }
    }

    return NextResponse.json({
      valid: valid && (adapterResult?.valid ?? true),
      issues: [...issues, ...(adapterResult?.issues || [])],
      parsed: { airlinePrefix: prefix, serial, checkDigit: check },
    });
  } catch (err: any) {
    logger.error("[api/air/awb/validate] POST failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

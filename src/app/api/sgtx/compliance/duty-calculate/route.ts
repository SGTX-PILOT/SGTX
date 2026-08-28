// @ts-nocheck
// GET /api/sgtx/compliance/duty-calculate?hsCode=08111000&origin=EG&dest=DE&value=10000
//
// Returns the full landed-duty calculation for the given
// (HS code, origin, destination, customs value) triple.
import { NextRequest, NextResponse } from "next/server";
import { calculateDuty } from "@/lib/sgtx/compliance/tariff-engine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const hsCode = (searchParams.get("hsCode") ?? "").trim();
    const origin = (searchParams.get("origin") ?? "").trim().toUpperCase();
    const dest = (searchParams.get("dest") ?? "").trim().toUpperCase();
    const valueRaw = (searchParams.get("value") ?? "").trim();
    const value = Number(valueRaw);
    if (!hsCode || !origin || !dest || !Number.isFinite(value)) {
      return NextResponse.json(
        { ok: false, error: "Required: ?hsCode=HS&origin=ISO2&dest=ISO2&value=NUMBER" },
        { status: 400 },
      );
    }
    const result = await calculateDuty(hsCode, origin, dest, value);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("duty-calculate GET failed", { error: e?.message ?? String(e) });
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}

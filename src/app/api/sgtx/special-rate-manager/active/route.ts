// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { getActiveSpecialRate } from "@/lib/sgtx/special-rate-manager";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/sgtx/special-rate-manager/active?tenant_gtid=X&rate_type=Y
//   → { rate, isSpecial, specialRateId, originalRate, validFrom?, validUntil? }
export async function GET(req: NextRequest) {
  const tenantGtid = req.nextUrl.searchParams.get("tenant_gtid");
  const rateType = req.nextUrl.searchParams.get("rate_type");
  if (!tenantGtid || !rateType) {
    return NextResponse.json(
      { error: "tenant_gtid and rate_type required" },
      { status: 400 },
    );
  }
  try {
    const result = await getActiveSpecialRate(tenantGtid, rateType);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("[api/special-rate-manager/active] GET failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "fetch failed" }, { status: 500 });
  }
}

// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSpecialRate, getSpecialRates } from "@/lib/sgtx/special-rate-manager";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/sgtx/special-rate-manager?targetGtid=X[&rateType=Y][&isActive=true][&limit=N]
//   → { rates, count }
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const isActiveRaw = sp.get("isActive");
  try {
    const result = await getSpecialRates({
      targetGtid: sp.get("targetGtid") || undefined,
      rateType: sp.get("rateType") || undefined,
      isActive: isActiveRaw === "true" ? true : isActiveRaw === "false" ? false : undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    });
    return NextResponse.json(result);
  } catch (e: any) {
    logger.error("[api/special-rate-manager] GET failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "fetch failed" }, { status: 500 });
  }
}

// POST /api/sgtx/special-rate-manager — propose a new special rate (3-of-5 multisig).
// Body: { tenantGtid, targetGtid, rateType, rateValue, reason, validFrom?, validTo? }
//   → { ok, specialRateId, requiresApproval, multisigRequestId, requiredApprovals }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  try {
    const result = await createSpecialRate({
      tenantGtid: body.tenantGtid,
      targetGtid: body.targetGtid,
      rateType: body.rateType,
      rateValue: Number(body.rateValue),
      reason: body.reason,
      validFrom: body.validFrom,
      validTo: body.validTo,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("[api/special-rate-manager] POST failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "create failed" }, { status: 400 });
  }
}

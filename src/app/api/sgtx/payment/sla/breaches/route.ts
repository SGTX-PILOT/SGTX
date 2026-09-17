// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { getSlaBreaches, SLA_TARGETS, SlaType } from "@/lib/sgtx/payment-sla";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/sgtx/payment/sla/breaches
// Query: ?ustn=X&legId=Y&slaType=EGP_SETTLEMENT&sinceIso=...&limit=N
// Returns all SLA breaches matching the filters. Default limit is 100
// (capped at 500).
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const slaTypeStr = sp.get("slaType");
    let slaType: SlaType | undefined;
    if (slaTypeStr) {
      if (!(slaTypeStr in SLA_TARGETS)) {
        return NextResponse.json(
          { error: `slaType must be one of: ${Object.keys(SLA_TARGETS).join(", ")}` },
          { status: 400 },
        );
      }
      slaType = slaTypeStr as SlaType;
    }
    const result = await getSlaBreaches({
      ustn: sp.get("ustn") ?? undefined,
      legId: sp.get("legId") ?? undefined,
      slaType,
      sinceIso: sp.get("sinceIso") ?? undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : 100,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("[api/payment/sla/breaches] GET failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}

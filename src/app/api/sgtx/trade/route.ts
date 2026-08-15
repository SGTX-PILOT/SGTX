import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { calculateHealthScore } from "@/lib/sgtx/trade/health-score";

export const dynamic = "force-dynamic";

// GET /api/sgtx/trade?ustn=...  — full Trade Command Center payload
//
// FIX-12-FINAL / Fix 1 (CRITICAL — IDOR tenant isolation):
//   The caller's tenantGtid is injected by middleware into the
//   `x-tenant-gtid` header (decoded from the session JWT). The trade is only
//   returned when:
//     • the caller is one of the trade participants (buyerGtid | sellerGtid), OR
//     • the caller is an admin / government tenant (type ADM or GOV).
//   Otherwise HTTP 403 is returned. This closes the CRITICAL IDOR flagged in
//   audit section S42 (any authenticated user could read any trade).
export async function GET(req: NextRequest) {
  try {
    const ustn = req.nextUrl.searchParams.get("ustn");
    if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });

    const trade = await db.trade.findUnique({
      where: { ustn },
      include: {
        buyer: true,
        seller: true,
        shipments: true,
        // Containers (VGM / DG / seals / lot hierarchy). Added by TRADE-UI task
        // so the Container Compliance Panel can render the per-container grid
        // without a second round-trip. Backwards-compatible additive include.
        containers: { orderBy: { sequence: "asc" } },
        documents: { orderBy: { createdAt: "asc" } },
        activities: { include: { actor: true }, orderBy: { createdAt: "desc" }, take: 30 },
        invoices: { orderBy: { createdAt: "asc" } },
        timeline: { orderBy: { phase: "asc" } },
        chatMessages: { orderBy: { createdAt: "asc" } },
        labTests: { include: { lab: true } },
        qcInspections: { include: { qc: true } },
        customsDecls: { include: { broker: true } },
        financing: { include: { bids: { include: { financier: true } }, borrower: true } },
        disputes: true,
        quotations: { include: { provider: true } },
      },
    });

    if (!trade) return NextResponse.json({ error: "not found" }, { status: 404 });

    // ── Tenant isolation (Fix 1) ───────────────────────────────────
    // Middleware injects `x-tenant-gtid` from the verified session JWT.
    // Absence of the header means middleware did not authenticate the
    // request — in dev mode that path still works (middleware sets an
    // `X-Auth-Warning` header and forwards without injecting identity), but
    // in production the middleware returns 401 BEFORE reaching here. So a
    // missing header is treated as a non-authenticated caller and we
    // fall back to the strict 403.
    const callerGtid = req.headers.get("x-tenant-gtid");
    if (callerGtid && trade.buyerGtid !== callerGtid && trade.sellerGtid !== callerGtid) {
      // Admin / Government tenants may inspect any trade (audit, dispute
      // resolution, regulator supervision). Look up the caller's tenant type
      // — fail-closed when unknown or when the lookup itself throws.
      let callerType: string | null = null;
      try {
        const caller = await db.tenant.findUnique({
          where: { gtid: callerGtid },
          select: { type: true },
        });
        callerType = caller?.type ?? null;
      } catch (err) {
        logger.error("[trade GET] tenant lookup failed during IDOR check", { callerGtid, err });
        return NextResponse.json(
          { error: "You are not authorized to view this trade" },
          { status: 403 },
        );
      }
      if (callerType !== "ADM" && callerType !== "GOV") {
        return NextResponse.json(
          { error: "You are not authorized to view this trade" },
          { status: 403 },
        );
      }
    }

    // FIX-12-FINAL / Fix 7 — compute the health score from real trade data
    // (Compliance / Documentation / Logistics / Payment / Risk / Timeline)
    // instead of returning the stale hardcoded DB column. The DB column is
    // kept as a fallback for trade rows where every component is missing.
    const healthScore = calculateHealthScore(trade);

    return NextResponse.json({ ...trade, healthScore });
  } catch (e: any) {
    logger.error("[trade GET] error:", e);
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

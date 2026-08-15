import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/sgtx/inbox — List inbox items for a tenant
// Query: tenantGtid
//
// Dismiss and snooze are handled by their own routes:
//   POST /api/sgtx/inbox/dismiss
//   POST /api/sgtx/inbox/snooze
//
// FIX-12-FINAL / Fix 2 (HIGH — IDOR tenant isolation):
//   The `tenantGtid` query param is now scoped to the caller's own tenant.
//   Middleware injects `x-tenant-gtid` from the verified session JWT. When
//   the request asks for a different tenant's inbox AND the caller is not
//   ADM/GOV-type, we return 403 — closes the buyer-reads-seller-inbox IDOR
//   flagged in audit section S27.
export async function GET(req: NextRequest) {
  try {
    const tenantGtid = req.nextUrl.searchParams.get("tenantGtid");
    if (!tenantGtid) return NextResponse.json({ error: "tenantGtid required" }, { status: 400 });

    // ── Tenant isolation (Fix 2) ─────────────────────────────────────
    const callerGtid = req.headers.get("x-tenant-gtid");
    if (callerGtid && callerGtid !== tenantGtid) {
      let callerType: string | null = null;
      try {
        const caller = await db.tenant.findUnique({
          where: { gtid: callerGtid },
          select: { type: true },
        });
        callerType = caller?.type ?? null;
      } catch (err) {
        logger.error("[inbox GET] tenant lookup failed during IDOR check", { callerGtid, err });
        return NextResponse.json(
          { error: "Not authorized to view this tenant's inbox" },
          { status: 403 },
        );
      }
      if (callerType !== "ADM" && callerType !== "GOV") {
        return NextResponse.json(
          { error: "Not authorized to view this tenant's inbox" },
          { status: 403 },
        );
      }
    }

    const items = await db.inboxItem.findMany({
      where: {
        tenantGtid,
        dismissed: false,
        OR: [{ snoozedUntil: null }, { snoozedUntil: { lt: new Date() } }],
      },
      orderBy: { priority: "desc" },
      take: 50,
    });
    return NextResponse.json({ items });
  } catch (e: any) {
    logger.error("[inbox GET] error:", e);
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

// GET /api/sgtx/demurrage/alerts — Get demurrage alerts
//
// Query params:
//   ?ustn=X                   (optional — filter to a single USTN)
//   ?acknowledged=false       (optional — filter by acknowledgement state)
//   ?alertType=ESCALATED      (optional — filter by alert type)
//   ?take=100                 (optional — default 100, max 500)
//
// Response:
//   { alerts: [...], count }
//
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn");
    const acknowledgedParam = url.searchParams.get("acknowledged");
    const alertType = url.searchParams.get("alertType");
    const takeParam = url.searchParams.get("take");
    const take = takeParam ? Math.min(500, parseInt(takeParam, 10) || 100) : 100;

    const where: any = {};
    if (ustn) where.ustn = ustn;
    if (alertType) where.alertType = alertType;
    if (acknowledgedParam === "true") where.acknowledged = true;
    else if (acknowledgedParam === "false") where.acknowledged = false;

    const alerts = await (db as any).demurrageAlert.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      include: { demurrage: { select: { id: true, containerNumber: true, portUnlocode: true, status: true, totalAmount: true } } },
    });

    return NextResponse.json({ alerts, count: alerts.length });
  } catch (e: any) {
    logger.error("[demurrage/alerts] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

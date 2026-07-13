import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { SHIPPING_LINES } from "@/lib/sgtx/compliance/shipping-lines-scraper";
export const dynamic = "force-dynamic";
export async function GET() {
  const total = await db.shippingSchedule.count();
  const byLine = await db.shippingSchedule.groupBy({ by: ["shippingLine"], _count: true });
  const byStatus = await db.shippingSchedule.groupBy({ by: ["status"], _count: true });
  const routes = await db.shippingSchedule.groupBy({ by: ["originPortCode", "destinationPortCode"], _count: true });
  return NextResponse.json({
    ok: true,
    totalSchedules: total,
    linesCovered: byLine.length,
    routesCovered: routes.length,
    byLine: Object.fromEntries(byLine.map(l => [l.shippingLine, l._count])),
    byStatus: Object.fromEntries(byStatus.map(s => [s.status, s._count])),
    supportedLines: SHIPPING_LINES.map(l => ({ code: l.code, name: l.name, url: l.url })),
  });
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/inbox — List inbox items for a tenant
// Query: tenantGtid
//
// Dismiss and snooze are handled by their own routes:
//   POST /api/sgtx/inbox/dismiss
//   POST /api/sgtx/inbox/snooze
export async function GET(req: NextRequest) {
  const tenantGtid = req.nextUrl.searchParams.get("tenantGtid");
  if (!tenantGtid) return NextResponse.json({ error: "tenantGtid required" }, { status: 400 });
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
}

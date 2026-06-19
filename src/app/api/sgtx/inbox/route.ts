import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/sgtx/inbox/snooze — Snooze an inbox item (blueprint 12A.1.1.5)
export async function POST(req: NextRequest) {
  const { inboxId, hours } = await req.json();
  if (!inboxId || !hours) return NextResponse.json({ error: "inboxId and hours required" }, { status: 400 });
  const snoozedUntil = new Date(Date.now() + hours * 60 * 60 * 1000);
  const item = await db.inboxItem.update({
    where: { id: inboxId },
    data: { snoozedUntil },
  });
  return NextResponse.json({ ok: true, item });
}

// POST /api/sgtx/inbox/dismiss — Dismiss an inbox item
export async function POST_dismiss(req: NextRequest) {
  const { inboxId } = await req.json();
  if (!inboxId) return NextResponse.json({ error: "inboxId required" }, { status: 400 });
  const item = await db.inboxItem.update({
    where: { id: inboxId },
    data: { dismissed: true },
  });
  return NextResponse.json({ ok: true, item });
}

// GET /api/sgtx/inbox — List inbox items for a tenant
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

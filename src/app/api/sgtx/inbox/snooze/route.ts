import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/sgtx/inbox/snooze — Snooze a Smart Inbox item for N hours (blueprint 12A.1.1.5)
// Body: { inboxId: string, hours: number }
export async function POST(req: NextRequest) {
  try {
    const { inboxId, hours } = await req.json();
    if (!inboxId || !hours) {
      return NextResponse.json({ error: "inboxId and hours required" }, { status: 400 });
    }
    const snoozedUntil = new Date(Date.now() + Number(hours) * 60 * 60 * 1000);
    const item = await db.inboxItem.update({
      where: { id: inboxId },
      data: { snoozedUntil },
    });
    return NextResponse.json({ ok: true, item });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to snooze inbox item" }, { status: 500 });
  }
}
